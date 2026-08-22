package main

import (
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

type GPU struct {
	Index         int    `json:"index"`
	Name          string `json:"name"`
	Util          int    `json:"util"`
	Temp          int    `json:"temp"`
	MemUsed       int    `json:"memUsed"`
	MemTotal      int    `json:"memTotal"`
	FanSpeed      int    `json:"fanSpeed"`
	PowerDraw     int    `json:"powerDraw"`
	PowerLimit    int    `json:"powerLimit"`
	DriverVersion string `json:"driverVersion"`
	CudaVersion   string `json:"cudaVersion"`
}

func queryGPUs(target string, port int) ([]GPU, error) {
	if strings.TrimSpace(target) == "" {
		return nil, fmt.Errorf("empty target")
	}

	fullQuery := "nvidia-smi --query-gpu=index,name,utilization.gpu,temperature.gpu,memory.used,memory.total,fan.speed,power.draw,power.limit,driver_version,cuda_version --format=csv,noheader,nounits"
	out, err := runSSHCommand(target, port, fullQuery)
	var gpus []GPU
	if err != nil {
		// CUDA query support varies by host driver stack. Retry without it.
		if strings.Contains(strings.ToLower(err.Error()), "cuda_version") {
			fallback := "nvidia-smi --query-gpu=index,name,utilization.gpu,temperature.gpu,memory.used,memory.total,fan.speed,power.draw,power.limit,driver_version --format=csv,noheader,nounits"
			out, err = runSSHCommand(target, port, fallback)
			if err != nil {
				return nil, err
			}
			gpus, err = parseOutput(string(out), false)
		} else {
			return nil, err
		}
	} else {
		gpus, err = parseOutput(string(out), true)
	}
	if err != nil {
		return nil, err
	}

	// On unified-memory systems (e.g. DGX Spark / GB10) nvidia-smi reports
	// memory.used/memory.total as N/A. Backfill from system RAM, which is
	// what the GPU actually draws from on those systems.
	if len(gpus) == 1 && gpus[0].MemTotal < 0 {
		if total, used, ok := querySystemMemory(target, port); ok {
			gpus[0].MemTotal = total
			gpus[0].MemUsed = used
		}
	}

	return gpus, nil
}

func querySystemMemory(target string, port int) (totalMiB, usedMiB int, ok bool) {
	// Report total-minus-free (buff/cache counted as used) to match how
	// NVIDIA Sync and most system monitors present memory pressure, rather
	// than free's stricter "used" column which excludes reclaimable cache.
	out, err := runSSHCommand(target, port, `free -b | awk '/^Mem:/{printf "%d,%d\n", $2, $2-$4}'`)
	if err != nil {
		return 0, 0, false
	}
	parts := strings.Split(strings.TrimSpace(string(out)), ",")
	if len(parts) != 2 {
		return 0, 0, false
	}
	totalBytes, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, 0, false
	}
	usedBytes, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return 0, 0, false
	}
	return int(totalBytes / (1024 * 1024)), int(usedBytes / (1024 * 1024)), true
}

var (
	controlDirOnce sync.Once
	controlDir     string
)

// controlPathArgs returns the ControlMaster options that let repeated polls
// reuse one authenticated connection instead of paying a full SSH handshake
// every second. Falls back to no multiplexing if the control dir can't be
// created (e.g. read-only home).
func controlPathArgs() []string {
	controlDirOnce.Do(func() {
		home, err := os.UserHomeDir()
		if err != nil {
			return
		}
		dir := filepath.Join(home, ".ssh", "controlmasters")
		if err := os.MkdirAll(dir, 0700); err != nil {
			return
		}
		controlDir = dir
	})
	if controlDir == "" {
		return nil
	}
	// %C is a hash of host/port/user, keeping the socket path short and
	// avoiding the ~104 char unix socket path limit.
	return []string{
		"-o", "ControlMaster=auto",
		"-o", "ControlPersist=60s",
		"-o", "ControlPath=" + filepath.Join(controlDir, "%C"),
	}
}

