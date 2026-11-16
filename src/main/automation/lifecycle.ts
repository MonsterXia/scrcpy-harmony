interface LifecycleApp {
  on(event: 'before-quit', listener: (event: { preventDefault(): void }) => void): unknown
  quit(): void
}
export function attachAutomationLifecycle(app: LifecycleApp, start: () => Promise<{ close(): Promise<void> }>, report: (code: string) => void) {
  let finished = false, stopping: Promise<void> | undefined
  const ready = Promise.resolve().then(start).catch(() => { report('AUTOMATION_START_FAILED'); return undefined })
  app.on('before-quit', event => {
    if (finished) return
    event.preventDefault()
    if (!stopping) stopping = ready.then(server => server?.close()).catch(() => report('AUTOMATION_STOP_FAILED')).finally(() => { finished = true; app.quit() })
  })
  return { ready, stopped: () => stopping ?? Promise.resolve() }
}
