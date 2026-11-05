import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay } from "@yume-chan/scrcpy";
import { ScrcpyOptions1_15 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "../client-options.js";
import type { AdbScrcpyConnection } from "../connection.js";
import type { AdbScrcpyOptions } from "../types.js";
export declare class AdbScrcpyOptions1_15 extends ScrcpyOptions1_15 implements AdbScrcpyOptions<ScrcpyOptions1_15.Init> {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions1_15.Init, clientOptions?: AdbScrcpyClientOptions);
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions1_15 {
    type Init = ScrcpyOptions1_15.Init;
}
//# sourceMappingURL=options.d.ts.map