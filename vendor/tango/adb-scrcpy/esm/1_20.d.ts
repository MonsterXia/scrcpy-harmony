import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay, ScrcpyEncoder } from "@yume-chan/scrcpy";
import { ScrcpyOptions1_20 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "./client-options.js";
import type { AdbScrcpyConnection } from "./connection.js";
import type { AdbScrcpyOptions, AdbScrcpyOptionsGetEncoders } from "./types.js";
export declare class AdbScrcpyOptions1_20 extends ScrcpyOptions1_20 implements AdbScrcpyOptions<ScrcpyOptions1_20.Init>, AdbScrcpyOptionsGetEncoders {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions1_20.Init, clientOptions?: AdbScrcpyClientOptions);
    getEncoders(adb: Adb, path: string): Promise<ScrcpyEncoder[]>;
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions1_20 {
    type Init = ScrcpyOptions1_20.Init;
}
//# sourceMappingURL=1_20.d.ts.map