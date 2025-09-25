import { BrowserWindow, type BrowserWindowConstructorOptions, screen } from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { config } from '../config';

const DEFAULT_WINDOW_DIMENSIONS = {
  width: 1200,
  height: 700,
  minWidth: 600,
  minHeight: 400,
};

export interface CreateMainWindowOptions {
  /** Triggered once the window is ready to be presented. */
  onReadyToShow?: (window: BrowserWindow) => void;
  /** Triggered whenever the window blurs in production builds. */
  onBlur?: (window: BrowserWindow) => void;
  /** Triggered when the window is closing. */
  onClose?: (window: BrowserWindow) => void;
  /** Triggered after the window has been closed and destroyed. */
  onClosed?: () => void;
}

const buildWindowOptions = (): BrowserWindowConstructorOptions => {
  const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  return {
    x: currentScreen.bounds.x + (currentScreen.bounds.width - DEFAULT_WINDOW_DIMENSIONS.width) / 2,
    y: currentScreen.bounds.y + (currentScreen.bounds.height - DEFAULT_WINDOW_DIMENSIONS.height) / 2,
    width: DEFAULT_WINDOW_DIMENSIONS.width,
    height: DEFAULT_WINDOW_DIMENSIONS.height,
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
    },
  };
};

export const createMainWindow = (options: CreateMainWindowOptions = {}): BrowserWindow => {
  const window = new BrowserWindow(buildWindowOptions());

  window.setMinimumSize(DEFAULT_WINDOW_DIMENSIONS.minWidth, DEFAULT_WINDOW_DIMENSIONS.minHeight);

  window.once('ready-to-show', () => {
    options.onReadyToShow?.(window);
    window.show();
  });

  if (!is.dev) {
    window.on('blur', () => {
      if (options.onBlur) {
        options.onBlur(window);
      } else {
        window.hide();
      }
    });
  }

  window.on('close', () => {
    options.onClose?.(window);
  });

  window.on('closed', () => {
    options.onClosed?.();
  });

  if (is.dev && config.electronRendererUrl) {
    void window.loadURL(config.electronRendererUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
};
