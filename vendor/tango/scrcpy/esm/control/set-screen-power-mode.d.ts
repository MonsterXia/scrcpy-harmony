import type { StructInit } from "@yume-chan/struct";
import type { AndroidScreenPowerMode } from "../android/index.js";
export declare const ScrcpySetDisplayPowerControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").NumberField<number>;
    mode: import("@yume-chan/struct").Field<AndroidScreenPowerMode, never, never, number>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").NumberField<number>;
    mode: import("@yume-chan/struct").Field<AndroidScreenPowerMode, never, never, number>;
}>>;
export type ScrcpySetScreenPowerModeControlMessage = StructInit<typeof ScrcpySetDisplayPowerControlMessage>;
//# sourceMappingURL=set-screen-power-mode.d.ts.map