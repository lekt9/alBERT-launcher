import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { exposeElectronTRPC } from 'electron-trpc/main';

// Define types for IPC communication
interface NetworkRequestDetails {
  url: string;
  method: string;
  resourceType: string;
  timestamp?: string;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronIpc', {
  send: (channel: string, ...args: unknown[]) => {
    ipcRenderer.send(channel, ...args);
  },
  on: (channel: string, callback: (data: NetworkRequestDetails) => void) => {
    ipcRenderer.on(channel, (_, data) => callback(data));
  },
  once: (channel: string, callback: (data: NetworkRequestDetails) => void) => {
    ipcRenderer.once(channel, (_, data) => callback(data));
  },
  removeListener: (channel: string, callback: (data: NetworkRequestDetails) => void) => {
    ipcRenderer.removeListener(channel, callback);
  }
});

// Expose electronAPI
contextBridge.exposeInMainWorld('electron', electronAPI);

// Initialize electron-trpc
process.once('loaded', async () => {
  exposeElectronTRPC();
});
