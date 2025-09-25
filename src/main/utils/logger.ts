import log from 'electron-log'
import path from 'node:path'
import { config } from '../config'

// Configure electron-log
log.transports.file.resolvePathFn = () =>
  path.join(config.homeDirectory ?? '', 'alBERT', 'userData', 'logs', 'main.log')
log.transports.file.maxSize = 1024 * 1024 * 10 // 10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

// Also log to console in development
if (config.isDevelopment) {
  log.transports.console.level = 'debug'
}

export const logger = log
export default log
