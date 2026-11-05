import type { MaybePromiseLike } from "@yume-chan/async";
import type { ReadableStream, TransformStream } from "@yume-chan/stream-extra";
import type { ScrcpyAudioStreamMetadata, ScrcpyControlMessageType, ScrcpyDisplay, ScrcpyEncoder, ScrcpyMediaStreamPacket, ScrcpyOptions, ScrcpyOptionsListEncoders, ScrcpyScrollController, ScrcpyVideoStream } from "../base/index.js";
import { ScrcpyDeviceMessageParsers } from "../base/index.js";
import type { ScrcpyBackOrScreenOnControlMessage, ScrcpyInjectTouchControlMessage, ScrcpySetClipboardControlMessage } from "../latest.js";
import type { Init } from "./impl/index.js";
export declare class ScrcpyOptions2_0 implements ScrcpyOptions<Init>, ScrcpyOptionsListEncoders {
    #private;
    static readonly Defaults: {
        readonly scid: undefined;
        readonly videoCodec: "h264";
        readonly videoBitRate: 8000000;
        readonly videoCodecOptions: undefined;
        readonly videoEncoder: undefined;
        readonly audio: true;
        readonly audioCodec: "opus";
        readonly audioBitRate: 128000;
        readonly audioCodecOptions: undefined;
        readonly audioEncoder: undefined;
        readonly listEncoders: false;
        readonly listDisplays: false;
        readonly sendCodecMeta: true;
        readonly powerOn: true;
        readonly cleanup: true;
        readonly downsizeOnError: true;
        readonly sendDeviceMeta: true;
        readonly sendDummyByte: true;
        readonly clipboardAutosync: true;
        readonly logLevel: "debug";
        readonly lockVideoOrientation: -1;
        readonly powerOffOnClose: false;
        readonly encoderName: undefined;
        readonly maxSize: 0;
        readonly bitRate: 8000000;
        readonly maxFps: 0;
        readonly tunnelForward: false;
        readonly crop: undefined;
        readonly sendFrameMeta: true;
        readonly control: true;
        readonly displayId: 0;
        readonly showTouches: false;
        readonly stayAwake: false;
        readonly codecOptions: undefined;
    };
    readonly value: Required<Init>;
    get controlMessageTypes(): readonly ScrcpyControlMessageType[];
    get clipboard(): ReadableStream<string> | undefined;
    get deviceMessageParsers(): ScrcpyDeviceMessageParsers;
    constructor(init: Init);
    serialize(): string[];
    setListDisplays(): void;
    parseDisplay(line: string): ScrcpyDisplay | undefined;
    setListEncoders(): void;
    parseEncoder(line: string): ScrcpyEncoder | undefined;
    parseVideoStreamMetadata(stream: ReadableStream<Uint8Array>): MaybePromiseLike<ScrcpyVideoStream>;
    parseAudioStreamMetadata(stream: ReadableStream<Uint8Array>): MaybePromiseLike<ScrcpyAudioStreamMetadata>;
    createMediaStreamTransformer(): TransformStream<Uint8Array, ScrcpyMediaStreamPacket>;
    serializeInjectTouchControlMessage(message: ScrcpyInjectTouchControlMessage): Uint8Array;
    serializeBackOrScreenOnControlMessage(message: ScrcpyBackOrScreenOnControlMessage): Uint8Array | undefined;
    serializeSetClipboardControlMessage(message: ScrcpySetClipboardControlMessage): Uint8Array | [Uint8Array, Promise<void>];
    createScrollController(): ScrcpyScrollController;
}
type Init_ = Init;
export declare namespace ScrcpyOptions2_0 {
    type Init = Init_;
}
export {};
//# sourceMappingURL=options.d.ts.map