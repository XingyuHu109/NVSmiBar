package main

/*
#cgo LDFLAGS: -framework Cocoa -framework Foundation
#include <stdlib.h>

// Declarations only — definitions live in tray_darwin.m
extern void nvSmiBarSetupTray(void);
extern void nvSmiBarSetTitle(const char *title);
extern double nvSmiBarGetButtonRightX(void);
extern void nvSmiBarSetGPUStatus(int temp, int util, int memUsedMiB, int memTotalMiB, const char *status);
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
			gApp.HandleTrayClick()
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

// setTrayGPUStatus renders GPU metrics as a two-line NSImage in the menu bar.
func setTrayGPUStatus(temp, util, memUsedMiB, memTotalMiB int, status string) {
	cs := C.CString(status)
	defer C.free(unsafe.Pointer(cs))
	C.nvSmiBarSetGPUStatus(C.int(temp), C.int(util), C.int(memUsedMiB), C.int(memTotalMiB), cs)
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
