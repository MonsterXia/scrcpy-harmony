import type { AsyncExactReadable } from "@yume-chan/struct";
export interface ScrcpyDeviceMessageParser {
    readonly id: number | readonly number[];
    parse(id: number, stream: AsyncExactReadable): Promise<undefined>;
    close(): void;
    error(e?: unknown): void;
}
export declare class ScrcpyDeviceMessageParsers {
    #private;
    get parsers(): readonly ScrcpyDeviceMessageParser[];
    add<T extends ScrcpyDeviceMessageParser>(parser: T): T;
    parse(id: number, stream: AsyncExactReadable): Promise<undefined>;
    close(): void;
    error(e?: unknown): void;
}
//# sourceMappingURL=device-message.d.ts.map