import type { Adb } from "@yume-chan/adb";
import type { ScrcpyOptions1_15 } from "@yume-chan/scrcpy";
import type { AdbScrcpyConnection } from "../../connection.js";
export declare function createConnection(adb: Adb, options: Pick<ScrcpyOptions1_15.Init, "tunnelForward">): AdbScrcpyConnection;
//# sourceMappingURL=create-connection.d.ts.map