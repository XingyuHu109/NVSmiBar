package main

/*
#cgo LDFLAGS: -framework Cocoa -framework Foundation
#include <stdlib.h>

// Declarations only — definitions live in tray_darwin.m
extern void nvSmiBarSetupTray(void);
extern void nvSmiBarSetTitle(const char *title);
extern double nvSmiBarGetButtonRightX(void);
*/
import "C"
import "unsafe"

var gApp *App

// goStatusItemClicked is called from ObjC on the main thread when the status
// item button is clicked. We dispatch to a goroutine so we don't block the main thread.
//
//export goStatusItemClicked
func goStatusItemClicked() {
	go func() {
		if gApp != nil {
			gApp.toggleWindow()
		}
	}()
}

// trayRun sets up the native macOS menu-bar status item.
// Must be called from a goroutine (not the main thread) after Wails has started.
func trayRun(a *App) {
	gApp = a
	C.nvSmiBarSetupTray()
}

// setTrayTitle updates the status item button title (shown in the menu bar).
func setTrayTitle(title string) {
	cs := C.CString(title)
	defer C.free(unsafe.Pointer(cs))
	C.nvSmiBarSetTitle(cs)
}

// getStatusItemRightX returns the right edge X coordinate (screen coords) of
// the status item button, used to anchor the popup window below the icon.
func getStatusItemRightX() int {
	x := float64(C.nvSmiBarGetButtonRightX())
	if x < 0 {
		return -1
	}
	return int(x)
}
