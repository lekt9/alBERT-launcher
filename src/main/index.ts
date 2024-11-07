import {
  app,
  shell,
  BrowserWindow,
  globalShortcut,
  screen,
  protocol,
  Tray,
  Menu,
  nativeImage,
  ipcMain
} from "electron";
import  { join, resolve } from 'node:path'
import { desktopCapturer } from 'electron'
import SearchDB from './db'
import chokidar from 'chokidar'
import { homedir } from 'os'
import { parseFile } from './utils/fileParser'
import { WebScraperService } from './services/webScraper'
import path = require("node:path");
import { electronApp, optimizer, is } from "@electron-toolkit/utils";

// Register privileged schemes
protocol.registerSchemesAsPrivileged([
  {
    scheme: "lightrailtrack",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
      bypassCSP: true,
    },
  },
]);

// Global variables
process.env.APP_ROOT = path.join(__dirname, '..')
let tray: Tray | null = null;
let mainWindow: BrowserWindow;

function createWindow(): void {
  const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  // Create the browser window.
  mainWindow = new BrowserWindow({
    x: currentScreen.bounds.x,
    y: currentScreen.bounds.y,
    width: currentScreen.bounds.width,
    height: currentScreen.bounds.height,
    alwaysOnTop: true,
    focusable: true,
    transparent: true,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });


  mainWindow.on("ready-to-show", () => {
    console.info("Window ready to show");
    mainWindow.show();
    console.info("Window shown");
  });

  if (!is.dev) {
    mainWindow.on("blur", () => {
      mainWindow.hide();
      console.info("Window hidden");
    });
  }


  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    console.info("Loading renderer from " + process.env["ELECTRON_RENDERER_URL"]);
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    console.info(
      "Loading renderer from " + join(__dirname, "../renderer/index.html")
    );
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'))
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow?.show() },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setToolTip('Your App Name')
  tray.setContextMenu(contextMenu)
}

function toggleWindow() {
  console
  if (mainWindow?.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow?.show()
    mainWindow?.focus()
  }
}

app.whenReady().then(async () => {
  globalShortcut.register('Alt+Space', toggleWindow)
  createWindow()
  createTray()
  const userDataPath = app.getPath('userData')
  const searchDB = await SearchDB.getInstance(userDataPath)
  await searchDB.startIndexing(path.join(app.getPath('home'), 'alBERT'), (progress, status) => {
    mainWindow?.webContents.send('indexing-progress', { progress, status })
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