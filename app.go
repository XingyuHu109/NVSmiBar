package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type UpdateInfo struct {
	Available bool   `json:"available"`
	Latest    string `json:"latest"`
	URL       string `json:"url"`
}

type ConnectionTestResult struct {
	Success  bool   `json:"success"`
	Code     string `json:"code"`
	Message  string `json:"message"`
	GPUCount int    `json:"gpuCount"`
}

type ConnectionMeta struct {
	Status              string `json:"status"`
	LastSuccessTs       int64  `json:"lastSuccessTs"`
	ConsecutiveFailures int    `json:"consecutiveFailures"`
	NextRetryInSec      int    `json:"nextRetryInSec"`
	ErrorCode           string `json:"errorCode"`
	ErrorMessage        string `json:"errorMessage"`
	ActiveTarget        string `json:"activeTarget"`
	ActivePort          int    `json:"activePort"`
}

type WindowMode string

const (
	windowModeMini WindowMode = "mini"
	windowModeMain WindowMode = "main"

	miniWidth  = 380
	miniHeight = 500
	mainWidth  = 900
	mainHeight = 700
)

var retrySchedule = []time.Duration{
	2 * time.Second,
	5 * time.Second,
	10 * time.Second,
	20 * time.Second,
	30 * time.Second,
}

type App struct {
	ctx context.Context

	mu sync.Mutex

	connectionTarget string
	connectionPort   int

	windowMode WindowMode
	visible    bool

	stopCh    chan struct{}
	pollNowCh chan struct{}
}

func NewApp() *App {
	return &App{
		windowMode: windowModeMini,
		stopCh:     make(chan struct{}),
		pollNowCh:  make(chan struct{}, 1),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	go trayRun(a)
	go a.pollLoop()
}

func (a *App) shutdown(ctx context.Context) {
	close(a.stopCh)
}

// GetVersion returns the embedded application version.
func (a *App) GetVersion() string {
	return appVersion
}

// CheckForUpdate queries the GitHub releases API and returns update info.
func (a *App) CheckForUpdate() UpdateInfo {
	if appVersion == "dev" {
		return UpdateInfo{}
	}
	resp, err := http.Get("https://api.github.com/repos/XingyuHu109/NVSmiBar/releases/latest")
	if err != nil {
		return UpdateInfo{}
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return UpdateInfo{}
	}
	var data struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return UpdateInfo{}
	}
	if !isNewer(data.TagName, appVersion) {
		return UpdateInfo{}
	}
	return UpdateInfo{Available: true, Latest: data.TagName, URL: data.HTMLURL}
}

// DoUpdate attempts brew upgrade --cask, falling back to opening the releases page.
func (a *App) DoUpdate(releaseURL string) {
	go func() {
		runtime.EventsEmit(a.ctx, "update:status", "updating")

		brewPaths := []string{"/opt/homebrew/bin/brew", "/usr/local/bin/brew"}
		brewBin := ""
		for _, p := range brewPaths {
			if _, err := exec.LookPath(p); err == nil {
				brewBin = p
				break
			}
		}
		if brewBin == "" {
			if p, err := exec.LookPath("brew"); err == nil {
				brewBin = p
			}
		}

		if brewBin != "" {
			cmd := exec.Command(brewBin, "upgrade", "--cask", "XingyuHu109/tap/nvsmibar")
			if err := cmd.Run(); err == nil {
				runtime.EventsEmit(a.ctx, "update:status", "done")
				return
			}
		}

		runtime.BrowserOpenURL(a.ctx, releaseURL)
		runtime.EventsEmit(a.ctx, "update:status", "opened")
	}()
}

// isNewer returns true if latest tag is a higher semver than current.
func isNewer(latest, current string) bool {
	if current == "dev" {
		return false
	}
	parse := func(v string) []int {
		v = strings.TrimPrefix(v, "v")
		parts := strings.Split(v, ".")
		nums := make([]int, len(parts))
		for i, p := range parts {
			n, _ := strconv.Atoi(p)
			nums[i] = n
		}
		return nums
	}
	l, c := parse(latest), parse(current)
	for i := 0; i < len(l) && i < len(c); i++ {
		if l[i] > c[i] {
			return true
		}
		if l[i] < c[i] {
			return false
		}
	}
	return len(l) > len(c)
}

// SetHost is a backward-compatible shim for older frontend builds.
func (a *App) SetHost(host string) {
	target, port := parseLegacyHost(strings.TrimSpace(host))
	a.SetConnection(target, port)
}

func parseLegacyHost(raw string) (string, int) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", 0
	}
	idx := strings.LastIndex(raw, ":")
	if idx <= 0 || idx == len(raw)-1 {
		return raw, 22
	}
	port, err := strconv.Atoi(raw[idx+1:])
	if err != nil {
		return raw, 22
	}
	return raw[:idx], port
}

