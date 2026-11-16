export interface FrameMetadata { sequence: number; capturedAt: number; width: number; height: number; rotation: number; generation: number }
export type FrameMethod = 'metadata' | 'capture'
export type FrameState = { state: 'presented'; metadata: FrameMetadata } | { state: 'starting' | 'error' | 'disconnected' }
export type FrameResponse = { ok: true; metadata: FrameMetadata; png?: Uint8Array } | { ok: false; code: 'UNAVAILABLE' | 'INTERNAL' }
