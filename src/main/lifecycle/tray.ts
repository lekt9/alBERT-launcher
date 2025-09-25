import { Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'
import { config } from '../config'

export interface CreateTrayOptions {
  onShow: () => void
  onOpenFolder: () => void
  onQuit: () => void
  tooltip?: string
  iconPath?: string
}

export const createAppTray = ({
  onShow,
  onOpenFolder,
  onQuit,
  tooltip = 'alBERT Launcher',
  iconPath
}: CreateTrayOptions): Tray => {
  const resolvedIconPath = iconPath ?? path.join(config.vitePublic ?? '', 'electron-vite.svg')
  const icon = nativeImage.createFromPath(resolvedIconPath)
  const tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: onShow },
    { label: 'Open alBERT Folder', click: onOpenFolder },
    { label: 'Quit', click: onQuit }
  ])

  tray.setToolTip(tooltip)
  tray.setContextMenu(contextMenu)

  return tray
}

export const destroyTray = (tray: Tray | null): void => {
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
}
