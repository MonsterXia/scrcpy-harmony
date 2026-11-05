import { AdbDaemonWebUsbDevice } from "./device.js";
import { AdbDaemonWebUsbDeviceObserver } from "./observer.js";
export declare namespace AdbDaemonWebUsbDeviceManager {
    interface RequestDeviceOptions {
        filters?: readonly USBDeviceFilter[] | undefined;
        exclusionFilters?: readonly USBDeviceFilter[] | undefined;
    }
}
export declare class AdbDaemonWebUsbDeviceManager {
    #private;
    /**
     * Gets the instance of {@link AdbDaemonWebUsbDeviceManager} using browser WebUSB implementation.
     *
     * May be `undefined` if current runtime does not support WebUSB.
     */
    static readonly BROWSER: AdbDaemonWebUsbDeviceManager | undefined;
    /**
     * Create a new instance of {@link AdbDaemonWebUsbDeviceManager} using the specified WebUSB implementation.
     * @param usbManager A WebUSB compatible interface.
     */
    constructor(usbManager: USB);
    /**
     * Call `USB#requestDevice()` to prompt the user to select a device.
     */
    requestDevice(options?: AdbDaemonWebUsbDeviceManager.RequestDeviceOptions): Promise<AdbDaemonWebUsbDevice | undefined>;
    /**
     * Get all connected and requested devices that match the specified filters.
     */
    getDevices(options?: AdbDaemonWebUsbDeviceManager.RequestDeviceOptions): Promise<AdbDaemonWebUsbDevice[]>;
    trackDevices(options?: AdbDaemonWebUsbDeviceManager.RequestDeviceOptions): Promise<AdbDaemonWebUsbDeviceObserver>;
}
//# sourceMappingURL=manager.d.ts.map