import type { MaybePromise, MaybePromiseLike } from "@yume-chan/async";
export declare class TaskQueue {
    #private;
    enqueue<T extends MaybePromiseLike<unknown>>(task: () => T, bail?: boolean): T;
    enqueue<T>(task: () => T, bail?: boolean): MaybePromise<T>;
    dispose(): void;
}
//# sourceMappingURL=task-queue.d.ts.map