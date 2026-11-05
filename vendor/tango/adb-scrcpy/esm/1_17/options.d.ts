import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay } from "@yume-chan/scrcpy";
import { ScrcpyOptions1_17 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "../client-options.js";
import type { AdbScrcpyConnection } from "../connection.js";
import type { AdbScrcpyOptions } from "../types.js";
export declare class AdbScrcpyOptions1_17 extends ScrcpyOptions1_17 implements AdbScrcpyOptions<ScrcpyOptions1_17.Init> {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions1_17.Init, clientOptions?: AdbScrcpyClientOptions);
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions1_17 {
    type Init = ScrcpyOptions1_17.Init;
}
//# sourceMappingURL=options.d.ts.map