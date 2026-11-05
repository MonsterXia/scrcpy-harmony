import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay, ScrcpyEncoder } from "@yume-chan/scrcpy";
import { ScrcpyOptions2_6 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "./client-options.js";
import type { AdbScrcpyConnection } from "./connection.js";
import type { AdbScrcpyOptions, AdbScrcpyOptionsGetEncoders } from "./types.js";
export declare class AdbScrcpyOptions2_6<TVideo extends boolean> extends ScrcpyOptions2_6<TVideo> implements AdbScrcpyOptions<ScrcpyOptions2_6.Init<TVideo>>, AdbScrcpyOptionsGetEncoders {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions2_6.Init<TVideo>, clientOptions?: AdbScrcpyClientOptions);
    getEncoders(adb: Adb, path: string): Promise<ScrcpyEncoder[]>;
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions2_6 {
    type Init<TVideo extends boolean = boolean> = ScrcpyOptions2_6.Init<TVideo>;
}
//# sourceMappingURL=2_6.d.ts.map