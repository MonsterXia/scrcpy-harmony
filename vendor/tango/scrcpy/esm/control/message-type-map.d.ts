import type { ScrcpyControlMessageType, ScrcpyOptions } from "../base/index.js";
/**
 * Scrcpy control message types have different values between versions.
 *
 * This class provides a way to get the actual value for a given type.
 */
export declare class ScrcpyControlMessageTypeMap {
    #private;
    constructor(options: ScrcpyOptions<object>);
    get(type: ScrcpyControlMessageType): number;
    fillMessageType<T extends {
        type: number;
    }>(message: Omit<T, "type">, type: ScrcpyControlMessageType): T;
}
//# sourceMappingURL=message-type-map.d.ts.map