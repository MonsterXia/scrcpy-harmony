import type { StructInit } from "@yume-chan/struct";
import type { ScrcpyScrollController } from "../../base/index.js";
import type { ScrcpyInjectScrollControlMessage } from "../../latest.js";
import { PrevImpl } from "./prev.js";
export declare const InjectScrollControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").NumberField<number>;
    pointerX: import("@yume-chan/struct").NumberField<number>;
    pointerY: import("@yume-chan/struct").NumberField<number>;
    videoWidth: import("@yume-chan/struct").NumberField<number>;
    videoHeight: import("@yume-chan/struct").NumberField<number>;
    scrollX: import("@yume-chan/struct").NumberField<number>;
    scrollY: import("@yume-chan/struct").NumberField<number>;
} & {
    buttons: import("@yume-chan/struct").NumberField<number>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").NumberField<number>;
    pointerX: import("@yume-chan/struct").NumberField<number>;
    pointerY: import("@yume-chan/struct").NumberField<number>;
    videoWidth: import("@yume-chan/struct").NumberField<number>;
    videoHeight: import("@yume-chan/struct").NumberField<number>;
    scrollX: import("@yume-chan/struct").NumberField<number>;
    scrollY: import("@yume-chan/struct").NumberField<number>;
} & {
    buttons: import("@yume-chan/struct").NumberField<number>;
}>>;
export type InjectScrollControlMessage = StructInit<typeof InjectScrollControlMessage>;
export declare class ScrollController extends PrevImpl.ScrollController {
    serializeScrollMessage(message: ScrcpyInjectScrollControlMessage): Uint8Array | undefined;
}
export declare function createScrollController(): ScrcpyScrollController;
//# sourceMappingURL=scroll-controller.d.ts.map