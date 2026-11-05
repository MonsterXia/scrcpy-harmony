import type { ReadableStream } from "@yume-chan/stream-extra";
export interface ScrcpyVideoStream {
    readonly stream: ReadableStream<Uint8Array>;
    readonly metadata: ScrcpyVideoStreamMetadata;
}
export interface ScrcpyVideoStreamMetadata {
    deviceName?: string | undefined;
    width?: number | undefined;
    height?: number | undefined;
    codec: ScrcpyVideoCodecId;
}
export declare const ScrcpyVideoCodecId: {
    readonly H264: 1748121140;
    readonly H265: 1748121141;
    readonly AV1: 6387249;
};
export type ScrcpyVideoCodecId = (typeof ScrcpyVideoCodecId)[keyof typeof ScrcpyVideoCodecId];
export declare const ScrcpyVideoCodecNameMap: Map<number, string>;
//# sourceMappingURL=video.d.ts.map