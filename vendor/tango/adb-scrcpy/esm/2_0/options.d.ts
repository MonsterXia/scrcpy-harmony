import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay, ScrcpyEncoder } from "@yume-chan/scrcpy";
import { ScrcpyOptions2_0 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "../client-options.js";
import type { AdbScrcpyConnection } from "../connection.js";
import type { AdbScrcpyOptions, AdbScrcpyOptionsGetEncoders } from "../types.js";
export declare class AdbScrcpyOptions2_0 extends ScrcpyOptions2_0 implements AdbScrcpyOptions<ScrcpyOptions2_0.Init>, AdbScrcpyOptionsGetEncoders {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions2_0.Init, clientOptions?: AdbScrcpyClientOptions);
    getEncoders(adb: Adb, path: string): Promise<ScrcpyEncoder[]>;
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions2_0 {
    type Init = ScrcpyOptions2_0.Init;
}
//# sourceMappingURL=options.d.ts.map