import { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, screen, ipcMain } from 'electron'
import path from 'node:path'
import { desktopCapturer } from 'electron'
import SearchDB from './db'
import chokidar from 'chokidar'
import { homedir } from 'os'
import { parseFile } from './utils/fileParser'
import { WebScraperService } from './services/webScraper'
import fs from 'fs'

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null
let tray: Tray | null
const contextMemory: { hash: string; text: string }[] = []

async function captureAndProcessScreen() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 2560, height: 1440 }
  })
  const screenSource = sources[0]
  const originalImage = screenSource.thumbnail.toPNG()
  
  // Convert PNG to native image for manipulation
  const nativeImg = nativeImage.createFromBuffer(originalImage)
  
  // Get image data
  const originalImageData = nativeImg.toBitmap()
  const { width, height } = nativeImg.getSize()
  
  // Create new buffer for inverted image
  const invertedData = Buffer.alloc(originalImageData.length)
  
  // Invert colors (each pixel is 4 bytes: RGBA)
  for (let i = 0; i < originalImageData.length; i += 4) {
    invertedData[i] = 255 - originalImageData[i]       // R
    invertedData[i + 1] = 255 - originalImageData[i + 1] // G
    invertedData[i + 2] = 255 - originalImageData[i + 2] // B
    invertedData[i + 3] = originalImageData[i + 3]     // A (keep alpha unchanged)
  }
  
  // Create new native image from inverted data
  const invertedImage = nativeImage.createFromBitmap(invertedData, { width, height })
  const invertedPNG = invertedImage.toPNG()
  
  const base64Image = `data:image/png;base64,${invertedPNG.toString('base64')}`

  try {
    const ocrWorker = await getOCRWorker()
    return await ocrWorker.scan(base64Image)
  } catch (error) {
    console.error('Image processing or API error:', error)
  }
}

function createWindow() {
  const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  win = new BrowserWindow({
    x: currentScreen.bounds.x,
    y: currentScreen.bounds.y,
    width: currentScreen.bounds.width,
    height: currentScreen.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    const htmlPath = path.join(RENDERER_DIST, 'index.html')
    if (fs.existsSync(htmlPath)) {
      win.loadFile(htmlPath)
    } else {
      console.error(`Cannot find ${htmlPath}`)
    }
  }

  ipcMain.on('hide-window', () => {
    win?.hide()
  })

  ipcMain.handle('capture-screen', async () => {
    await captureAndProcessScreen()
    return contextMemory.map(item => item.text).join('\n\n') // Return concatenated contexts
  })
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'))
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => win?.show() },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setToolTip('Your App Name')
  tray.setContextMenu(contextMenu)
}

function toggleWindow() {
  if (win?.isVisible()) {
    win.hide()
  } else {
    win?.show()
    win?.focus()
    win?.webContents.send('run-ocr')
  }
}

app.whenReady().then(async () => {
  createWindow()
  createTray()
  globalShortcut.register('Alt+Space', toggleWindow)
  const userDataPath = app.getPath('userData')
  const searchDB = await SearchDB.getInstance(userDataPath)
  await searchDB.startIndexing(path.join(app.getPath('home'), 'alBERT'), (progress, status) => {
    win?.webContents.send('indexing-progress', { progress, status })
  })
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
  globalShortcut.unregisterAll()

  WebScraperService.cleanup()
  const userDataPath = app.getPath('userData')
  const searchDB = await SearchDB.getInstance(userDataPath)
  await searchDB.persist()
})

ipcMain.handle('fetch-document', async (_, filePath: string) => {
  try {
    const content = await parseFile(filePath);
    return content;
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
});


ipcMain.handle('search-files', async (_, searchTerm: string) => {
  const userDataPath = app.getPath('userData');
  const searchDB = await SearchDB.getInstance(userDataPath);
  
  // Get local results
  const localResults = await searchDB.search(searchTerm);
  
  // Return local results immediately
  return localResults;
});