import type { StructInit } from "@yume-chan/struct";
import type { ScrcpySetClipboardControlMessage } from "../../latest.js";
export declare const SetClipboardControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").NumberField<number>;
    content: import("@yume-chan/struct").Field<string, string, never, string>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").NumberField<number>;
    content: import("@yume-chan/struct").Field<string, string, never, string>;
}>>;
export type SetClipboardControlMessage = StructInit<typeof SetClipboardControlMessage>;
export declare function serializeSetClipboardControlMessage(message: ScrcpySetClipboardControlMessage): Uint8Array;
//# sourceMappingURL=set-clipboard.d.ts.map