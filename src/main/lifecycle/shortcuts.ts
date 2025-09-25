import { globalShortcut } from 'electron'
import log from '../logger'

export type ShortcutHandler = () => void

export const registerToggleShortcut = (accelerator: string, handler: ShortcutHandler): void => {
  const success = globalShortcut.register(accelerator, handler)

  if (!success) {
    log.error(`Failed to register global shortcut: ${accelerator}`)
  }
}

export const unregisterAllShortcuts = (): void => {
  globalShortcut.unregisterAll()
}
