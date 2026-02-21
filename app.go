package main

import (
	"context"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

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
