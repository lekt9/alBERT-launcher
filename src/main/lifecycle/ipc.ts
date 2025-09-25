import type { BrowserWindow } from 'electron';
import { createIPCHandler } from 'electron-trpc/main';
import { getRouter } from '../api';

export const registerIpcRouter = (window: BrowserWindow): void => {
  createIPCHandler({
    router: getRouter(window),
    windows: [window],
  });
};
