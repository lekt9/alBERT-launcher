import { parentPort } from 'worker_threads'

let tokenizer: any = null
let model: any = null

async function initializeModel() {
  if (!tokenizer || !model) {
    const { AutoModelForSequenceClassification, AutoTokenizer } = await import(
      '@xenova/transformers'
    )
    const model_id = 'jinaai/jina-reranker-v1-tiny-en'

    tokenizer = await AutoTokenizer.from_pretrained(model_id)
    model = await AutoModelForSequenceClassification.from_pretrained(model_id, {
      quantized: false
    })
    console.log('Reranker model initialized')
  }
}

interface RankOptions {
  top_k?: number
  return_documents?: boolean
}

interface RankResult {
  corpus_id: number
  score: number
  text?: string
}

async function rank(
  query: string,
  documents: string[]
): Promise<RankResult[]> {
  try {
    await initializeModel()

    // Create array of queries, one for each document
    const queries = new Array(documents.length).fill(query)

    // Tokenize the input pairs
    const inputs = await tokenizer(queries, {
      text_pair: documents,
      padding: true,
      truncation: true
    })

    // Get scores from the model
    const { logits } = await model(inputs)

    // Convert logits to probabilities using sigmoid
    // sigmoid(x) = 1 / (1 + e^(-x))
    const scores = logits.sigmoid().tolist()
    return scores
  } catch (error) {
    console.error('Reranking error:', error)
    throw error
  }
}

if (parentPort) {
  console.log('Reranker worker initialized')

  parentPort.on('message', async (message) => {
    if (message.type === 'rerank') {
      try {
        const { query, documents } = JSON.parse(message.text)

        const reranked = await rank(query, documents)
        parentPort?.postMessage({ type: 'result', reranked })
      } catch (error) {
        parentPort?.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  })
}

export type {} // Keep TypeScript happy
