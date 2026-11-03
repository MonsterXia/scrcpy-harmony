import { useEffect } from 'react'
import './MainFeedback.module.scss'

// Portals stay under their current fullscreen owner; scope/theme live on this
// window's document so moving a notification host never loses its palette.
export default function useMainFeedback(theme: string) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.workspaceWindow = 'true'
    root.dataset.theme = theme
    return () => {
      delete root.dataset.workspaceWindow
      delete root.dataset.theme
    }
  }, [theme])
}
