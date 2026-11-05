export declare function isErrorName(e: unknown, name: string): e is Error;
export type PickNonNullable<T, K extends keyof T> = {
    [P in K]-?: NonNullable<T[P]>;
};
/**
 * `classCode`, `subclassCode` and `protocolCode` are required
 * for selecting correct USB configuration and interface.
 */
export type UsbInterfaceFilter = PickNonNullable<USBDeviceFilter, "classCode" | "subclassCode" | "protocolCode">;
export declare function isUsbInterfaceFilter(filter: USBDeviceFilter): filter is UsbInterfaceFilter;
export interface UsbInterfaceIdentifier {
    configuration: USBConfiguration;
    interface_: USBInterface;
    alternate: USBAlternateInterface;
}
export declare function findUsbInterface(device: USBDevice, filter: UsbInterfaceFilter): UsbInterfaceIdentifier | undefined;
export declare function getSerialNumber(device: USBDevice): string;
/**
 * Find the first pair of input and output endpoints from an alternate interface.
 *
 * ADB interface only has two endpoints, one for input and one for output.
 */
export declare function findUsbEndpoints(endpoints: readonly USBEndpoint[]): {
    inEndpoint: USBEndpoint;
    outEndpoint: USBEndpoint;
};
export declare function matchFilter(device: USBDevice, filter: USBDeviceFilter & UsbInterfaceFilter): UsbInterfaceIdentifier | false;
export declare function matchFilter(device: USBDevice, filter: USBDeviceFilter): boolean;
export declare function matchFilters(device: USBDevice, filters: readonly (USBDeviceFilter & UsbInterfaceFilter)[], exclusionFilters?: readonly USBDeviceFilter[]): UsbInterfaceIdentifier | false;
export declare function matchFilters(device: USBDevice, filters: readonly USBDeviceFilter[], exclusionFilters?: readonly USBDeviceFilter[]): boolean;
//# sourceMappingURL=utils.d.ts.map