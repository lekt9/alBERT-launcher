import {
  app,
  shell,
  BrowserWindow,
  globalShortcut,
  screen,
  Tray,
  Menu,
  nativeImage
} from 'electron'
import { join } from 'node:path'
import SearchDB from './db'
import path from 'node:path'
import { is } from '@electron-toolkit/utils'
import { createIPCHandler } from 'electron-trpc/main'
import { getRouter } from './api'


// Global variables
process.env.APP_ROOT = path.join(__dirname, '..')
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
app.commandLine.appendSwitch('enable-unsafe-webgpu')
function createWindow(): void {
  const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())

  mainWindow = new BrowserWindow({
    x: currentScreen.bounds.x + (currentScreen.bounds.width - 1200) / 2,
    y: currentScreen.bounds.y + (currentScreen.bounds.height - 700) / 2,
    width: 1200,
    height: 700,
    alwaysOnTop: true,
    focusable: true,
    frame: false,
    resizable: true,
    roundedCorners: true,
    show: false,
    autoHideMenuBar: true,
    transparent: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true,
      devTools: true
    }
  })

  mainWindow.setMinimumSize(600, 400)

  // mainWindow.webContents.openDevTools()
  // // Set up tRPC handler
  createIPCHandler({
    router: getRouter(mainWindow),
    windows: [mainWindow]
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (!is.dev) {
    mainWindow?.on('blur', () => {
      mainWindow?.hide()
    })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow?.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow?.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow?.on('close', async () => {
    try {
      const searchDB = await SearchDB.getInstance(app.getPath('userData'))
      await searchDB.shutdown()
    } catch (error) {
      console.error('Error during shutdown:', error)
    }
  })

  mainWindow?.on('closed', () => {
    mainWindow = null
  })
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
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow?.show() },
    { label: 'Open alBERT Folder', click: openAlBERTFolder },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setToolTip('Your App Name')
  tray.setContextMenu(contextMenu)
}

function toggleWindow(): void {
  if (mainWindow?.isVisible()) {
    mainWindow?.hide()
  } else {
    mainWindow?.show()
    mainWindow?.focus()
  }
}

// App lifecycle
app.whenReady().then(async () => {
  // Register global shortcut
  globalShortcut.register('Alt+Space', toggleWindow)

  // Initialize search database
  const userDataPath = app.getPath('userData')
  const searchDB = await SearchDB.getInstance(userDataPath)
  // Start indexing
  searchDB
    .startIndexing(path.join(app.getPath('home'), 'alBERT'), (progress, status) => {
      mainWindow?.webContents.send('indexing-progress', { progress, status })
    })
    .catch((error) => {
      console.error('Error indexing directory:', error)
    })

  createWindow()
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
