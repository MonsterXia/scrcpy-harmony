import type { ScrcpyOptionValue } from "../../base/option-value.js";
import type { PrevImpl } from "./prev.js";
export declare const LockOrientation: {
    readonly Unlocked: 0;
    readonly LockedInitial: 1;
    readonly LockedValue: 2;
};
export type LockOrientation = (typeof LockOrientation)[keyof typeof LockOrientation];
export declare const Orientation: {
    readonly Orient0: 0;
    readonly Orient90: 90;
    readonly Orient180: 180;
    readonly Orient270: 270;
};
export type Orientation = (typeof Orientation)[keyof typeof Orientation];
export declare class CaptureOrientation implements ScrcpyOptionValue {
    static Unlocked: CaptureOrientation;
    lock: LockOrientation;
    orientation: Orientation;
    flip: boolean;
    constructor(lock: LockOrientation, orientation: Orientation, flip?: boolean);
    toOptionValue(): string | undefined;
}
export declare class NewDisplay implements ScrcpyOptionValue {
    static Default: NewDisplay;
    width?: number | undefined;
    height?: number | undefined;
    dpi?: number | undefined;
    constructor();
    constructor(width: number, height: number);
    constructor(dpi: number);
    constructor(width: number, height: number, dpi: number);
    toOptionValue(): string;
}
export interface Init<TVideo extends boolean> extends Omit<PrevImpl.Init<TVideo>, "lockVideoOrientation"> {
    captureOrientation?: CaptureOrientation | string | undefined;
    angle?: number;
    screenOffTimeout?: number | undefined;
    listApps?: boolean;
    newDisplay?: NewDisplay | string | undefined;
    vdSystemDecorations?: boolean;
}
//# sourceMappingURL=init.d.ts.map