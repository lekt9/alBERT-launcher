import { ElectronAPI } from '@electron-toolkit/preload'

interface NetworkRequestDetails {
  url: string
  method: string
  resourceType: string
  timestamp?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronIpc: {
      send: (channel: string, ...args: unknown[]) => void
      on: (channel: string, callback: (data: NetworkRequestDetails) => void) => void
      once: (channel: string, callback: (data: NetworkRequestDetails) => void) => void
      removeListener: (channel: string, callback: (data: NetworkRequestDetails) => void) => void
    }
    api: unknown
    electronTRPC: unknown
  }
}
