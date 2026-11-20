import type { BrowserWindow } from 'electron'
import type { ITarget } from '../../common/types'
export interface AutomationWindowObserver {
  state(state: string): void
  closeRequested(): boolean
  closed(): boolean
  guiOpened(show?: boolean): void
  input<T>(phase: 'down' | 'move' | 'up' | undefined, operation: () => Promise<T>): Promise<T>
}
export type AutomationWindowHooks = (attachment: { target: ITarget; window: BrowserWindow; contents?: Electron.WebContents; gui: boolean; close(): Promise<void> }) => AutomationWindowObserver
