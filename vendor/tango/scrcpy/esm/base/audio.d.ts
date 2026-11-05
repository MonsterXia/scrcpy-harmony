import type { ReadableStream } from "@yume-chan/stream-extra";
import type { ScrcpyOptionValue } from "./option-value.js";
export declare class ScrcpyAudioCodec implements ScrcpyOptionValue {
    static readonly Opus: ScrcpyAudioCodec;
    static readonly Aac: ScrcpyAudioCodec;
    static readonly Flac: ScrcpyAudioCodec;
    static readonly Raw: ScrcpyAudioCodec;
    readonly optionValue: string;
    readonly metadataValue: number;
    readonly mimeType: string;
    readonly webCodecId: string;
    constructor(optionValue: string, metadataValue: number, mimeType: string, webCodecId: string);
    toOptionValue(): string;
}
export interface ScrcpyAudioStreamDisabledMetadata {
    readonly type: "disabled";
}
export interface ScrcpyAudioStreamErroredMetadata {
    readonly type: "errored";
}
export interface ScrcpyAudioStreamSuccessMetadata {
    readonly type: "success";
    readonly codec: ScrcpyAudioCodec;
    readonly stream: ReadableStream<Uint8Array>;
}
export type ScrcpyAudioStreamMetadata = ScrcpyAudioStreamDisabledMetadata | ScrcpyAudioStreamErroredMetadata | ScrcpyAudioStreamSuccessMetadata;
//# sourceMappingURL=audio.d.ts.map