# NVSmiBar

![NVSmiBar](assets/github_readme_top_banner.png)

**NVSmiBar** is a free, open-source macOS menu bar app that monitors remote NVIDIA GPUs over SSH in real time. It polls `nvidia-smi` every second and displays GPU utilization, temperature, and VRAM usage directly in the menu bar — no terminal required.

[**⬇ Download NVSmiBar.dmg**](https://github.com/XingyuHu109/NVSmiBar/releases/latest/download/NVSmiBar.dmg) — Apple Silicon (M1 or later)

---

## Features

- Runs entirely in the macOS menu bar — no Dock icon
- Monitors remote NVIDIA GPUs every second via SSH
- Displays utilization %, temperature °C, and VRAM per GPU
- Color-coded alerts: util > 90 % → amber, temp > 80 °C → red
- Configurable menu bar text: show/hide util, temp, VRAM, model name
- Frameless popup anchored below the menu bar icon
- SSH host persisted across sessions

## Requirements

- Apple Silicon Mac (M1 / M2 / M3 / M4), macOS 12 or later
- SSH key-based authentication to your GPU server (no password prompts)
- `nvidia-smi` installed on the remote machine

## Installation

1. Download **[NVSmiBar.dmg](https://github.com/XingyuHu109/NVSmiBar/releases/latest/download/NVSmiBar.dmg)**
2. Open the DMG and drag **NVSmiBar.app** to your Applications folder
3. Launch NVSmiBar — a **GPU** label appears in the menu bar

> **First launch:** macOS may show a security prompt. Go to **System Settings → Privacy & Security** and click **Open Anyway**.

## Usage

1. Click the **GPU** label in the menu bar to open the panel
2. Enter your SSH host (e.g. `user@node01`) and press Enter
3. GPU cards appear and refresh every second
4. Use **Menu Bar Display** checkboxes to choose what shows in the menu bar
5. Click **×** to dismiss the panel; click **Quit** to exit

## Build from Source

Requires Go 1.21+, Node.js 18+, and [Wails v2](https://wails.io):

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0
git clone https://github.com/XingyuHu109/NVSmiBar.git
cd NVSmiBar
wails build
open build/bin/NVSmiBar.app
```

## Stack

- [Wails v2](https://wails.io) — Go + WebView bridge
- Native `NSStatusItem` via CGo (no third-party tray library)
- React + TypeScript + Tailwind CSS

## License

MIT
