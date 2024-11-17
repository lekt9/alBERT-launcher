import {
  app,
  shell,
  BrowserWindow,
  globalShortcut,
  screen,
  Tray,
  Menu,
  nativeImage,
  session,
  ipcMain,
  webContents
} from 'electron'
import { join } from 'node:path'
import SearchDB from './db'
import path from 'node:path'
import { is } from '@electron-toolkit/utils'
import { createIPCHandler } from 'electron-trpc/main'
import { getRouter } from './api'
import { URL } from 'url'

// Global variables
process.env.APP_ROOT = path.join(__dirname, '..')
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
app.commandLine.appendSwitch('enable-unsafe-webgpu')
let pendingRequests = new Map<string, any>()
function createWindow(): void {
  const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())

  mainWindow = new BrowserWindow({
    x: currentScreen.bounds.x + (currentScreen.bounds.width - 1200) / 2,
    y: currentScreen.bounds.y + (currentScreen.bounds.height - 700) / 2,
    width: currentScreen.bounds.width,
    height: currentScreen.bounds.height,
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
      devTools: true,
      webviewTag: true,
      webSecurity: true
    }
  })

  mainWindow.setMinimumSize(600, 400)

  mainWindow.webContents.openDevTools()
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
      mainWindow?.webContents.send('window-blur')
      globalShortcut.unregisterAll()
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

  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = ['media', 'geolocation', 'notifications', 'fullscreen']
      callback(allowedPermissions.includes(permission))
    }
  )

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    return true
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: https: http: ws:"
        ]
      }
    })
  })

  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window-focus')
    registerShortcuts()
  })

  function registerShortcuts() {
    globalShortcut.register('CommandOrControl+F', () => {
      mainWindow?.webContents.send('find-in-page')
    })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  ipcMain.on('setup-web-request-monitoring', (event, webContentsId) => {
    const contents = webContents.fromId(webContentsId)
    if (!contents) return

    if (!contents.debugger.isAttached()) {
      try {
        contents.debugger.attach('1.3')
        contents.debugger.sendCommand('Network.enable')
        contents.debugger.sendCommand('Network.setRequestInterception', { patterns: [{ urlPattern: '*' }] })

        contents.debugger.on('message', async (event, method, params) => {
          switch (method) {
            case 'Network.requestWillBeSent': {
              const request = {
                url: params.request.url,
                method: params.request.method,
                headers: params.request.headers,
                body: params.request.postData,
                timestamp: params.timestamp,
                resourceType: params.type
              }
              
              pendingRequests.set(params.requestId, request)
              break
            }

            case 'Network.responseReceived': {
              try {
                const response = await contents.debugger.sendCommand('Network.getResponseBody', {
                  requestId: params.requestId
                })

                const responseBody = response.base64Encoded
                  ? Buffer.from(response.body, 'base64').toString()
                  : response.body

                const originalRequest = pendingRequests.get(params.requestId)

                const pair = {
                  requestId: params.requestId,
                  request: originalRequest,
                  response: {
                    url: params.response.url,
                    status: params.response.status,
                    headers: params.response.headers,
                    body: responseBody,
                    timestamp: params.timestamp,
                    mimeType: params.response.mimeType
                  }
                }
                
                mainWindow?.webContents.send('network-request-complete', pair)

                pendingRequests.delete(params.requestId)
              } catch (error) {
                console.log('Could not get response body:', error)
                pendingRequests.delete(params.requestId)
              }
              break
            }
          }
        })

      } catch (err) {
        console.log('Debugger attach failed:', err)
      }
    }

    // Clean up when webContents is destroyed
    contents.on('destroyed', () => {
      if (contents.debugger.isAttached()) {
        try {
          contents.debugger.detach()
          pendingRequests.clear()
        } catch (err) {
          console.log('Error detaching debugger:', err)
        }
      }
    })
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
