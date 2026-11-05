import type { StructInit } from "@yume-chan/struct";
import type { ScrcpyScrollController } from "../../base/index.js";
import type { ScrcpyInjectScrollControlMessage } from "../../latest.js";
export declare const InjectScrollControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").NumberField<number>;
    pointerX: import("@yume-chan/struct").NumberField<number>;
    pointerY: import("@yume-chan/struct").NumberField<number>;
    videoWidth: import("@yume-chan/struct").NumberField<number>;
    videoHeight: import("@yume-chan/struct").NumberField<number>;
    scrollX: import("@yume-chan/struct").NumberField<number>;
    scrollY: import("@yume-chan/struct").NumberField<number>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").NumberField<number>;
    pointerX: import("@yume-chan/struct").NumberField<number>;
    pointerY: import("@yume-chan/struct").NumberField<number>;
    videoWidth: import("@yume-chan/struct").NumberField<number>;
    videoHeight: import("@yume-chan/struct").NumberField<number>;
    scrollX: import("@yume-chan/struct").NumberField<number>;
    scrollY: import("@yume-chan/struct").NumberField<number>;
}>>;
export type InjectScrollControlMessage = StructInit<typeof InjectScrollControlMessage>;
/**
 * Old version of Scrcpy server only supports integer values for scroll.
 *
 * Accumulate scroll values and send scroll message when accumulated value
 * reaches 1 or -1.
 */
export declare class ScrollController implements ScrcpyScrollController {
    #private;
    protected processMessage(message: ScrcpyInjectScrollControlMessage): ScrcpyInjectScrollControlMessage | undefined;
    serializeScrollMessage(message: ScrcpyInjectScrollControlMessage): Uint8Array | undefined;
}
export declare function createScrollController(): ScrcpyScrollController;
//# sourceMappingURL=scroll-controller.d.ts.map