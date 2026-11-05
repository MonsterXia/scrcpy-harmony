import type { StructInit } from "@yume-chan/struct";
import type { AndroidKeyEventAction } from "../../android/index.js";
import type { ScrcpyBackOrScreenOnControlMessage } from "../../latest.js";
export declare const BackOrScreenOnControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").NumberField<number>;
} & {
    action: import("@yume-chan/struct").Field<AndroidKeyEventAction, never, never, number>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").NumberField<number>;
} & {
    action: import("@yume-chan/struct").Field<AndroidKeyEventAction, never, never, number>;
}>>;
export type BackOrScreenOnControlMessage = StructInit<typeof BackOrScreenOnControlMessage>;
export declare function serializeBackOrScreenOnControlMessage(message: ScrcpyBackOrScreenOnControlMessage): Uint8Array<ArrayBufferLike>;
//# sourceMappingURL=back-or-screen-on.d.ts.map