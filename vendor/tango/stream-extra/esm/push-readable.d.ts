import type { AbortSignal, QueuingStrategy } from "./stream.js";
import { ReadableStream } from "./stream.js";
export interface PushReadableStreamController<T> {
    abortSignal: AbortSignal;
    /**
     * Enqueue `chunk` into the stream.
     *
     * - If the stream is already cancelled by consumer before calling `enqueue`,
     * the call will return `false`.
     * - If the stream is already closed or errored by producer before calling `enqueue`,
     * the call will throw an error.
     * - If the stream has enough buffer space, the call will return `true`.
     *
     * Otherwise it returns a `Promise`:
     *
     * - If the stream is cancelled by consumer, or closed or errored by producer,
     *   while the `Promise` is pending, the `Promise` will be resolved to `false`.
     * - When the stream has enough buffer space, the `Promise` will be resolved to `true`.
     *
     * @param chunk The value to be enqueued
     */
    enqueue(chunk: T): Promise<boolean>;
    close(): void;
    error(e?: unknown): void;
}
export type PushReadableStreamSource<T> = (controller: PushReadableStreamController<T>) => void | Promise<void>;
export type PushReadableLogger<T> = (event: {
    source: "producer";
    operation: "enqueue";
    value: T;
    phase: "start" | "waiting" | "ignored" | "complete";
} | {
    source: "producer";
    operation: "close" | "error";
    explicit: boolean;
    phase: "start" | "ignored" | "complete";
} | {
    source: "consumer";
    operation: "pull" | "cancel";
    phase: "start" | "complete";
}) => void;
export declare class PushReadableStream<T> extends ReadableStream<T> {
    /**
     * Create a new `PushReadableStream` from a source.
     *
     * @param source If `source` returns a `Promise`, the stream will be closed
     * when the `Promise` is resolved, and be errored when the `Promise` is rejected.
     * @param strategy
     */
    constructor(source: PushReadableStreamSource<T>, strategy?: QueuingStrategy<T>, logger?: PushReadableLogger<T>);
}
//# sourceMappingURL=push-readable.d.ts.map