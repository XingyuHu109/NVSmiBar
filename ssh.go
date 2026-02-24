package main

import (
	"fmt"
	"math"
	"os/exec"
	"strconv"
	"strings"
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
	if err != nil {
		// CUDA query support varies by host driver stack. Retry without it.
		if strings.Contains(strings.ToLower(err.Error()), "cuda_version") {
			fallback := "nvidia-smi --query-gpu=index,name,utilization.gpu,temperature.gpu,memory.used,memory.total,fan.speed,power.draw,power.limit,driver_version --format=csv,noheader,nounits"
			out, err = runSSHCommand(target, port, fallback)
			if err != nil {
				return nil, err
			}
			return parseOutput(string(out), false)
		}
		return nil, err
	}
	return parseOutput(string(out), true)
}

func runSSHCommand(target string, port int, remoteCmd string) ([]byte, error) {
	args := []string{
		"-o", "BatchMode=yes",
		"-o", "ConnectTimeout=3",
	}
	if port > 0 {
		args = append(args, "-p", strconv.Itoa(port))
	}
	args = append(args, target, remoteCmd)

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
		memUsed, err := parseRequiredInt(parts[4])
		if err != nil {
			return nil, fmt.Errorf("parse memUsed: %w", err)
		}
		memTotal, err := parseRequiredInt(parts[5])
		if err != nil {
			return nil, fmt.Errorf("parse memTotal: %w", err)
		}

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
