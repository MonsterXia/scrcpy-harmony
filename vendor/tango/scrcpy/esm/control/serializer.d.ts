import type { AndroidKeyEventAction, AndroidScreenPowerMode } from "../android/index.js";
import type { ScrcpyOptions } from "../base/index.js";
import type { ScrcpyInjectScrollControlMessage, ScrcpyInjectTouchControlMessage, ScrcpySetClipboardControlMessage, ScrcpyUHidCreateControlMessage } from "../latest.js";
import { ScrcpyInjectKeyCodeControlMessage } from "./inject-key-code.js";
import { ScrcpyUHidInputControlMessage } from "./uhid.js";
export declare class ScrcpyControlMessageSerializer {
    #private;
    constructor(options: ScrcpyOptions<object>);
    injectKeyCode(message: Omit<ScrcpyInjectKeyCodeControlMessage, "type">): Uint8Array<ArrayBufferLike>;
    injectText(text: string): Uint8Array<ArrayBufferLike>;
    /**
     * `pressure` is a float value between 0 and 1.
     */
    injectTouch(message: Omit<ScrcpyInjectTouchControlMessage, "type">): Uint8Array<ArrayBufferLike>;
    /**
     * `scrollX` and `scrollY` are float values between 0 and 1.
     */
    injectScroll(message: Omit<ScrcpyInjectScrollControlMessage, "type">): Uint8Array<ArrayBufferLike> | undefined;
    backOrScreenOn(action: AndroidKeyEventAction): Uint8Array<ArrayBufferLike> | undefined;
    setDisplayPower(mode: AndroidScreenPowerMode): Uint8Array<ArrayBufferLike>;
    expandNotificationPanel(): Uint8Array<ArrayBufferLike>;
    expandSettingPanel(): Uint8Array<ArrayBufferLike>;
    collapseNotificationPanel(): Uint8Array<ArrayBufferLike>;
    rotateDevice(): Uint8Array<ArrayBufferLike>;
    setClipboard(message: Omit<ScrcpySetClipboardControlMessage, "type">): Uint8Array<ArrayBufferLike> | [Uint8Array<ArrayBufferLike>, Promise<void>];
    uHidCreate(message: Omit<ScrcpyUHidCreateControlMessage, "type">): Uint8Array<ArrayBufferLike>;
    uHidInput(message: Omit<ScrcpyUHidInputControlMessage, "type">): Uint8Array<ArrayBufferLike>;
    uHidDestroy(id: number): Uint8Array<ArrayBufferLike>;
    startApp(name: string, options?: {
        forceStop?: boolean;
        searchByName?: boolean;
    }): Uint8Array<ArrayBufferLike>;
    resetVideo(): Uint8Array<ArrayBufferLike>;
}
//# sourceMappingURL=serializer.d.ts.map