# NVSmiBar

![NVSmiBar](github_readme_top_banner.png)

A macOS menu bar utility that polls remote NVIDIA GPUs over SSH and displays live metrics in a frameless popup window. Built for deep learning engineers on HPC clusters.

## Features

- Lives in the macOS menu bar (no Dock icon)
- Polls remote GPU metrics every second via SSH
- Displays utilization, temperature, and memory per GPU
- Color-coded thresholds: util > 90% → amber, temp > 80°C → red
- Frameless popup window anchored top-right, below the menu bar
- SSH host persisted in localStorage

## Prerequisites

- macOS 10.13+
- Go 1.21+
- Wails v2: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- Node.js 18+ and npm
- SSH key-based auth configured for your remote hosts

## Development

```bash
wails dev
```

## Build

```bash
wails build
open build/bin/NVSmiBar.app
```

## Usage

1. Launch `NVSmiBar.app` — a "GPU" icon appears in the menu bar
2. Click the tray icon → **Show NVSmiBar**
3. Enter your SSH host (e.g. `user@node01`) in the text field
4. GPU cards refresh every ~1 second

## Stack

- [Wails v2](https://wails.io) — Go + WebView bridge
- [getlantern/systray](https://github.com/getlantern/systray) — macOS menu bar tray
- React + TypeScript + Tailwind CSS
