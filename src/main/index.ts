import { app, shell, BrowserWindow, Tray } from 'electron'
import path from 'node:path'
import { destroyTray, createAppTray } from './lifecycle/tray'
import { createMainWindow } from './lifecycle/window-manager'
import { registerIpcRouter } from './lifecycle/ipc'
import { registerToggleShortcut, unregisterAllShortcuts } from './lifecycle/shortcuts'
import {
  shutdownSearchDb,
  startSearchIndexing,
  persistSearchDb,
  type IndexingProgressPayload
} from './lifecycle/search-service'
import log from './logger'
import { getWatchDirectory } from './preferences'

process.env.APP_ROOT = path.join(__dirname, '..')
app.commandLine.appendSwitch('enable-unsafe-webgpu')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

const sendIndexingProgress = (payload: IndexingProgressPayload): void => {
  mainWindow?.webContents.send('indexing-progress', payload)
}

const showMainWindow = (): void => {
  if (!mainWindow) {
    return
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  mainWindow.focus()
}

const hideMainWindow = (): void => {
  mainWindow?.hide()
}

const toggleMainWindow = (): void => {
  if (!mainWindow) {
    return
  }

  if (mainWindow.isVisible()) {
    hideMainWindow()
  } else {
    showMainWindow()
  }
}

const openWorkspaceFolder = async (): Promise<void> => {
  try {
    const targetDirectory = await getWatchDirectory()
    await shell.openPath(targetDirectory)
  } catch (error) {
    log.error('Failed to open workspace folder', error)
  }
}

const initialiseMainWindow = (): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return
  }

  mainWindow = createMainWindow({
    onClose: () => {
      void shutdownSearchDb()
    },
    onClosed: () => {
      mainWindow = null
    }
  })

  registerIpcRouter(mainWindow)
  void startSearchIndexing(sendIndexingProgress)
}

const initialiseTray = (): void => {
  if (tray && !tray.isDestroyed()) {
    return
  }

  tray = createAppTray({
    onShow: showMainWindow,
    onOpenFolder: () => {
      void openWorkspaceFolder()
    },
    onQuit: () => app.quit()
  })
}

const bootstrapApplication = (): void => {
  initialiseMainWindow()
  initialiseTray()
  registerToggleShortcut('Alt+Space', toggleMainWindow)
}

app.whenReady().then(() => {
  try {
    bootstrapApplication()
  } catch (error) {
    log.error('Failed to bootstrap application', error)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      initialiseMainWindow()
    }
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  unregisterAllShortcuts()
  void persistSearchDb()
  void shutdownSearchDb()
  destroyTray(tray)
  tray = null
})

app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
})
