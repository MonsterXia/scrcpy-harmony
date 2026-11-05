import { TransformStream } from "@yume-chan/stream-extra";
import type { ScrcpyMediaStreamPacket } from "../../base/index.js";
import type { Init } from "./init.js";
export declare const PtsKeyframe: bigint;
export declare function createMediaStreamTransformer(options: Pick<Init, "sendFrameMeta">): TransformStream<Uint8Array, ScrcpyMediaStreamPacket>;
//# sourceMappingURL=media-stream-transformer.d.ts.map