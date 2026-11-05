import { AdbScrcpyOptions3_3_3 } from "./3_3_3.js";
import type { AdbScrcpyClientOptions } from "./client-options.js";
export declare class AdbScrcpyOptionsLatest<TVideo extends boolean> extends AdbScrcpyOptions3_3_3<TVideo> {
    constructor(init: AdbScrcpyOptions3_3_3.Init<TVideo>, clientOptions?: AdbScrcpyClientOptions);
}
export declare namespace AdbScrcpyOptionsLatest {
    type Init<TVideo extends boolean = boolean> = AdbScrcpyOptions3_3_3.Init<TVideo>;
}
//# sourceMappingURL=latest.d.ts.map