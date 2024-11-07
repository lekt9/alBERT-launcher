import log from 'electron-log';
import path from 'path';

// Configure electron-log
log.transports.file.resolvePathFn = () => path.join(process.env.HOME || '', 'alBERT', 'userData', 'logs', 'main.log');
log.transports.file.maxSize = 1024 * 1024 * 10; // 10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Also log to console in development
if (process.env.NODE_ENV === 'development') {
  log.transports.console.level = 'debug';
}

export const logger = log;