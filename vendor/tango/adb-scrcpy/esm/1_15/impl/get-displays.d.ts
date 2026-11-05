import type { Adb } from "@yume-chan/adb";
import type { ScrcpyDisplay, ScrcpyOptions1_15 } from "@yume-chan/scrcpy";
import type { AdbScrcpyOptions } from "../../types.js";
export declare function getDisplays(adb: Adb, path: string, options: AdbScrcpyOptions<Pick<ScrcpyOptions1_15.Init, "tunnelForward">>): Promise<ScrcpyDisplay[]>;
//# sourceMappingURL=get-displays.d.ts.map