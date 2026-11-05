import type { AdbDaemonDevice, AdbPacketData, AdbPacketInit } from "@yume-chan/adb";
import type { Consumable, ReadableWritablePair, WritableStream } from "@yume-chan/stream-extra";
import { ReadableStream } from "@yume-chan/stream-extra";
import { DeviceBusyError as _DeviceBusyError } from "./error.js";
import type { UsbInterfaceFilter, UsbInterfaceIdentifier } from "./utils.js";
/**
 * The default filter for ADB devices, as defined by Google.
 */
export declare const AdbDefaultInterfaceFilter: {
    readonly classCode: 255;
    readonly subclassCode: 66;
    readonly protocolCode: 1;
};
export declare function mergeDefaultAdbInterfaceFilter(filters: readonly USBDeviceFilter[] | undefined): (USBDeviceFilter & UsbInterfaceFilter)[];
export declare class AdbDaemonWebUsbConnection implements ReadableWritablePair<AdbPacketData, Consumable<AdbPacketInit>> {
    #private;
    get device(): AdbDaemonWebUsbDevice;
    get inEndpoint(): USBEndpoint;
    get outEndpoint(): USBEndpoint;
    get readable(): ReadableStream<AdbPacketData>;
    get writable(): WritableStream<Consumable<import("@yume-chan/struct").FieldsInit<{
        command: import("@yume-chan/struct").NumberField<number>;
        arg0: import("@yume-chan/struct").NumberField<number>;
        arg1: import("@yume-chan/struct").NumberField<number>;
        payloadLength: import("@yume-chan/struct").NumberField<number>;
        checksum: import("@yume-chan/struct").NumberField<number>;
        magic: import("@yume-chan/struct").NumberField<number>;
    } & {
        payload: import("@yume-chan/struct").Field<Uint8Array<ArrayBufferLike>, "payloadLength", Record<"payloadLength", number>, Uint8Array<ArrayBufferLike>>;
    }>>>;
    constructor(device: AdbDaemonWebUsbDevice, inEndpoint: USBEndpoint, outEndpoint: USBEndpoint, usbManager: USB);
}
export declare class AdbDaemonWebUsbDevice implements AdbDaemonDevice {
    #private;
    static DeviceBusyError: typeof _DeviceBusyError;
    get raw(): USBDevice;
    get serial(): string;
    get name(): string;
    /**
     * Create a new instance of `AdbDaemonWebUsbConnection` using a specified `USBDevice` instance
     *
     * @param device The `USBDevice` instance obtained elsewhere.
     * @param filters The filters to use when searching for ADB interface. Defaults to {@link ADB_DEFAULT_DEVICE_FILTER}.
     */
    constructor(device: USBDevice, interface_: UsbInterfaceIdentifier, usbManager: USB);
    /**
     * Open the device and create a new connection to the ADB Daemon.
     */
    connect(): Promise<AdbDaemonWebUsbConnection>;
}
export declare namespace AdbDaemonWebUsbDevice {
    type DeviceBusyError = _DeviceBusyError;
}
//# sourceMappingURL=device.d.ts.map