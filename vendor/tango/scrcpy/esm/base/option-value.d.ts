export interface ScrcpyOptionValue {
    toOptionValue(): string | undefined;
}
export declare function isScrcpyOptionValue(value: unknown): value is ScrcpyOptionValue;
export declare function toScrcpyOptionValue<T>(value: unknown, empty: T): string | T;
//# sourceMappingURL=option-value.d.ts.map