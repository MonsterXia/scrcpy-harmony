import type { DeviceObserver } from "@yume-chan/adb";
import { AdbDaemonWebUsbDevice } from "./device.js";
import type { AdbDaemonWebUsbDeviceManager } from "./manager.js";
/**
 * A watcher that listens for new WebUSB devices and notifies the callback when
 * a new device is connected or disconnected.
 */
export declare class AdbDaemonWebUsbDeviceObserver implements DeviceObserver<AdbDaemonWebUsbDevice> {
    #private;
    static create(usb: USB, options?: AdbDaemonWebUsbDeviceManager.RequestDeviceOptions): Promise<AdbDaemonWebUsbDeviceObserver>;
    onDeviceAdd: import("@yume-chan/event").Event<readonly AdbDaemonWebUsbDevice[], unknown>;
    onDeviceRemove: import("@yume-chan/event").Event<readonly AdbDaemonWebUsbDevice[], unknown>;
    onListChange: import("@yume-chan/event").Event<readonly AdbDaemonWebUsbDevice[], unknown>;
    current: readonly AdbDaemonWebUsbDevice[];
    constructor(usb: USB, initial: USBDevice[], options?: AdbDaemonWebUsbDeviceManager.RequestDeviceOptions);
    stop(): void;
}
//# sourceMappingURL=observer.d.ts.map