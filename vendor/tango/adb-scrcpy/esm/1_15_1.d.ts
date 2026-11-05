import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay } from "@yume-chan/scrcpy";
import { ScrcpyOptions1_15_1 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "./client-options.js";
import type { AdbScrcpyConnection } from "./connection.js";
import type { AdbScrcpyOptions } from "./types.js";
export declare class AdbScrcpyOptions1_15_1 extends ScrcpyOptions1_15_1 implements AdbScrcpyOptions<ScrcpyOptions1_15_1.Init> {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions1_15_1.Init, clientOptions?: AdbScrcpyClientOptions);
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions1_15_1 {
    type Init = ScrcpyOptions1_15_1.Init;
}
//# sourceMappingURL=1_15_1.d.ts.map