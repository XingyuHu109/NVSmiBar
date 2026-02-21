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

type App struct {
	ctx     context.Context
	mu      sync.Mutex
	host    string
	visible bool
	stopCh  chan struct{}
}

func NewApp() *App {
	return &App{
		stopCh: make(chan struct{}),
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

// SetHost is called from the frontend to update the SSH host.
func (a *App) SetHost(host string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.host = host
}

// HideWindow hides the popup window. Called from the frontend close button.
func (a *App) HideWindow() {
	a.hideWindow()
}

// UpdateTrayTitle updates the menu bar status item title.
// Called from the frontend on each gpu:data event.
func (a *App) UpdateTrayTitle(title string) {
	setTrayTitle(title)
}

// Quit exits the application. Called from the frontend settings panel.
func (a *App) Quit() {
	runtime.Quit(a.ctx)
}

func (a *App) showWindow() {
	const popupWidth = 380
	x := getStatusItemRightX() - popupWidth
	if x < 0 {
		// Fallback: top-right of primary screen
		screens, err := runtime.ScreenGetAll(a.ctx)
		if err == nil && len(screens) > 0 {
			x = screens[0].Size.Width - popupWidth - 10
		}
	}
	if x < 0 {
		x = 0
	}
	runtime.WindowSetPosition(a.ctx, x, 28)
	runtime.WindowShow(a.ctx)
	a.mu.Lock()
	a.visible = true
	a.mu.Unlock()
}

func (a *App) hideWindow() {
	runtime.WindowHide(a.ctx)
	a.mu.Lock()
	a.visible = false
	a.mu.Unlock()
}

func (a *App) toggleWindow() {
	a.mu.Lock()
	visible := a.visible
	a.mu.Unlock()
	if visible {
		a.hideWindow()
	} else {
		a.showWindow()
	}
}

func (a *App) pollLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-a.stopCh:
			return
		case <-ticker.C:
			a.mu.Lock()
			host := a.host
			a.mu.Unlock()

			if host == "" {
				continue
			}

			gpus, err := queryGPUs(host)
			if err != nil {
				runtime.EventsEmit(a.ctx, "gpu:error", err.Error())
			} else {
				runtime.EventsEmit(a.ctx, "gpu:data", gpus)
			}
		}
	}
}
