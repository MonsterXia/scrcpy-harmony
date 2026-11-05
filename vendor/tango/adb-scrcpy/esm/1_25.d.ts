import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay, ScrcpyEncoder } from "@yume-chan/scrcpy";
import { ScrcpyOptions1_25 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "./client-options.js";
import type { AdbScrcpyConnection } from "./connection.js";
import type { AdbScrcpyOptions, AdbScrcpyOptionsGetEncoders } from "./types.js";
export declare class AdbScrcpyOptions1_25 extends ScrcpyOptions1_25 implements AdbScrcpyOptions<ScrcpyOptions1_25.Init>, AdbScrcpyOptionsGetEncoders {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions1_25.Init, clientOptions?: AdbScrcpyClientOptions);
    getEncoders(adb: Adb, path: string): Promise<ScrcpyEncoder[]>;
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions1_25 {
    type Init = ScrcpyOptions1_25.Init;
}
//# sourceMappingURL=1_25.d.ts.map