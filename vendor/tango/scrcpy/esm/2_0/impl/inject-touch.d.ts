import type { StructInit } from "@yume-chan/struct";
import type { AndroidMotionEventAction } from "../../android/motion-event.js";
import type { ScrcpyInjectTouchControlMessage } from "../../latest.js";
export declare const InjectTouchControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").Field<2, never, never, number>;
    action: import("@yume-chan/struct").Field<AndroidMotionEventAction, never, never, number>;
    pointerId: import("@yume-chan/struct").NumberField<bigint>;
    pointerX: import("@yume-chan/struct").NumberField<number>;
    pointerY: import("@yume-chan/struct").NumberField<number>;
    videoWidth: import("@yume-chan/struct").NumberField<number>;
    videoHeight: import("@yume-chan/struct").NumberField<number>;
    pressure: import("@yume-chan/struct").Field<number, never, never, number>;
    actionButton: import("@yume-chan/struct").NumberField<number>;
    buttons: import("@yume-chan/struct").NumberField<number>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").Field<2, never, never, number>;
    action: import("@yume-chan/struct").Field<AndroidMotionEventAction, never, never, number>;
    pointerId: import("@yume-chan/struct").NumberField<bigint>;
    pointerX: import("@yume-chan/struct").NumberField<number>;
    pointerY: import("@yume-chan/struct").NumberField<number>;
    videoWidth: import("@yume-chan/struct").NumberField<number>;
    videoHeight: import("@yume-chan/struct").NumberField<number>;
    pressure: import("@yume-chan/struct").Field<number, never, never, number>;
    actionButton: import("@yume-chan/struct").NumberField<number>;
    buttons: import("@yume-chan/struct").NumberField<number>;
}>>;
export type InjectTouchControlMessage = StructInit<typeof InjectTouchControlMessage>;
export declare function serializeInjectTouchControlMessage(message: ScrcpyInjectTouchControlMessage): Uint8Array;
//# sourceMappingURL=inject-touch.d.ts.map