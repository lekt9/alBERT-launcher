import { exposeElectronTRPC } from 'electron-trpc/main'
const { contextBridge } = require('electron')

const ipcApi = {}

export type ipcApiType = typeof ipcApi

contextBridge.exposeInMainWorld('electronIpc', ipcApi)

process.once('loaded', async () => {
  exposeElectronTRPC()
})
