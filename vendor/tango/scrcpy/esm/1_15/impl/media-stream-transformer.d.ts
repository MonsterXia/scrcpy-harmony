import { TransformStream } from "@yume-chan/stream-extra";
import type { ScrcpyMediaStreamPacket } from "../../base/index.js";
import type { Init } from "./init.js";
export declare const MediaStreamRawPacket: import("@yume-chan/struct").Struct<{
    pts: import("@yume-chan/struct").NumberField<bigint>;
    data: import("@yume-chan/struct").Field<Uint8Array<ArrayBufferLike>, string, never, Uint8Array<ArrayBufferLike>>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    pts: import("@yume-chan/struct").NumberField<bigint>;
    data: import("@yume-chan/struct").Field<Uint8Array<ArrayBufferLike>, string, never, Uint8Array<ArrayBufferLike>>;
}>>;
export declare const PtsConfig: bigint;
export declare function createMediaStreamTransformer(options: Pick<Init, "sendFrameMeta">): TransformStream<Uint8Array, ScrcpyMediaStreamPacket>;
//# sourceMappingURL=media-stream-transformer.d.ts.map