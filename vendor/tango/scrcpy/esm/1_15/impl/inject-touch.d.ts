import type { Field, StructInit } from "@yume-chan/struct";
import type { AndroidMotionEventAction } from "../../android/index.js";
import type { ScrcpyInjectTouchControlMessage } from "../../latest.js";
export declare const UnsignedFloat: Field<number, never, never>;
export declare const PointerId: {
    readonly Mouse: -1n;
    readonly Finger: -2n;
    readonly VirtualMouse: -3n;
    readonly VirtualFinger: -4n;
};
export declare const InjectTouchControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").NumberField<number>;
    action: Field<AndroidMotionEventAction, never, never, number>;
    pointerId: import("@yume-chan/struct").NumberField<bigint>;
    pointerX: import("@yume-chan/struct").NumberField<number>;
    pointerY: import("@yume-chan/struct").NumberField<number>;
    videoWidth: import("@yume-chan/struct").NumberField<number>;
    videoHeight: import("@yume-chan/struct").NumberField<number>;
    pressure: Field<number, never, never, number>;
    buttons: import("@yume-chan/struct").NumberField<number>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").NumberField<number>;
    action: Field<AndroidMotionEventAction, never, never, number>;
    pointerId: import("@yume-chan/struct").NumberField<bigint>;
    pointerX: import("@yume-chan/struct").NumberField<number>;
    pointerY: import("@yume-chan/struct").NumberField<number>;
    videoWidth: import("@yume-chan/struct").NumberField<number>;
    videoHeight: import("@yume-chan/struct").NumberField<number>;
    pressure: Field<number, never, never, number>;
    buttons: import("@yume-chan/struct").NumberField<number>;
}>>;
export type InjectTouchControlMessage = StructInit<typeof InjectTouchControlMessage>;
export declare function serializeInjectTouchControlMessage(message: ScrcpyInjectTouchControlMessage): Uint8Array;
//# sourceMappingURL=inject-touch.d.ts.map