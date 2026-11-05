import type { ScrcpyScrollController } from "../../base/index.js";
import type { ScrcpyInjectScrollControlMessage } from "../../latest.js";
export declare class ScrollController implements ScrcpyScrollController {
    serializeScrollMessage(message: ScrcpyInjectScrollControlMessage): Uint8Array | undefined;
}
export declare function createScrollController(): ScrcpyScrollController;
//# sourceMappingURL=scroll-controller.d.ts.map