import { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, screen, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { desktopCapturer } from 'electron'
import { Worker } from 'worker_threads'
import SearchDB from './db'
import chokidar from 'chokidar'
import { homedir } from 'os'
import { embed } from './embeddings'
import { parseFile } from './utils/fileParser';
import { WebScraperService } from './services/webScraper';
import fs from 'fs';

// The built directory structure
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
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


let screenCaptureInterval: NodeJS.Timeout | null = null;

// Add this function to handle the periodic capture
async function startPeriodicCapture() {
  screenCaptureInterval = setInterval(async () => {
    try {
      const ocrResult = await captureAndProcessScreen();
      if (ocrResult) {
        // Extract URLs using regex
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = ocrResult.match(urlRegex);
        console.log(`Found ${urls?.length} URLs in OCR result`);
        
        if (urls && urls.length > 0) {
          const userDataPath = app.getPath('userData');
          const searchDB = await SearchDB.getInstance(userDataPath);
          const scraper = new WebScraperService(searchDB);
          
          // Process each unique URL
          const uniqueUrls = [...new Set(urls)];
          for (const url of uniqueUrls) {
            try {
              const scrapedPage = await scraper.scrapePage(url);
              if (scrapedPage) {
                await searchDB.indexUrl(scrapedPage.url, scrapedPage.content, scrapedPage.title);
              }
            } catch (error) {
              console.error(`Error processing URL ${url}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in periodic capture:', error);
    }
  }, 30000); // 30 seconds
}

app.whenReady().then(async () => {
  await initializeWorker();
  createWindow();
  createTray();
  globalShortcut.register('Alt+Space', toggleWindow);
  
  // Start periodic capture
  // startPeriodicCapture();
  
  // Start indexing after window is created
  startIndexing().catch(error => {
    console.error('Error during indexing:', error);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  globalShortcut.unregisterAll();
  if (screenCaptureInterval) {
    clearInterval(screenCaptureInterval);
  }
  WebScraperService.cleanup();
  const userDataPath = app.getPath('userData');
  const searchDB = await SearchDB.getInstance(userDataPath);
  await searchDB.persist();
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

interface SearchResult {
  text: string;
  dist: number;
  metadata: {
    path: string;
    created_at: number;
    modified_at: number;
    filetype: string;
    languages: string[];
    links: string[];
    owner: string | null;
    seen_at: number;
  };
}

ipcMain.handle('search-files', async (_, searchTerm: string) => {
  const userDataPath = app.getPath('userData');
  const searchDB = await SearchDB.getInstance(userDataPath);
  
  // Get local results
  const localResults = await searchDB.search(searchTerm);
  
  // Return local results immediately
  return localResults;
});