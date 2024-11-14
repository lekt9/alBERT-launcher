import {
  app,
  shell,
  globalShortcut,
  screen,
  Tray,
  Menu,
  nativeImage,
  session,
  ipcMain,
  webContents,
  BrowserWindow
} from 'electron'
import { join } from 'node:path'
import SearchDB from './db'
import path from 'node:path'
import { is } from '@electron-toolkit/utils'
import { createIPCHandler } from 'electron-trpc/main'
import { getRouter } from './api'
import { BrowserWindowController } from './BrowserWindowController';

// Global variables
process.env.APP_ROOT = path.join(__dirname, '..')
let tray: Tray | null = null
let browserWindowController: BrowserWindowController | null = null
app.commandLine.appendSwitch('enable-unsafe-webgpu')

function createWindow(): void {
  browserWindowController = new BrowserWindowController();
  const window = browserWindowController.getMainWindow();
  const mainView = browserWindowController.getMainView();

  // Set up tRPC handler
  createIPCHandler({
    router: getRouter(window),
    windows: [window]
  });

  if (!is.dev) {
    window.on('blur', () => {
      mainView.webContents.send('window-blur');
      globalShortcut.unregisterAll();
    });
  }

  window.on('close', async () => {
    try {
      const searchDB = await SearchDB.getInstance(app.getPath('userData'));
      await searchDB.shutdown();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  });
}

function openAlBERTFolder(): void {
  const alBERTPath = path.join(app.getPath('home'), 'alBERT')
  shell.openPath(alBERTPath).catch((error) => {
    console.error('Failed to open alBERT folder:', error)
  })
}

function createTray(): void {
  const icon = nativeImage.createFromPath(
    path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg')
  )
  tray = new Tray(icon)
  const window = browserWindowController?.getMainWindow();
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => window?.show() },
    { label: 'Open alBERT Folder', click: openAlBERTFolder },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setToolTip('Your App Name')
  tray.setContextMenu(contextMenu)
}

function toggleWindow(): void {
  const window = browserWindowController?.getMainWindow();
  if (window?.isVisible()) {
    window?.hide()
  } else {
    window?.show()
    window?.focus()
  }
}

// App lifecycle
app.whenReady().then(async () => {
  // Register global shortcut
  globalShortcut.register('Alt+Space', toggleWindow)

  // Initialize search database
  const userDataPath = app.getPath('userData')
  const searchDB = await SearchDB.getInstance(userDataPath)
  
  createWindow()
  
  // Start indexing after window creation
  const window = browserWindowController?.getMainWindow();
  searchDB
    .startIndexing(path.join(app.getPath('home'), 'alBERT'), (progress, status) => {
      window?.webContents.send('indexing-progress', { progress, status })
    })
    .catch((error) => {
      console.error('Error indexing directory:', error)
    })

  createTray()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  // Clean up
  globalShortcut.unregisterAll()

  // Persist search database
  const userDataPath = app.getPath('userData')
  const searchDB = await SearchDB.getInstance(userDataPath)
  await searchDB.persist()
})

// Handle external links
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
})
