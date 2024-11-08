import { Worker } from 'worker_threads'
import path, { join } from 'path'
import { logger } from './utils/logger'

let worker: Worker | null = null

function initializeWorker() {
  if (!worker) {
    const workerPath = join(__dirname, 'vectorizer.js')

    worker = new Worker(workerPath)

    worker.on('error', (error) => {
      logger.error('Embeddings worker error:', error)
    })

    worker.on('exit', (code) => {
      if (code !== 0) {
        logger.error(`Embeddings worker stopped with exit code ${code}`)
      }
      worker = null
    })
  }
}

export const embed = async (text: string): Promise<number[]> => {
  try {
    initializeWorker()

    if (!worker) {
      throw new Error('Embeddings worker not initialized')
    }

    return new Promise((resolve, reject) => {
      worker?.postMessage({ type: 'embed', text })

      const messageHandler = (message: any) => {
        if (message.type === 'result') {
          cleanup()
          resolve(message.embedding)
        } else if (message.type === 'error') {
          cleanup()
          reject(new Error(message.error))
        }
      }

      const errorHandler = (error: Error) => {
        cleanup()
        reject(error)
      }

      const cleanup = () => {
        worker?.removeListener('message', messageHandler)
        worker?.removeListener('error', errorHandler)
      }

      worker?.on('message', messageHandler)
      worker?.on('error', errorHandler)
    })
  } catch (error) {
    logger.error('Embedding error:', error)
    throw error
  }
}

export const cleanup = () => {
  if (worker) {
    worker.terminate()
    worker = null
  }
}
