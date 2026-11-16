// Opt-in phase timing; never include device IDs, commands, frames or errors.
export function captureTrace(phase: string, values: Record<string, number | boolean> = {}) {
  if (process.env.SCRCPY_PLUS_CAPTURE_TRACE === '1') {
    console.info(JSON.stringify({ captureTrace: phase, at: Date.now(), ...values }))
  }
}
