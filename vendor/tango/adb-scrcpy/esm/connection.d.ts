import type { Adb } from "@yume-chan/adb";
import type { MaybePromiseLike } from "@yume-chan/async";
import type { Disposable } from "@yume-chan/event";
import type { Consumable, ReadableStream, ReadableWritablePair } from "@yume-chan/stream-extra";
export interface AdbScrcpyConnectionOptions {
    scid: string | undefined;
    video: boolean;
    audio: boolean;
    /**
     * Whether to create a control stream
     */
    control: boolean;
    /**
     * In forward tunnel mode, read a byte from video socket on start to detect connection issues
     */
    sendDummyByte: boolean;
}
export declare const SCRCPY_SOCKET_NAME_PREFIX = "scrcpy";
export interface AdbScrcpyConnectionStreams {
    video?: ReadableStream<Uint8Array>;
    audio?: ReadableStream<Uint8Array>;
    control?: ReadableWritablePair<Uint8Array, Consumable<Uint8Array>>;
}
export declare abstract class AdbScrcpyConnection implements Disposable {
    protected adb: Adb;
    protected options: AdbScrcpyConnectionOptions;
    protected socketName: string;
    constructor(adb: Adb, options: AdbScrcpyConnectionOptions);
    initialize(): MaybePromiseLike<void>;
    protected getSocketName(): string;
    abstract getStreams(): MaybePromiseLike<AdbScrcpyConnectionStreams>;
    dispose(): void;
}
export declare class AdbScrcpyForwardConnection extends AdbScrcpyConnection {
    #private;
    getStreams(): Promise<AdbScrcpyConnectionStreams>;
    dispose(): void;
}
export declare class AdbScrcpyReverseConnection extends AdbScrcpyConnection {
    #private;
    initialize(): Promise<void>;
    getStreams(): Promise<AdbScrcpyConnectionStreams>;
    dispose(): void;
}
//# sourceMappingURL=connection.d.ts.map