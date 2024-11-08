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
    if (text.length === 0) {
      return []
    }
    initializeWorker()

    if (!worker) {
      throw new Error('Embeddings worker not initialized')
    }

    if (!Array.isArray(text)) {
      return processBatch([text]).then((results) => results[0])
    }

    if (text.length <= batch_size) {
      return processBatch(text)
    }

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

interface RankResult {
  corpus_id: number
  score: number
  text?: string
}

export const rerank = async (
  query: string,
  documents: string[],
  options: { top_k?: number; return_documents?: boolean } = {}
): Promise<RankResult[]> => {
  try {
    if (documents.length === 0 || query.length === 0) {
      return []
    }
    documents = documents.filter((doc) => doc.length > 0)
    initializeReranker()

    if (!reranker) {
      throw new Error('Reranker worker not initialized')
    }

    return rerankStrings(query, documents, options)
  } catch (error) {
    logger.error('Reranking error:', error)
    throw error
  }
}

const rerankStrings = (
  query: string,
  documents: string[],
  options: { top_k?: number; return_documents?: boolean } = {}
): Promise<RankResult[]> => {
  return new Promise((resolve, reject) => {
    reranker?.postMessage({
      type: 'rerank',
      text: JSON.stringify([query, documents, options])
    })

    const messageHandler = (message: any) => {
      if (message.type === 'result') {
        cleanup()
        resolve(message.reranked)
      }
    }

    const errorHandler = (error: Error) => {
      cleanup()
      reject(error)
    }

    const cleanup = () => {
      reranker?.removeListener('message', messageHandler)
      reranker?.removeListener('error', errorHandler)
    }

    reranker?.on('message', messageHandler)
    reranker?.on('error', errorHandler)
  })
}

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
  if (reranker) {
    reranker.terminate()
    reranker = null
  }
}
