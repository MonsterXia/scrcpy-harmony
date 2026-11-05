import type { Adb } from "@yume-chan/adb";
import type { ScrcpyEncoder, ScrcpyOptions2_0, ScrcpyOptionsListEncoders } from "@yume-chan/scrcpy";
import type { AdbScrcpyOptions } from "../../types.js";
export declare function getEncoders(adb: Adb, path: string, options: AdbScrcpyOptions<Pick<ScrcpyOptions2_0.Init, "tunnelForward">> & ScrcpyOptionsListEncoders): Promise<ScrcpyEncoder[]>;
//# sourceMappingURL=get-encoders.d.ts.map