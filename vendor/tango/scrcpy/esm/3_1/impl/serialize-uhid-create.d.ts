import type { StructInit } from "@yume-chan/struct";
import type { ScrcpyUHidCreateControlMessage } from "../../latest.js";
export declare const UHidCreateControlMessage: import("@yume-chan/struct").Struct<{
    type: import("@yume-chan/struct").NumberField<number>;
    id: import("@yume-chan/struct").NumberField<number>;
    vendorId: import("@yume-chan/struct").NumberField<number>;
    productId: import("@yume-chan/struct").NumberField<number>;
    name: import("@yume-chan/struct").Field<string, string, never, string>;
    data: import("@yume-chan/struct").Field<Uint8Array<ArrayBufferLike>, string, never, Uint8Array<ArrayBufferLike>>;
}, undefined, import("@yume-chan/struct").FieldsValue<{
    type: import("@yume-chan/struct").NumberField<number>;
    id: import("@yume-chan/struct").NumberField<number>;
    vendorId: import("@yume-chan/struct").NumberField<number>;
    productId: import("@yume-chan/struct").NumberField<number>;
    name: import("@yume-chan/struct").Field<string, string, never, string>;
    data: import("@yume-chan/struct").Field<Uint8Array<ArrayBufferLike>, string, never, Uint8Array<ArrayBufferLike>>;
}>>;
export type UHidCreateControlMessage = StructInit<typeof UHidCreateControlMessage>;
export declare function serializeUHidCreateControlMessage(message: ScrcpyUHidCreateControlMessage): Uint8Array<ArrayBufferLike>;
//# sourceMappingURL=serialize-uhid-create.d.ts.map