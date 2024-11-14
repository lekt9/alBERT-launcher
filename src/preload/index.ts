import { contextBridge, ipcRenderer, webContents } from 'electron';
import { exposeElectronTRPC } from 'electron-trpc/main';

// Define types for IPC events
interface IpcSubscription {
  (): void;
}

interface IpcApi {
  onOpenInWebview: (callback: (url: string) => void) => IpcSubscription;
}

const ipcApi: IpcApi = {
  onOpenInWebview: (callback: (url: string) => void) => {
    const subscription = (_: unknown, url: string) => callback(url);
    ipcRenderer.on('open-in-webview', subscription);
    return () => {
      ipcRenderer.removeListener('open-in-webview', subscription);
    };
  }
};

// Expose IPC API
contextBridge.exposeInMainWorld('electronIpc', ipcApi);

// Expose webContents-related functionality through IPC
contextBridge.exposeInMainWorld('electron', {
  getWebContents: async (id: number) => {
    return await ipcRenderer.invoke('get-web-contents', id)
  },
  invoke: (channel: string, ...args: any[]) => {
    const validChannels = [
      'browser-load-url',
      'browser-get-url',
      'browser-navigate',
      'browser-get-title',
      'browser-can-go-back',
      'browser-can-go-forward',
      'browser-set-visible'
    ]
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
  },
  onNavigationStateUpdate: (callback: (state: {
    canGoBack: boolean;
    canGoForward: boolean;
    currentUrl: string;
    title: string;
  }) => void) => {
    const subscription = (_: unknown, state: any) => callback(state);
    ipcRenderer.on('navigation-state-update', subscription);
    return () => {
      ipcRenderer.removeListener('navigation-state-update', subscription);
    };
  }
});

process.once('loaded', async () => {
  exposeElectronTRPC();
});
