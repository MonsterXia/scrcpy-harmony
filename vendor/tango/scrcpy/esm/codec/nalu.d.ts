/**
 * Split NAL units from an H.264/H.265 Annex B stream.
 *
 * The input is not modified.
 * The returned NAL units are views of the input (no memory allocation nor copy),
 * and still contains emulation prevention bytes.
 *
 * This methods returns a generator, so it can be stopped immediately
 * after the interested NAL unit is found.
 */
export declare function annexBSplitNalu(buffer: Uint8Array): Generator<Uint8Array>;
export declare class NaluSodbBitReader {
    #private;
    get byteLength(): number;
    get stopBitIndex(): number;
    get bytePosition(): number;
    get bitPosition(): number;
    get ended(): boolean;
    constructor(nalu: Uint8Array);
    next(): number;
    read(length: number): number;
    skip(length: number): void;
    decodeExponentialGolombNumber(): number;
    peek(length: number): number;
    readBytes(length: number): Uint8Array;
    peekBytes(length: number): Uint8Array;
}
//# sourceMappingURL=nalu.d.ts.map