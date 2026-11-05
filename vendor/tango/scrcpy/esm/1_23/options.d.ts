import type { MaybePromiseLike } from "@yume-chan/async";
import type { ReadableStream, TransformStream } from "@yume-chan/stream-extra";
import type { ScrcpyControlMessageType, ScrcpyDisplay, ScrcpyEncoder, ScrcpyMediaStreamPacket, ScrcpyOptions, ScrcpyOptionsListEncoders, ScrcpyScrollController, ScrcpyVideoStream } from "../base/index.js";
import { ScrcpyDeviceMessageParsers } from "../base/index.js";
import type { ScrcpyBackOrScreenOnControlMessage, ScrcpyInjectTouchControlMessage, ScrcpySetClipboardControlMessage } from "../latest.js";
import type { Init } from "./impl/index.js";
export declare class ScrcpyOptions1_23 implements ScrcpyOptions<Init>, ScrcpyOptionsListEncoders {
    #private;
    static readonly Defaults: {
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
    createMediaStreamTransformer(): TransformStream<Uint8Array, ScrcpyMediaStreamPacket>;
    serializeInjectTouchControlMessage(message: ScrcpyInjectTouchControlMessage): Uint8Array;
    serializeBackOrScreenOnControlMessage(message: ScrcpyBackOrScreenOnControlMessage): Uint8Array | undefined;
    serializeSetClipboardControlMessage(message: ScrcpySetClipboardControlMessage): Uint8Array | [Uint8Array, Promise<void>];
    createScrollController(): ScrcpyScrollController;
}
type Init_ = Init;
export declare namespace ScrcpyOptions1_23 {
    type Init = Init_;
}
export {};
//# sourceMappingURL=options.d.ts.map