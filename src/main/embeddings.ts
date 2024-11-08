import { Worker } from 'worker_threads'
import path, { join } from 'path'
import { logger } from './utils/logger'

let worker: Worker | null = null
let reranker: Worker | null = null
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
function initializeReranker() {
  if (!reranker) {
    const workerPath = join(__dirname, 'reranker.js')

    reranker = new Worker(workerPath)

    reranker.on('error', (error) => {
      logger.error('Reranker worker error:', error)
    })

    reranker.on('exit', (code) => {
      if (code !== 0) {
        logger.error(`Reranker worker stopped with exit code ${code}`)
      }
      reranker = null
    })
  }
}
export const embed = async (
  text: string | string[],
  batch_size: number = 15
): Promise<number[] | number[][]> => {
  try {
    initializeWorker()

    if (!worker) {
      throw new Error('Embeddings worker not initialized')
    }

    // Handle single string case
    if (!Array.isArray(text)) {
      return processBatch([text]).then((results) => results[0])
    }

    // Process in batches of 20 if array length > 20
    if (text.length <= batch_size) {
      return processBatch(text)
    }

    // Process large arrays in batches
    const results: number[][] = []
    for (let i = 0; i < text.length; i += batch_size) {
      const batch = text.slice(i, i + batch_size)
      const batchResults = await processBatch(batch)
      results.push(...batchResults)
    }
    return results
  } catch (error) {
    logger.error('Embedding error:', error)
    throw error
  }
}

export const rerank = async (texts: string[]): Promise<number[][]> => {
  try {
    initializeReranker()

    if (!reranker) {
      throw new Error('Reranker worker not initialized')
    }

    return rerankStrings(texts)
  } catch (error) {
    logger.error('Reranking error:', error)
    throw error
  }
}

const rerankStrings = (texts: string[]): Promise<number[][]> => {
  console.log('Reranking', texts)
  console.log('Reranking', texts.length)
  return new Promise((resolve, reject) => {
    reranker?.postMessage({
      type: 'rerank',
      text: texts
    })
    console.log('Reranking sent')

    const messageHandler = (message: any) => {
      if (message.type === 'result') {
        console.log('Reranking received')
        cleanup()
        resolve(message.reranked)
      }
    }

    const errorHandler = (error: Error) => {
      console.log('Reranking error')
      cleanup()
      reject(error)
    }

    const cleanup = () => {
      reranker?.removeListener('message', messageHandler)
      reranker?.removeListener('error', errorHandler)
    }
  })
}

// Helper function to process a single batch
const processBatch = (batch: string[]): Promise<number[][]> => {
  return new Promise((resolve, reject) => {
    worker?.postMessage({
      type: 'embed',
      text: batch
    })

    const messageHandler = (message: any) => {
      if (message.type === 'result') {
        cleanup()
        resolve(message.embeddings)
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
}

export const cleanup = () => {
  if (worker) {
    worker.terminate()
    worker = null
  }
}