func (a *App) wakePollLoop() {
	select {
	case a.pollNowCh <- struct{}{}:
	default:
	}
}

// SetConnection updates the active SSH target and optional port.
func (a *App) SetConnection(target string, port int) {
	target = strings.TrimSpace(target)
	if target == "" {
		port = 0
	}
	a.mu.Lock()
	a.connectionTarget = target
	a.connectionPort = port
	a.mu.Unlock()
	a.wakePollLoop()
}

// RetryConnection triggers an immediate poll attempt.
func (a *App) RetryConnection() {
	a.wakePollLoop()
}

// TestConnection runs a preflight query and returns actionable status.
func (a *App) TestConnection(target string, port int) ConnectionTestResult {
	target = strings.TrimSpace(target)
	if target == "" {
		return ConnectionTestResult{
			Success: false,
			Code:    "invalid_input",
			Message: "Host is required",
		}
	}
	gpus, err := queryGPUs(target, port)
	if err != nil {
		code, msg := classifyConnectionError(err)
		return ConnectionTestResult{Success: false, Code: code, Message: msg}
	}
	return ConnectionTestResult{
		Success:  true,
		Code:     "ok",
		Message:  "Connection successful",
		GPUCount: len(gpus),
	}
}

// ListSSHConfigConnections discovers candidate aliases from local ssh config.
func (a *App) ListSSHConfigConnections() []SSHConfigConnection {
	connections, err := discoverSSHConfigConnections()
	if err != nil {
		return []SSHConfigConnection{}
	}
	return connections
}

// HideWindow hides the current window.
func (a *App) HideWindow() {
	a.hideWindow()
}

// ShowMiniWindow shows the tray-anchored popup mode.
func (a *App) ShowMiniWindow() {
	a.showMiniWindow()
}

// ShowMainWindow shows the full dashboard mode.
func (a *App) ShowMainWindow() {
	a.showMainWindow()
}

// HandleTrayClick applies mode-aware tray click behavior.
func (a *App) HandleTrayClick() {
	a.mu.Lock()
	visible := a.visible
	mode := a.windowMode
	a.mu.Unlock()

	if !visible {
		a.showMiniWindow()
		return
	}
	if mode == windowModeMini {
		a.hideWindow()
		return
	}
	a.showMiniWindow()
}

// UpdateTrayTitle updates the menu bar status item title.
func (a *App) UpdateTrayTitle(title string) {
	setTrayTitle(title)
}

// UpdateTrayData renders GPU metrics graphically in the menu bar (two-line stacked layout).
func (a *App) UpdateTrayData(temp, util, memUsed, memTotal int, status string) {
	setTrayGPUStatus(temp, util, memUsed, memTotal, status)
}

// Quit exits the application.
func (a *App) Quit() {
	runtime.Quit(a.ctx)
}

func (a *App) showMiniWindow() {
	x := getStatusItemRightX() - miniWidth
	if x < 0 {
		// Fallback: top-right of primary screen
		screens, err := runtime.ScreenGetAll(a.ctx)
		if err == nil && len(screens) > 0 {
			x = screens[0].Size.Width - miniWidth - 10
		}
	}
	if x < 0 {
		x = 0
	}

	runtime.WindowSetSize(a.ctx, miniWidth, miniHeight)
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	runtime.WindowSetPosition(a.ctx, x, 28)
	runtime.WindowShow(a.ctx)

	a.mu.Lock()
	a.visible = true
	a.windowMode = windowModeMini
	a.mu.Unlock()
	runtime.EventsEmit(a.ctx, "window:mode", string(windowModeMini))
}

func (a *App) showMainWindow() {
	runtime.WindowSetSize(a.ctx, mainWidth, mainHeight)
	runtime.WindowSetAlwaysOnTop(a.ctx, false)
	runtime.WindowCenter(a.ctx)
	runtime.WindowShow(a.ctx)

	a.mu.Lock()
	a.visible = true
	a.windowMode = windowModeMain
	a.mu.Unlock()
	runtime.EventsEmit(a.ctx, "window:mode", string(windowModeMain))
}

func (a *App) hideWindow() {
	runtime.WindowHide(a.ctx)
	a.mu.Lock()
	a.visible = false
	a.mu.Unlock()
}

func retryDelay(failureCount int) time.Duration {
	if failureCount <= 0 {
		return 0
	}
	idx := failureCount - 1
	if idx >= len(retrySchedule) {
		idx = len(retrySchedule) - 1
	}
	return retrySchedule[idx]
}

