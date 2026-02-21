package main

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

type GPU struct {
	Index    int    `json:"index"`
	Name     string `json:"name"`
	Util     int    `json:"util"`
	Temp     int    `json:"temp"`
	MemUsed  int    `json:"memUsed"`
	MemTotal int    `json:"memTotal"`
}

func queryGPUs(host string) ([]GPU, error) {
	cmd := exec.Command("ssh",
		"-o", "BatchMode=yes",
		"-o", "ConnectTimeout=3",
		host,
		"nvidia-smi --query-gpu=index,name,utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits",
	)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("ssh: %w", err)
	}
	return parseOutput(string(out))
}

func parseOutput(raw string) ([]GPU, error) {
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
		index, err := strconv.Atoi(strings.TrimSpace(parts[0]))
		if err != nil {
			return nil, fmt.Errorf("parse index: %w", err)
		}
		name := strings.TrimSpace(parts[1])
		util, err := strconv.Atoi(strings.TrimSpace(parts[2]))
		if err != nil {
			return nil, fmt.Errorf("parse util: %w", err)
		}
		temp, err := strconv.Atoi(strings.TrimSpace(parts[3]))
		if err != nil {
			return nil, fmt.Errorf("parse temp: %w", err)
		}
		memUsed, err := strconv.Atoi(strings.TrimSpace(parts[4]))
		if err != nil {
			return nil, fmt.Errorf("parse memUsed: %w", err)
		}
		memTotal, err := strconv.Atoi(strings.TrimSpace(parts[5]))
		if err != nil {
			return nil, fmt.Errorf("parse memTotal: %w", err)
		}
		gpus = append(gpus, GPU{
			Index:    index,
			Name:     name,
			Util:     util,
			Temp:     temp,
			MemUsed:  memUsed,
			MemTotal: memTotal,
		})
	}
	return gpus, nil
}
