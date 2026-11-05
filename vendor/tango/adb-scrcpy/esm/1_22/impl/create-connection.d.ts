import type { Adb } from "@yume-chan/adb";
import type { ScrcpyOptions1_22 } from "@yume-chan/scrcpy";
import type { AdbScrcpyConnection } from "../../connection.js";
export declare function createConnection(adb: Adb, options: Required<Pick<ScrcpyOptions1_22.Init, "tunnelForward" | "control" | "sendDummyByte">>): AdbScrcpyConnection;
//# sourceMappingURL=create-connection.d.ts.map