import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    electronIpc: {
      onOpenInWebview: (callback: (url: string) => void) => () => void;
    }
    api: unknown
  }
}
