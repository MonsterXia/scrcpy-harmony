import type { StructInit } from "@yume-chan/struct";
import type { AndroidKeyCode, AndroidKeyEventAction, AndroidKeyEventMeta } from "../android/index.js";
export declare const ScrcpyInjectKeyCodeControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").Field<0, never, never, number>;
    action: import("@yume-chan/struct").Field<AndroidKeyEventAction, never, never, number>;
    keyCode: import("@yume-chan/struct").Field<AndroidKeyCode, never, never, number>;
    repeat: import("@yume-chan/struct").NumberField<number>;
    metaState: import("@yume-chan/struct").Field<AndroidKeyEventMeta, never, never, number>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").Field<0, never, never, number>;
    action: import("@yume-chan/struct").Field<AndroidKeyEventAction, never, never, number>;
    keyCode: import("@yume-chan/struct").Field<AndroidKeyCode, never, never, number>;
    repeat: import("@yume-chan/struct").NumberField<number>;
    metaState: import("@yume-chan/struct").Field<AndroidKeyEventMeta, never, never, number>;
}>>;
export type ScrcpyInjectKeyCodeControlMessage = StructInit<typeof ScrcpyInjectKeyCodeControlMessage>;
//# sourceMappingURL=inject-key-code.d.ts.map