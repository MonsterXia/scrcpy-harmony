import type { StructInit } from "@yume-chan/struct";
import type { ScrcpyBackOrScreenOnControlMessage } from "../../latest.js";
export declare const BackOrScreenOnControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").NumberField<number>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").NumberField<number>;
}>>;
export type BackOrScreenOnControlMessage = StructInit<typeof BackOrScreenOnControlMessage>;
export declare function serializeBackOrScreenOnControlMessage(message: ScrcpyBackOrScreenOnControlMessage): Uint8Array<ArrayBufferLike> | undefined;
//# sourceMappingURL=back-or-screen-on.d.ts.map