import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay, ScrcpyEncoder } from "@yume-chan/scrcpy";
import { ScrcpyOptions1_22 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "../client-options.js";
import type { AdbScrcpyConnection } from "../connection.js";
import type { AdbScrcpyOptions, AdbScrcpyOptionsGetEncoders } from "../types.js";
export declare class AdbScrcpyOptions1_22 extends ScrcpyOptions1_22 implements AdbScrcpyOptions<ScrcpyOptions1_22.Init>, AdbScrcpyOptionsGetEncoders {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions1_22.Init, clientOptions?: AdbScrcpyClientOptions);
    getEncoders(adb: Adb, path: string): Promise<ScrcpyEncoder[]>;
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions1_22 {
    type Init = ScrcpyOptions1_22.Init;
}
//# sourceMappingURL=options.d.ts.map