func sshArgs(target string, port int) []string {
	args := []string{
		"-o", "BatchMode=yes",
		"-o", "ConnectTimeout=3",
	}
	args = append(args, controlPathArgs()...)
	if port > 0 {
		args = append(args, "-p", strconv.Itoa(port))
	}
	args = append(args, target)
	return args
}

// closeControlMaster tears down a possibly-stale multiplexed connection so
// the next attempt starts fresh (e.g. after sleep/wake or a network change
// leaves the control socket pointing at a dead session).
func closeControlMaster(target string, port int) {
	args := append(sshArgs(target, port), "-O", "exit")
	_ = exec.Command("ssh", args...).Run()
}

func runSSHCommand(target string, port int, remoteCmd string) ([]byte, error) {
	out, err := runSSHCommandOnce(target, port, remoteCmd)
	if err != nil && isStaleControlMasterErr(err) {
		closeControlMaster(target, port)
		out, err = runSSHCommandOnce(target, port, remoteCmd)
	}
	return out, err
}

func isStaleControlMasterErr(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "control socket") ||
		strings.Contains(msg, "mux_client") ||
		strings.Contains(msg, "stale")
}

func runSSHCommandOnce(target string, port int, remoteCmd string) ([]byte, error) {
	args := append(sshArgs(target, port), remoteCmd)

	cmd := exec.Command("ssh", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return nil, fmt.Errorf("ssh: %s", msg)
	}
	return out, nil
}

func parseOutput(raw string, hasCuda bool) ([]GPU, error) {
	var gpus []GPU
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, ",")
		if len(parts) < 6 {
			return nil, fmt.Errorf("unexpected nvidia-smi output: %q", line)
		}
		index, err := parseRequiredInt(parts[0])
		if err != nil {
			return nil, fmt.Errorf("parse index: %w", err)
		}
		name := strings.TrimSpace(parts[1])
		util, err := parseRequiredInt(parts[2])
		if err != nil {
			return nil, fmt.Errorf("parse util: %w", err)
		}
		temp, err := parseRequiredInt(parts[3])
		if err != nil {
			return nil, fmt.Errorf("parse temp: %w", err)
		}
		memUsed := parseOptionalInt(parts, 4)
		memTotal := parseOptionalInt(parts, 5)

		fanSpeed := parseOptionalInt(parts, 6)
		powerDraw := parseOptionalInt(parts, 7)
		powerLimit := parseOptionalInt(parts, 8)
		driverVersion := parseOptionalString(parts, 9)
		cudaVersion := ""
		if hasCuda {
			cudaVersion = parseOptionalString(parts, 10)
		}

		gpus = append(gpus, GPU{
			Index:         index,
			Name:          name,
			Util:          util,
			Temp:          temp,
			MemUsed:       memUsed,
			MemTotal:      memTotal,
			FanSpeed:      fanSpeed,
			PowerDraw:     powerDraw,
			PowerLimit:    powerLimit,
			DriverVersion: driverVersion,
			CudaVersion:   cudaVersion,
		})
	}

	return gpus, nil
}

func parseRequiredInt(raw string) (int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, fmt.Errorf("empty value")
	}
	if strings.EqualFold(raw, "n/a") || strings.EqualFold(raw, "[not supported]") {
		return 0, fmt.Errorf("missing required numeric value %q", raw)
	}
	if n, err := strconv.Atoi(raw); err == nil {
		return n, nil
	}
	f, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, err
	}
	return int(math.Round(f)), nil
}

func parseOptionalInt(parts []string, index int) int {
	if index >= len(parts) {
		return -1
	}
	raw := strings.TrimSpace(parts[index])
	if raw == "" || strings.EqualFold(raw, "n/a") || strings.EqualFold(raw, "[not supported]") {
		return -1
	}
	if n, err := strconv.Atoi(raw); err == nil {
		return n
	}
	f, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return -1
	}
	return int(math.Round(f))
}

func parseOptionalString(parts []string, index int) string {
	if index >= len(parts) {
		return ""
	}
	raw := strings.TrimSpace(parts[index])
	if raw == "" || strings.EqualFold(raw, "n/a") || strings.EqualFold(raw, "[not supported]") {
		return ""
	}
	return raw
}
