import type { AsyncExactReadable, StructInit } from "@yume-chan/struct";
import type { ScrcpyDeviceMessageParser } from "../../base/index.js";
import type { ScrcpySetClipboardControlMessage } from "../../latest.js";
export declare const AckClipboardDeviceMessage: import("@yume-chan/struct").Struct<{
    sequence: import("@yume-chan/struct").NumberField<bigint>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    sequence: import("@yume-chan/struct").NumberField<bigint>;
}>>;
export declare const SetClipboardControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").NumberField<number>;
    sequence: import("@yume-chan/struct").NumberField<bigint>;
    paste: import("@yume-chan/struct").Field<boolean, never, never, number>;
    content: import("@yume-chan/struct").Field<string, string, never, string>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").NumberField<number>;
    sequence: import("@yume-chan/struct").NumberField<bigint>;
    paste: import("@yume-chan/struct").Field<boolean, never, never, number>;
    content: import("@yume-chan/struct").Field<string, string, never, string>;
}>>;
export type SetClipboardControlMessage = StructInit<typeof SetClipboardControlMessage>;
export declare class AckClipboardHandler implements ScrcpyDeviceMessageParser {
    #private;
    readonly id = 1;
    parse(_id: number, stream: AsyncExactReadable): Promise<undefined>;
    close(): void;
    error(e?: unknown): void;
    serializeSetClipboardControlMessage(message: ScrcpySetClipboardControlMessage): Uint8Array | [Uint8Array, Promise<void>];
}
//# sourceMappingURL=set-clipboard.d.ts.map