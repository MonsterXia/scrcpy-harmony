import type { StructInit } from "@yume-chan/struct";
export declare const ScrcpyUHidInputControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").Field<13, never, never, number>;
    id: import("@yume-chan/struct").NumberField<number>;
    data: import("@yume-chan/struct").Field<Uint8Array<ArrayBufferLike>, string, never, Uint8Array<ArrayBufferLike>>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").Field<13, never, never, number>;
    id: import("@yume-chan/struct").NumberField<number>;
    data: import("@yume-chan/struct").Field<Uint8Array<ArrayBufferLike>, string, never, Uint8Array<ArrayBufferLike>>;
}>>;
export type ScrcpyUHidInputControlMessage = StructInit<typeof ScrcpyUHidInputControlMessage>;
export declare const ScrcpyUHidDestroyControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").NumberField<number>;
    id: import("@yume-chan/struct").NumberField<number>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").NumberField<number>;
    id: import("@yume-chan/struct").NumberField<number>;
}>>;
export type ScrcpyUHidDestroyControlMessage = StructInit<typeof ScrcpyUHidDestroyControlMessage>;
//# sourceMappingURL=uhid.d.ts.map