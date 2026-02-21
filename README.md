# NVSmiBar

![NVSmiBar](assets/github_readme_top_banner.png)

macOS menu bar app that monitors remote NVIDIA GPUs over SSH — live utilization, temperature, and VRAM every second, no terminal required.

## Installation

1. Download **[NVSmiBar.dmg](https://github.com/XingyuHu109/NVSmiBar/releases/latest/download/NVSmiBar.dmg)** (Apple Silicon, macOS 12+)
2. Drag **NVSmiBar.app** to Applications and launch it
3. Click the **GPU** label in the menu bar → enter your SSH host (e.g. `user@node01`)

> Requires SSH key-based auth to your GPU server and `nvidia-smi` on the remote machine.
>
> **First launch:** if macOS blocks the app, go to **System Settings → Privacy & Security → Open Anyway**.

## Features

- Menu bar only — no Dock icon
- Polls `nvidia-smi` every second via SSH
- Per-GPU util %, temp °C, VRAM — color-coded above 90 % util / 80 °C
- Configurable menu bar display (util, temp, VRAM, model name)
- SSH host persisted across sessions

## Build from Source

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0
git clone https://github.com/XingyuHu109/NVSmiBar.git && cd NVSmiBar
wails build && open build/bin/NVSmiBar.app
```

Requires Go 1.21+, Node 18+.

## Stack

[Wails v2](https://wails.io) · Native NSStatusItem (CGo) · React + TypeScript + Tailwind

## License

MIT
