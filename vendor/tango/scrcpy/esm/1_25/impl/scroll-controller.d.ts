import type { Field, StructInit } from "@yume-chan/struct";
import type { ScrcpyScrollController } from "../../base/index.js";
import type { ScrcpyInjectScrollControlMessage } from "../../latest.js";
export declare const SignedFloat: Field<number, never, never>;
export declare const InjectScrollControlMessage: import("@yume-chan/struct").Struct<{
    type: Field<3, never, never, number>;
    pointerX: import("@yume-chan/struct").NumberField<number>;
    pointerY: import("@yume-chan/struct").NumberField<number>;
    videoWidth: import("@yume-chan/struct").NumberField<number>;
    videoHeight: import("@yume-chan/struct").NumberField<number>;
    scrollX: Field<number, never, never, number>;
    scrollY: Field<number, never, never, number>;
    buttons: import("@yume-chan/struct").NumberField<number>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: Field<3, never, never, number>;
    pointerX: import("@yume-chan/struct").NumberField<number>;
    pointerY: import("@yume-chan/struct").NumberField<number>;
    videoWidth: import("@yume-chan/struct").NumberField<number>;
    videoHeight: import("@yume-chan/struct").NumberField<number>;
    scrollX: Field<number, never, never, number>;
    scrollY: Field<number, never, never, number>;
    buttons: import("@yume-chan/struct").NumberField<number>;
}>>;
export type InjectScrollControlMessage = StructInit<typeof InjectScrollControlMessage>;
export declare class ScrollController implements ScrcpyScrollController {
    serializeScrollMessage(message: ScrcpyInjectScrollControlMessage): Uint8Array | undefined;
}
export declare function createScrollController(): ScrcpyScrollController;
//# sourceMappingURL=scroll-controller.d.ts.map