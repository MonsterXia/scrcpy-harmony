import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay, ScrcpyEncoder } from "@yume-chan/scrcpy";
import { ScrcpyOptions2_2 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "./client-options.js";
import type { AdbScrcpyConnection } from "./connection.js";
import type { AdbScrcpyOptions, AdbScrcpyOptionsGetEncoders } from "./types.js";
export declare class AdbScrcpyOptions2_2<TVideo extends boolean> extends ScrcpyOptions2_2<TVideo> implements AdbScrcpyOptions<ScrcpyOptions2_2.Init<TVideo>>, AdbScrcpyOptionsGetEncoders {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions2_2.Init<TVideo>, clientOptions?: AdbScrcpyClientOptions);
    getEncoders(adb: Adb, path: string): Promise<ScrcpyEncoder[]>;
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions2_2 {
    type Init<TVideo extends boolean = boolean> = ScrcpyOptions2_2.Init<TVideo>;
}
//# sourceMappingURL=2_2.d.ts.map