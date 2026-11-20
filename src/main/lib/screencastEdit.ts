import type { WebContents } from 'electron'

// Native selectAll/delete act on the empty IME textarea rather than the phone.
// Give the screencast document the decision; other windows keep native editing.
export function editWindow(command: 'selectAll' | 'delete',
  contents: WebContents | undefined, isCapture: (contents: WebContents) => boolean) {
  if (!contents) return
  if (isCapture(contents)) contents.send('screencastEdit', command)
  else contents[command]()
}
