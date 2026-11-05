import type { Adb } from "@yume-chan/adb";
import type { ScrcpyOptions2_1 } from "@yume-chan/scrcpy";
import type { AdbScrcpyConnection } from "../../connection.js";
export declare function createConnection(adb: Adb, options: Required<Pick<ScrcpyOptions2_1.Init<boolean>, "tunnelForward" | "control" | "sendDummyByte" | "scid" | "audio" | "video">>): AdbScrcpyConnection;
//# sourceMappingURL=create-connection.d.ts.map