import { parentPort } from 'worker_threads'

let tokenizer: any = null
let model: any = null

async function initializeModel() {
  if (!tokenizer || !model) {
    const { AutoModelForSequenceClassification, AutoTokenizer } = await import(
      '@xenova/transformers'
    )
    const model_id = 'Xenova/ms-marco-MiniLM-L-6-v2'
    
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

async function rank(
  query: string,
  documents: string[],
  options: RankOptions = {}
): Promise<Array<{ corpus_id: number; score: number; text?: string }>> {
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
    
    // Convert logits to probabilities and format results
    return logits.sigmoid()
      .tolist()
      .map(([score]: number[], i: number) => ({
        corpus_id: i,
        score,
        ...(options.return_documents ? { text: documents[i] } : {})
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.top_k)
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
        let query: string = ''
        let documents: string[] = []
        let options: RankOptions = {}

        if (typeof message.text === 'string') {
          try {
            const parsed = JSON.parse(message.text)
            if (Array.isArray(parsed) && parsed.length >= 2) {
              query = parsed[0]
              documents = Array.isArray(parsed[1]) ? parsed[1] : [parsed[1]]
              options = parsed[2] || {}
            }
          } catch {
            // Not JSON, use original string
            query = message.text
            documents = [message.text]
          }
        }

        const reranked = await rank(query, documents, options)
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