func classifyConnectionError(err error) (code string, msg string) {
	raw := strings.TrimSpace(err.Error())
	lower := strings.ToLower(raw)
	switch {
	case strings.Contains(lower, "permission denied"):
		return "auth_failed", "SSH auth failed. Check key-based access."
	case strings.Contains(lower, "host key verification failed"):
		return "host_key", "SSH host key not trusted. Connect once in terminal to confirm host."
	case strings.Contains(lower, "could not resolve hostname"):
		return "dns", "Host name could not be resolved. Check host alias and DNS."
	case strings.Contains(lower, "connection refused"):
		return "refused", "Connection refused by host. Check SSH service and port."
	case strings.Contains(lower, "timed out") || strings.Contains(lower, "operation timed out"):
		return "timeout", "Host unreachable. Check network or VPN and try again."
	case strings.Contains(lower, "nvidia-smi") && (strings.Contains(lower, "not found") || strings.Contains(lower, "command not found")):
		return "nvidia_smi_missing", "nvidia-smi not found on remote host."
	default:
		if raw == "" {
			raw = "Connection failed"
		}
		return "unknown", raw
	}
}

func (a *App) emitConnMeta(status string, lastSuccess time.Time, failures int, nextRetryAt time.Time, errCode string, errMsg string, target string, port int, now time.Time) {
	meta := ConnectionMeta{
		Status:              status,
		ConsecutiveFailures: failures,
		ErrorCode:           errCode,
		ErrorMessage:        errMsg,
		ActiveTarget:        target,
		ActivePort:          port,
	}
	if !lastSuccess.IsZero() {
		meta.LastSuccessTs = lastSuccess.Unix()
	}
	if !nextRetryAt.IsZero() && nextRetryAt.After(now) {
		remaining := int(nextRetryAt.Sub(now).Seconds())
		if remaining <= 0 {
			remaining = 1
		}
		meta.NextRetryInSec = remaining
	}
	runtime.EventsEmit(a.ctx, "gpu:conn_meta", meta)
}

func (a *App) pollLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	currentTarget := ""
	currentPort := 0
	status := "idle"
	var lastSuccess time.Time
	var nextRetryAt time.Time
	consecutiveFailures := 0
	lastErrCode := ""
	lastErrMsg := ""

	emitIdle := func(now time.Time) {
		a.emitConnMeta("idle", time.Time{}, 0, time.Time{}, "", "", "", 0, now)
	}

	emitIdle(time.Now())

	for {
		forcePoll := false
		now := time.Now()

		select {
		case <-a.stopCh:
			return
		case <-ticker.C:
		case <-a.pollNowCh:
			forcePoll = true
		}

		now = time.Now()
		a.mu.Lock()
		target := a.connectionTarget
		port := a.connectionPort
		a.mu.Unlock()

		if target == "" {
			status = "idle"
			currentTarget = ""
			currentPort = 0
			lastSuccess = time.Time{}
			nextRetryAt = time.Time{}
			consecutiveFailures = 0
			lastErrCode = ""
			lastErrMsg = ""
			emitIdle(now)
			continue
		}

		if target != currentTarget || port != currentPort {
			currentTarget = target
			currentPort = port
			status = "connecting"
			lastSuccess = time.Time{}
			nextRetryAt = time.Time{}
			consecutiveFailures = 0
			lastErrCode = ""
			lastErrMsg = ""
			forcePoll = true
			a.emitConnMeta(status, lastSuccess, consecutiveFailures, nextRetryAt, lastErrCode, lastErrMsg, target, port, now)
		}

		if !forcePoll && !nextRetryAt.IsZero() && now.Before(nextRetryAt) {
			a.emitConnMeta(status, lastSuccess, consecutiveFailures, nextRetryAt, lastErrCode, lastErrMsg, target, port, now)
			continue
		}

		if lastSuccess.IsZero() {
			status = "connecting"
			a.emitConnMeta(status, lastSuccess, consecutiveFailures, nextRetryAt, lastErrCode, lastErrMsg, target, port, now)
		}

		gpus, err := queryGPUs(target, port)
		if err == nil {
			runtime.EventsEmit(a.ctx, "gpu:data", gpus)
			lastSuccess = now
			nextRetryAt = time.Time{}
			consecutiveFailures = 0
			lastErrCode = ""
			lastErrMsg = ""
			status = "live"
			a.emitConnMeta(status, lastSuccess, consecutiveFailures, nextRetryAt, lastErrCode, lastErrMsg, target, port, now)
			continue
		}

		consecutiveFailures++
		lastErrCode, lastErrMsg = classifyConnectionError(err)
		runtime.EventsEmit(a.ctx, "gpu:error", lastErrMsg)
		nextRetryAt = now.Add(retryDelay(consecutiveFailures))

		if !lastSuccess.IsZero() {
			status = "stale"
			if consecutiveFailures >= 6 {
				status = "error"
			}
		} else {
			status = "error"
		}

		a.emitConnMeta(status, lastSuccess, consecutiveFailures, nextRetryAt, lastErrCode, lastErrMsg, target, port, now)
	}
}
