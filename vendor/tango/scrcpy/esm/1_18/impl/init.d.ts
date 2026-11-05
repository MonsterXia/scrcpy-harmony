import type { PrevImpl } from "./prev.js";
export type LogLevel = "verbose" | "debug" | "info" | "warn" | "error";
export declare const VideoOrientation: {
    readonly Initial: -2;
    readonly Unlocked: -1;
    readonly Portrait: 0;
    readonly Landscape: 1;
    readonly PortraitFlipped: 2;
    readonly LandscapeFlipped: 3;
};
export type VideoOrientation = (typeof VideoOrientation)[keyof typeof VideoOrientation];
export interface Init extends Omit<PrevImpl.Init, "logLevel" | "lockVideoOrientation"> {
    logLevel?: LogLevel;
    lockVideoOrientation?: VideoOrientation;
    powerOffOnClose?: boolean;
}
//# sourceMappingURL=init.d.ts.map