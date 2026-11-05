import type { Adb } from "@yume-chan/adb";
import type { ScrcpyOptions2_0 } from "@yume-chan/scrcpy";
import type { AdbScrcpyConnection } from "../../connection.js";
export declare function createConnection(adb: Adb, options: Required<Pick<ScrcpyOptions2_0.Init, "tunnelForward" | "control" | "sendDummyByte" | "scid" | "audio">>): AdbScrcpyConnection;
//# sourceMappingURL=create-connection.d.ts.map