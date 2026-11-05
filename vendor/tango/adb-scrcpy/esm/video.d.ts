import type { ScrcpyMediaStreamPacket, ScrcpyVideoStreamMetadata } from "@yume-chan/scrcpy";
import type { ReadableStream } from "@yume-chan/stream-extra";
import type { AdbScrcpyOptions } from "./types.js";
export declare class AdbScrcpyVideoStream {
    #private;
    get metadata(): ScrcpyVideoStreamMetadata;
    get stream(): ReadableStream<ScrcpyMediaStreamPacket>;
    get sizeChanged(): import("@yume-chan/event").Event<{
        width: number;
        height: number;
    }, unknown>;
    get width(): number;
    get height(): number;
    constructor(options: AdbScrcpyOptions<object>, metadata: ScrcpyVideoStreamMetadata, stream: ReadableStream<Uint8Array>);
}
//# sourceMappingURL=video.d.ts.map