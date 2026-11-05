import type { Adb, AdbNoneProtocolProcess } from "@yume-chan/adb";
import type { ScrcpyAudioStreamDisabledMetadata, ScrcpyAudioStreamErroredMetadata, ScrcpyAudioStreamSuccessMetadata, ScrcpyDisplay, ScrcpyEncoder, ScrcpyMediaStreamPacket, ScrcpyOptions1_15 } from "@yume-chan/scrcpy";
import { ScrcpyControlMessageWriter } from "@yume-chan/scrcpy";
import type { Consumable, MaybeConsumable, ReadableStream, ReadableWritablePair } from "@yume-chan/stream-extra";
import type { AdbScrcpyOptions, AdbScrcpyOptionsGetEncoders } from "./types.js";
import { AdbScrcpyVideoStream } from "./video.js";
export declare class AdbScrcpyExitedError extends Error {
    output: readonly string[];
    constructor(output: readonly string[]);
}
interface AdbScrcpyClientInit<TOptions extends AdbScrcpyOptions<object>> {
    options: TOptions;
    process: AdbNoneProtocolProcess;
    output: ReadableStream<string>;
    videoStream: ReadableStream<Uint8Array> | undefined;
    audioStream: ReadableStream<Uint8Array> | undefined;
    controlStream: ReadableWritablePair<Uint8Array, Consumable<Uint8Array>> | undefined;
}
export interface AdbScrcpyAudioStreamSuccessMetadata extends Omit<ScrcpyAudioStreamSuccessMetadata, "stream"> {
    readonly stream: ReadableStream<ScrcpyMediaStreamPacket>;
}
export type AdbScrcpyAudioStreamMetadata = ScrcpyAudioStreamDisabledMetadata | ScrcpyAudioStreamErroredMetadata | AdbScrcpyAudioStreamSuccessMetadata;
export declare class AdbScrcpyClient<TOptions extends AdbScrcpyOptions<object>> {
    #private;
    static pushServer(adb: Adb, file: ReadableStream<MaybeConsumable<Uint8Array>>, filename?: string): Promise<void>;
    static start<TOptions extends AdbScrcpyOptions<Pick<ScrcpyOptions1_15.Init, "tunnelForward">>>(adb: Adb, path: string, options: TOptions): Promise<AdbScrcpyClient<TOptions>>;
    /**
     * This method will modify the given `options`,
     * so don't reuse it elsewhere.
     */
    static getEncoders(adb: Adb, path: string, options: AdbScrcpyOptions<object> & AdbScrcpyOptionsGetEncoders): Promise<ScrcpyEncoder[]>;
    /**
     * This method will modify the given `options`,
     * so don't reuse it elsewhere.
     */
    static getDisplays(adb: Adb, path: string, options: AdbScrcpyOptions<object>): Promise<ScrcpyDisplay[]>;
    get output(): ReadableStream<string>;
    get exited(): Promise<void>;
    /**
     * Gets a `Promise` that resolves to the parsed video stream.
     *
     * On server version 2.1 and above, it will be `undefined` if
     * video is disabled by `options.video: false`.
     *
     * Note: if it's not `undefined`, it must be consumed to prevent
     * the connection from being blocked.
     */
    get videoStream(): TOptions["value"] extends {
        video: infer T;
    } ? T extends false ? undefined : Promise<AdbScrcpyVideoStream> : Promise<AdbScrcpyVideoStream>;
    /**
     * Gets a `Promise` that resolves to the parsed audio stream.
     *
     * On server versions before 2.0, it will always be `undefined`.
     * On server version 2.0 and above, it will be `undefined` if
     * audio is disabled by `options.audio: false`.
     *
     * Note: if it's not `undefined`, it must be consumed to prevent
     * the connection from being blocked.
     */
    get audioStream(): Promise<AdbScrcpyAudioStreamMetadata> | undefined;
    /**
     * Gets the control message writer.
     *
     * On server version 1.22 and above, it will be `undefined` if
     * control is disabled by `options.control: false`.
     */
    get controller(): ScrcpyControlMessageWriter | undefined;
    get clipboard(): ReadableStream<string> | undefined;
    constructor({ options, process, output, videoStream, audioStream, controlStream, }: AdbScrcpyClientInit<TOptions>);
    close(): Promise<void>;
}
export {};
//# sourceMappingURL=client.d.ts.map