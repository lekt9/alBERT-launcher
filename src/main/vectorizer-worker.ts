import { parentPort } from 'worker_threads';
let pipeline: any = null;

async function initializePipeline() {
  if (!pipeline) {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
  }
}

let embedder: any = null;

async function initializeEmbedder() {
  if (!embedder) {
    await initializePipeline();
    embedder = await pipeline('feature-extraction', 'thenlper/gte-base', {
      quantized: false,
      revision: 'main',
    });
  }
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    await initializeEmbedder();
    
    // Process all texts in a single batch
    const outputs = await embedder(texts, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert outputs to array format
    return outputs.tolist();
  } catch (error) {
    console.error('Embedding generation error:', error);
    throw error;
  }
}

if (parentPort) {
  console.log('Embeddings worker initialized');

  parentPort.on('message', async (message) => {
    if (message.type === 'embed') {
      try {
        let textToEmbed = message.text;
        if (typeof message.text === 'string') {
          try {
            const parsed = JSON.parse(message.text);
            if (Array.isArray(parsed)) {
              textToEmbed = parsed;
            }
          } catch {
            // Not JSON, use original string
          }
        }
        const embeddings = await generateEmbeddings(textToEmbed);
        parentPort?.postMessage({ type: 'result', embeddings });
      } catch (error) {
        parentPort?.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });
}

export type {} // Keep TypeScript happy