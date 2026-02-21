#import <Cocoa/Cocoa.h>
#include <stdlib.h>

extern void goStatusItemClicked(void);

@interface NVSmiBarMenuHandler : NSObject
- (void)handleClick:(id)sender;
@end

@implementation NVSmiBarMenuHandler
- (void)handleClick:(id)sender { goStatusItemClicked(); }
@end

static NSStatusItem        *gStatusItem = nil;
static NVSmiBarMenuHandler *gHandler    = nil;

void nvSmiBarSetupTray(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        gHandler = [[NVSmiBarMenuHandler alloc] init];
        gStatusItem = [[[NSStatusBar systemStatusBar]
                         statusItemWithLength:NSVariableStatusItemLength] retain];
        gStatusItem.button.title   = @"GPU";
        gStatusItem.button.toolTip = @"NVSmiBar";
        gStatusItem.button.action  = @selector(handleClick:);
        gStatusItem.button.target  = gHandler;
        [gStatusItem.button sendActionOn:NSEventMaskLeftMouseUp];
    });
}

// Live title update (called every second from pollLoop via frontend)
void nvSmiBarSetTitle(const char *title) {
    const char *copy = strdup(title);
    dispatch_async(dispatch_get_main_queue(), ^{
        gStatusItem.button.title = [NSString stringWithUTF8String:copy];
        free((void *)copy);
    });
}

// Returns right edge of status item button in screen coords (Quartz, from left)
// Used by Go to anchor popup below the button
double nvSmiBarGetButtonRightX(void) {
    __block double result = -1.0;
    dispatch_sync(dispatch_get_main_queue(), ^{
        if (!gStatusItem || !gStatusItem.button.window) return;
        NSRect frame = gStatusItem.button.frame;
        NSRect screenRect = [gStatusItem.button.window
                              convertRectToScreen:frame];
        result = screenRect.origin.x + screenRect.size.width;
    });
    return result;
}
