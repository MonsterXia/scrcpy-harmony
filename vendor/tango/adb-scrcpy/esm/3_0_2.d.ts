import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay, ScrcpyEncoder } from "@yume-chan/scrcpy";
import { ScrcpyOptions3_0_2 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "./client-options.js";
import type { AdbScrcpyConnection } from "./connection.js";
import type { AdbScrcpyOptions, AdbScrcpyOptionsGetEncoders } from "./types.js";
export declare class AdbScrcpyOptions3_0_2<TVideo extends boolean> extends ScrcpyOptions3_0_2<TVideo> implements AdbScrcpyOptions<ScrcpyOptions3_0_2.Init<TVideo>>, AdbScrcpyOptionsGetEncoders {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions3_0_2.Init<TVideo>, clientOptions?: AdbScrcpyClientOptions);
    getEncoders(adb: Adb, path: string): Promise<ScrcpyEncoder[]>;
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions3_0_2 {
    type Init<TVideo extends boolean = boolean> = ScrcpyOptions3_0_2.Init<TVideo>;
}
//# sourceMappingURL=3_0_2.d.ts.map