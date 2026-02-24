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
        gStatusItem.button.image = nil;
        gStatusItem.button.title = [NSString stringWithUTF8String:copy];
        free((void *)copy);
    });
}

// Render two-line GPU status as NSImage in the menu bar
void nvSmiBarSetGPUStatus(int temp, int util, int memUsedMiB, int memTotalMiB, const char *status) {
    const char *statusCopy = strdup(status);
    dispatch_async(dispatch_get_main_queue(), ^{
        NSString *st = [NSString stringWithUTF8String:statusCopy];
        free((void *)statusCopy);

        // Non-live states: fall back to simple text title
        if ([st isEqualToString:@"idle"]) {
            gStatusItem.button.image = nil;
            gStatusItem.button.title = @"NVSmiBar";
            return;
        }
        if ([st isEqualToString:@"connecting"]) {
            gStatusItem.button.image = nil;
            gStatusItem.button.title = @"NV ···";
            return;
        }
        if ([st isEqualToString:@"error"]) {
            gStatusItem.button.image = nil;
            gStatusItem.button.title = @"NV ⚠";
            return;
        }

        // Live / stale: render two-line NSImage
        NSFont *font1 = [NSFont monospacedDigitSystemFontOfSize:10 weight:NSFontWeightMedium];
        NSFont *font2 = [NSFont monospacedDigitSystemFontOfSize:8.5 weight:NSFontWeightRegular];

        // Color thresholds for temp
        NSColor *tempColor;
        if (temp >= 85)      tempColor = [NSColor colorWithRed:0.94 green:0.27 blue:0.27 alpha:1.0];
        else if (temp >= 70) tempColor = [NSColor colorWithRed:0.96 green:0.62 blue:0.04 alpha:1.0];
        else                 tempColor = [NSColor labelColor];

        // Color thresholds for util
        NSColor *utilColor;
        if (util >= 90)      utilColor = [NSColor colorWithRed:0.94 green:0.27 blue:0.27 alpha:1.0];
        else if (util >= 70) utilColor = [NSColor colorWithRed:0.96 green:0.62 blue:0.04 alpha:1.0];
        else                 utilColor = [NSColor labelColor];

        // Build line 1 as attributed string with per-segment colors
        NSString *tempStr = [NSString stringWithFormat:@"%d°", temp];
        NSString *sepStr  = @" · ";
        NSString *utilStr = [NSString stringWithFormat:@"%d%%", util];

        NSMutableAttributedString *line1 = [[NSMutableAttributedString alloc] init];
        [line1 appendAttributedString:[[NSAttributedString alloc]
            initWithString:tempStr attributes:@{NSFontAttributeName: font1, NSForegroundColorAttributeName: tempColor}]];
        [line1 appendAttributedString:[[NSAttributedString alloc]
            initWithString:sepStr attributes:@{NSFontAttributeName: font1, NSForegroundColorAttributeName: [NSColor secondaryLabelColor]}]];
        [line1 appendAttributedString:[[NSAttributedString alloc]
            initWithString:utilStr attributes:@{NSFontAttributeName: font1, NSForegroundColorAttributeName: utilColor}]];

        // Line 2: VRAM
        CGFloat memUsedGB = memUsedMiB / 1024.0;
        CGFloat memTotalGB = memTotalMiB / 1024.0;
        NSString *vramStr = [NSString stringWithFormat:@"%.1f/%.0fG", memUsedGB, memTotalGB];
        NSDictionary *vramAttrs = @{NSFontAttributeName: font2, NSForegroundColorAttributeName: [NSColor secondaryLabelColor]};

        // Apply stale dimming by modifying color alphas directly
        if ([st isEqualToString:@"stale"]) {
            CGFloat a = 0.5;
            [line1 enumerateAttributesInRange:NSMakeRange(0, line1.length)
                                      options:0
                                   usingBlock:^(NSDictionary *attrs, NSRange range, BOOL *stop) {
                NSColor *c = attrs[NSForegroundColorAttributeName];
                if (c) {
                    [line1 addAttribute:NSForegroundColorAttributeName
                                  value:[c colorWithAlphaComponent:a]
                                  range:range];
                }
            }];
            vramAttrs = @{NSFontAttributeName: font2,
                          NSForegroundColorAttributeName: [[NSColor secondaryLabelColor] colorWithAlphaComponent:a]};
        }

        // Calculate size
        NSSize line1Size = [line1 size];
        NSSize line2Size = [vramStr sizeWithAttributes:vramAttrs];
        CGFloat width = MAX(line1Size.width, line2Size.width) + 2;
        CGFloat height = ceil(line1Size.height + line2Size.height) + 1;

        NSImage *img = [NSImage imageWithSize:NSMakeSize(width, height)
                                      flipped:YES
                                drawingHandler:^BOOL(NSRect dstRect) {
            [line1 drawAtPoint:NSMakePoint((width - line1Size.width) / 2, 0)];
            [vramStr drawAtPoint:NSMakePoint((width - line2Size.width) / 2, line1Size.height) withAttributes:vramAttrs];
            return YES;
        }];

        [img setTemplate:NO];
        gStatusItem.button.title = @"";
        gStatusItem.button.image = img;
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
