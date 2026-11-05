import type { ScrcpyOptionValue } from "../../base/index.js";
import type { PrevImpl } from "./prev.js";
export declare class InstanceId implements ScrcpyOptionValue {
    static readonly NONE: InstanceId;
    static random(): InstanceId;
    value: number;
    constructor(value: number);
    toOptionValue(): string | undefined;
}
export interface Init extends Omit<PrevImpl.Init, "bitRate" | "codecOptions" | "encoderName"> {
    scid?: InstanceId | string | undefined;
    videoCodec?: "h264" | "h265" | "av1";
    videoBitRate?: number;
    videoCodecOptions?: PrevImpl.CodecOptions | string | undefined;
    videoEncoder?: string | undefined;
    audio?: boolean;
    audioCodec?: "raw" | "opus" | "aac";
    audioBitRate?: number;
    audioCodecOptions?: PrevImpl.CodecOptions | string | undefined;
    audioEncoder?: string | undefined;
    listEncoders?: boolean;
    listDisplays?: boolean;
    sendCodecMeta?: boolean;
}
//# sourceMappingURL=init.d.ts.map