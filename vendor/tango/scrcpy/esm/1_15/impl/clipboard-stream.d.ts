import { PushReadableStream } from "@yume-chan/stream-extra";
import type { AsyncExactReadable } from "@yume-chan/struct";
import type { ScrcpyDeviceMessageParser } from "../../base/index.js";
export declare const ClipboardDeviceMessage: import("@yume-chan/struct").Struct<{
    content: import("@yume-chan/struct").Field<string, string, never, string>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    content: import("@yume-chan/struct").Field<string, string, never, string>;
}>>;
export declare class ClipboardStream extends PushReadableStream<string> implements ScrcpyDeviceMessageParser {
    #private;
    readonly id = 0;
    constructor();
    parse(_id: number, stream: AsyncExactReadable): Promise<undefined>;
    close(): void;
    error(e?: unknown): void;
}
//# sourceMappingURL=clipboard-stream.d.ts.map