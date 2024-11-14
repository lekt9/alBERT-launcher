import { BrowserWindow, BrowserView, ipcMain } from 'electron';
import { join } from 'path';

export class BrowserWindowController {
  private browserWindow: BrowserWindow;
  private mainView: BrowserView;
  private browserView: BrowserView;
  private isViewVisible: boolean = false;

  constructor() {
    // Create the main browser window first
    this.browserWindow = new BrowserWindow({
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
      backgroundColor: '#00000000',
      webPreferences: {
        sandbox: false,
        nodeIntegration: true,
        contextIsolation: true,
        devTools: true,
        webSecurity: true
      }
    });

    // Create browser view (will be behind)
    this.browserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        javascript: true
      }
    });

    // Create main view (will be on top)
    this.mainView = new BrowserView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: true,
        contextIsolation: true,
        devTools: true,
        webSecurity: true
      }
    });

    // Add views in correct order (browser view first, then main view)
    this.browserWindow.addBrowserView(this.browserView);
    this.browserWindow.addBrowserView(this.mainView);

    // Initialize views
    this.setupViews();
    this.setupIpcHandlers();
    
    // Load initial content
    this.loadInitialContent();
  }

  private setupViews(): void {
    const bounds = this.browserWindow.getBounds();

    // Set browser view to zero dimensions initially (hidden)
    this.browserView.setBounds({
      x: 0,
      y: 0,
      width: 0,
      height: 0
    });
    this.browserView.setBackgroundColor('#000000');

    // Set main view to full window size (on top)
    this.mainView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height
    });

    // Handle window resize
    this.browserWindow.on('resize', () => {
      this.updateViewBounds();
    });

    // Handle navigation events
    this.browserView.webContents.on('did-navigate', () => {
      this.updateNavigationState();
    });

    this.browserView.webContents.on('did-navigate-in-page', () => {
      this.updateNavigationState();
    });
  }

  private updateViewBounds(): void {
    const bounds = this.browserWindow.getBounds();
    if (this.isViewVisible) {
      this.browserView.setBounds({
        x: 0,
        y: 0,
        width: bounds.width,
        height: bounds.height
      });
    } else {
      this.browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
    this.mainView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height
    });
  }

  private async loadInitialContent(): Promise<void> {
    // Load browser view content first
    await this.browserView.webContents.loadURL('https://duckduckgo.com');
    
    // Then load main view content
    if (process.env.ELECTRON_RENDERER_URL) {
      await this.mainView.webContents.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      await this.mainView.webContents.loadFile(join(__dirname, '../renderer/index.html'));
    }

    // Show window when everything is ready
    this.browserWindow.show();
  }

  public getMainWindow(): BrowserWindow {
    return this.browserWindow;
  }

  public getMainView(): BrowserView {
    return this.mainView;
  }

  private updateNavigationState(): void {
    const webContents = this.browserView.webContents;
    this.mainView.webContents.send('navigation-state-update', {
      canGoBack: webContents.canGoBack(),
      canGoForward: webContents.canGoForward(),
      currentUrl: webContents.getURL(),
      title: webContents.getTitle()
    });
  }

  public async loadURL(url: string): Promise<void> {
    await this.browserView.webContents.loadURL(url);
    this.updateNavigationState();
  }

  public getWebContents(): Electron.WebContents {
    return this.browserView.webContents;
  }

  public isVisible(): boolean {
    return this.isViewVisible;
  }

  public show(): void {
    this.isViewVisible = true;
    this.updateViewBounds(); // Ensure both views are correctly sized
  }

  public hide(): void {
    this.isViewVisible = false;
    this.updateViewBounds(); // Ensure both views are correctly sized
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('browser-load-url', async (_, url: string) => {
      await this.loadURL(url);
    });

    ipcMain.handle('browser-navigate', (_, direction: string) => {
      const webContents = this.browserView.webContents;
      switch (direction) {
        case 'back':
          if (webContents.canGoBack()) webContents.goBack();
          break;
        case 'forward':
          if (webContents.canGoForward()) webContents.goForward();
          break;
        case 'reload':
          webContents.reload();
          break;
      }
      this.updateNavigationState();
    });

    ipcMain.handle('browser-get-url', () => {
      return this.browserView.webContents.getURL();
    });

    ipcMain.handle('browser-get-title', () => {
      return this.browserView.webContents.getTitle();
    });

    ipcMain.handle('browser-can-go-back', () => {
      return this.browserView.webContents.canGoBack();
    });

    ipcMain.handle('browser-can-go-forward', () => {
      return this.browserView.webContents.canGoForward();
    });

    ipcMain.handle('browser-set-visible', (_, visible: boolean) => {
      if (visible) {
        this.show();
      } else {
        this.hide();
      }
    });
  }

  public cleanup(): void {
    this.browserWindow.removeBrowserView(this.browserView);
    this.browserWindow.removeBrowserView(this.mainView);
    this.browserWindow.close();
  }
} 