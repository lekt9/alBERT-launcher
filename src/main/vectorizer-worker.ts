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

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    await initializeEmbedder();
    const output = await embedder(text, {
      pooling: 'mean',
      normalize: true
    });
    return output.tolist()[0];
  } catch (error) {
    console.error('Embedding generation error:', error);
    throw error;
  }
}

if (parentPort) {
  console.log("Embeddings worker initialized");
  
  parentPort.on('message', async (message) => {
    if (message.type === 'embed') {
      try {
        const embedding = await generateEmbedding(message.text);
        parentPort?.postMessage({ type: 'result', embedding });
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