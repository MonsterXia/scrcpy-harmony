import type { ReadableStream } from "@yume-chan/stream-extra";
import type { Init } from "../../2_3/impl/init.js";
import type { ScrcpyAudioStreamMetadata } from "../../base/index.js";
export declare function parseAudioStreamMetadata(stream: ReadableStream<Uint8Array>, options: Pick<Required<Init<boolean>>, "sendCodecMeta" | "audioCodec">): Promise<ScrcpyAudioStreamMetadata>;
//# sourceMappingURL=parse-audio-stream-metadata.d.ts.map