import type { ReadableStream } from "@yume-chan/stream-extra";
import type { AsyncExactReadable } from "@yume-chan/struct";
import type { ScrcpyVideoStream } from "../../base/index.js";
/**
 * Parse a fixed-length, null-terminated string.
 * @param stream The stream to read from
 * @param maxLength The maximum length of the string, including the null terminator, in bytes
 * @returns The parsed string, without the null terminator
 */
export declare function readString(stream: AsyncExactReadable, maxLength: number): Promise<string>;
export declare function readU16(stream: AsyncExactReadable): Promise<number>;
export declare function readU32(stream: AsyncExactReadable): Promise<number>;
export declare function parseVideoStreamMetadata(stream: ReadableStream<Uint8Array>): Promise<ScrcpyVideoStream>;
//# sourceMappingURL=parse-video-stream-metadata.d.ts.map