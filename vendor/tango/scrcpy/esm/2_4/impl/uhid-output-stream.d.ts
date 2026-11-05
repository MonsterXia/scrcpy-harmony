import { PushReadableStream } from "@yume-chan/stream-extra";
import type { AsyncExactReadable, StructValue } from "@yume-chan/struct";
import type { ScrcpyDeviceMessageParser } from "../../base/index.js";
export declare const UHidOutputDeviceMessage: import("@yume-chan/struct").Struct<{
    id: import("@yume-chan/struct").NumberField<number>;
    data: import("@yume-chan/struct").Field<Uint8Array<ArrayBufferLike>, string, never, Uint8Array<ArrayBufferLike>>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    id: import("@yume-chan/struct").NumberField<number>;
    data: import("@yume-chan/struct").Field<Uint8Array<ArrayBufferLike>, string, never, Uint8Array<ArrayBufferLike>>;
}>>;
export type UHidOutputDeviceMessage = StructValue<typeof UHidOutputDeviceMessage>;
export declare class UHidOutputStream extends PushReadableStream<UHidOutputDeviceMessage> implements ScrcpyDeviceMessageParser {
    #private;
    readonly id = 2;
    constructor();
    parse(_id: number, stream: AsyncExactReadable): Promise<undefined>;
    close(): void;
    error(e?: unknown): void;
}
//# sourceMappingURL=uhid-output-stream.d.ts.map