# NVSmiBar

[![Release](https://img.shields.io/github/v/release/XingyuHu109/NVSmiBar?display_name=tag&logo=github)](https://github.com/XingyuHu109/NVSmiBar/releases)
[![Go Version](https://img.shields.io/badge/Go-1.23%2B-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![macOS](https://img.shields.io/badge/macOS-12%2B-000000?logo=apple&logoColor=white)](https://github.com/XingyuHu109/NVSmiBar#installation)

![NVSmiBar](assets/github_readme_top_banner.png)

macOS menu bar app that monitors remote NVIDIA GPUs over SSH — live utilization, temperature, and VRAM every second, no terminal required.

## Preview

<p align="center">
  <img src="assets/popup_ui.png" width="380" alt="NVSmiBar popup window showing GPU metrics" />
</p>

<p align="center">
  <img src="assets/Standard_menu_bar_util.png" style="height:28px;" alt="NVSmiBar menu bar — Standard mode" />
  &nbsp;&nbsp;&nbsp;
  <img src="assets/multi_gpu_menu_util.png" style="height:28px;" alt="NVSmiBar menu bar — Multi-GPU mode" />
  <br/>
  <sub>MacOS Menu bar — Standard mode &nbsp;·&nbsp; Multi-GPU mode</sub>
</p>

## Installation

**Homebrew (Recommended):**

```bash
brew install --cask XingyuHu109/tap/nvsmibar
```


<details>
<summary>Manual DMG Installation:</summary>

1. Download **[NVSmiBar.dmg](https://github.com/XingyuHu109/NVSmiBar/releases/latest/download/NVSmiBar.dmg)** (Apple Silicon, macOS 12+)
2. Drag **NVSmiBar.app** to Applications and launch it
3. If macOS shows _"Apple could not verify…"_, go to **System Settings → Privacy & Security → Open Anyway**
</details>

After installation:

- Click the **GPU** label in the menu bar to open the mini popup
- Use **Open dashboard** to add/manage SSH connections and import aliases from `~/.ssh/config`
> Requires SSH key-based auth to your GPU server and `nvidia-smi` on the remote machine.

## Features

- Menu bar only — no Dock icon
- Two UX modes: mini popup for quick glance + full dashboard for connection management
- Saved SSH connection profiles (duplicates allowed) with quick switch in mini popup
- SSH config alias import (`~/.ssh/config` + `Include` files)
- Polls `nvidia-smi` every second via SSH with stale-data retention + auto-retry backoff
- Per-GPU util/temp/VRAM plus fan/power/driver/CUDA when available
- Menu bar display modes: minimal, compact, standard, spark, multi-GPU

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
