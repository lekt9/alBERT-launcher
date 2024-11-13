import { contextBridge, ipcRenderer } from 'electron';
import { exposeElectronTRPC } from 'electron-trpc/main';

const ipcApi = {
  onOpenInWebview: (callback: (url: string) => void) => {
    const subscription = (_: any, url: string) => callback(url);
    ipcRenderer.on('open-in-webview', subscription);
    return () => {
      ipcRenderer.removeListener('open-in-webview', subscription);
    };
  }
};

export type ipcApiType = typeof ipcApi;

contextBridge.exposeInMainWorld('electronIpc', ipcApi);

process.once('loaded', async () => {
  exposeElectronTRPC();
});
