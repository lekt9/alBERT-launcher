import { ElectronAPI } from '@electron-toolkit/preload'

interface NetworkRequest {
  url: string
  method: string
  headers: Record<string, string>
  timestamp: string
  resourceType: string
  body?: any
}

interface NetworkResponse {
  status: number
  headers: Record<string, string>
  body?: any
  timestamp: string
}

interface NetworkResponseEvent {
  requestId: string
  response: NetworkResponse
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronIpc: {
      send: (channel: string, ...args: unknown[]) => void
      on: (channel: string, callback: (data: NetworkRequest | NetworkResponseEvent) => void) => void
      once: (channel: string, callback: (data: NetworkRequest | NetworkResponseEvent) => void) => void
      removeListener: (channel: string, callback: (data: NetworkRequest | NetworkResponseEvent) => void) => void
    }
    api: unknown
    electronTRPC: unknown
  }
}
