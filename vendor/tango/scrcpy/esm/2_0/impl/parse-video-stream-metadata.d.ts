import type { MaybePromiseLike } from "@yume-chan/async";
import type { ReadableStream } from "@yume-chan/stream-extra";
import type { ScrcpyVideoStream } from "../../base/video.js";
import type { Init } from "./init.js";
export declare function parseVideoStreamMetadata(options: Pick<Required<Init>, "sendDeviceMeta" | "sendCodecMeta" | "videoCodec">, stream: ReadableStream<Uint8Array>): MaybePromiseLike<ScrcpyVideoStream>;
//# sourceMappingURL=parse-video-stream-metadata.d.ts.map