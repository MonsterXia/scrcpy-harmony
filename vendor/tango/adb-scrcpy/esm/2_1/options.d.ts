import type { Adb, AdbNoneProtocolSpawner } from "@yume-chan/adb";
import type { ScrcpyDisplay, ScrcpyEncoder } from "@yume-chan/scrcpy";
import { ScrcpyOptions2_1 } from "@yume-chan/scrcpy";
import type { AdbScrcpyClientOptions } from "../client-options.js";
import type { AdbScrcpyConnection } from "../connection.js";
import type { AdbScrcpyOptions, AdbScrcpyOptionsGetEncoders } from "../types.js";
export declare class AdbScrcpyOptions2_1<TVideo extends boolean> extends ScrcpyOptions2_1<TVideo> implements AdbScrcpyOptions<ScrcpyOptions2_1.Init<TVideo>>, AdbScrcpyOptionsGetEncoders {
    readonly version: string;
    readonly spawner: AdbNoneProtocolSpawner | undefined;
    constructor(init: ScrcpyOptions2_1.Init<TVideo>, clientOptions?: AdbScrcpyClientOptions);
    getEncoders(adb: Adb, path: string): Promise<ScrcpyEncoder[]>;
    getDisplays(adb: Adb, path: string): Promise<ScrcpyDisplay[]>;
    createConnection(adb: Adb): AdbScrcpyConnection;
}
export declare namespace AdbScrcpyOptions2_1 {
    type Init<TVideo extends boolean = boolean> = ScrcpyOptions2_1.Init<TVideo>;
}
//# sourceMappingURL=options.d.ts.map