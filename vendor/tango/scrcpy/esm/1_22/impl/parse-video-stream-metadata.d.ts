import type { ReadableStream } from "@yume-chan/stream-extra";
import type { ScrcpyVideoStream } from "../../base/video.js";
import type { Init } from "./init.js";
export declare function parseVideoStreamMetadata(options: Pick<Init, "sendDeviceMeta">, stream: ReadableStream<Uint8Array>): Promise<ScrcpyVideoStream>;
//# sourceMappingURL=parse-video-stream-metadata.d.ts.map