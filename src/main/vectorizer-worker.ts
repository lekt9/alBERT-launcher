import workerpool from 'workerpool'
import type { Pipeline } from '@xenova/transformers'

let vectorizer: Pipeline | null = null

async function initialize(): Promise<boolean> {
  const { pipeline } = await import('@xenova/transformers')
  vectorizer = await pipeline('feature-extraction', 'thenlper/gte-base', {
    quantized: false,
    revision: 'main'
  })
  return true
}

async function vectorize(content: string | string[]): Promise<(number | number[])[]> {
  if (!vectorizer) {
    throw new Error('Vectorizer not initialized')
  }
  const tensor = await vectorizer(content, {
    pooling: 'mean',
    normalize: true
  })
  return tensor.tolist()[0]
}

workerpool.worker({
  initialize,
  vectorize
})
