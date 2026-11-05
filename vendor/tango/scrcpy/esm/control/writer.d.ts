import type { WritableStreamDefaultWriter } from "@yume-chan/stream-extra";
import { Consumable } from "@yume-chan/stream-extra";
import type { AndroidKeyEventAction, AndroidScreenPowerMode } from "../android/index.js";
import type { ScrcpyOptions } from "../base/index.js";
import type { ScrcpyInjectScrollControlMessage, ScrcpyInjectTouchControlMessage, ScrcpySetClipboardControlMessage, ScrcpyUHidCreateControlMessage } from "../latest.js";
import type { ScrcpyInjectKeyCodeControlMessage } from "./inject-key-code.js";
import type { ScrcpyUHidInputControlMessage } from "./uhid.js";
export declare class ScrcpyControlMessageWriter {
    #private;
    constructor(writer: WritableStreamDefaultWriter<Consumable<Uint8Array>>, options: ScrcpyOptions<object>);
    write(message: Uint8Array): Promise<void>;
    injectKeyCode(message: Omit<ScrcpyInjectKeyCodeControlMessage, "type">): Promise<void>;
    injectText(text: string): Promise<void>;
    /**
     * `pressure` is a float value between 0 and 1.
     */
    injectTouch(message: Omit<ScrcpyInjectTouchControlMessage, "type">): Promise<void>;
    /**
     * `scrollX` and `scrollY` are float values between 0 and 1.
     */
    injectScroll(message: Omit<ScrcpyInjectScrollControlMessage, "type">): Promise<void>;
    backOrScreenOn(action: AndroidKeyEventAction): Promise<void>;
    setScreenPowerMode(mode: AndroidScreenPowerMode): Promise<void>;
    expandNotificationPanel(): Promise<void>;
    expandSettingPanel(): Promise<void>;
    collapseNotificationPanel(): Promise<void>;
    rotateDevice(): Promise<void>;
    setClipboard(message: Omit<ScrcpySetClipboardControlMessage, "type">): Promise<void>;
    uHidCreate(message: Omit<ScrcpyUHidCreateControlMessage, "type">): Promise<void>;
    uHidInput(message: Omit<ScrcpyUHidInputControlMessage, "type">): Promise<void>;
    uHidDestroy(id: number): Promise<void>;
    startApp(name: string, options?: {
        forceStop?: boolean;
        searchByName?: boolean;
    }): Promise<void>;
    resetVideo(): Promise<void>;
    releaseLock(): void;
    close(): Promise<void>;
}
//# sourceMappingURL=writer.d.ts.map