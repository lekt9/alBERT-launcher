import { parentPort } from 'worker_threads';
let pipeline: any = null;

async function initialize() {
  if (!pipeline) {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
  }
  return true;
}

async function embed(text: string): Promise<number[]> {
  await initialize();
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const output = await embedder(text, {
    pooling: 'mean',
    normalize: true
  });
  return output.tolist()[0];
}

workerpool.worker({
  initialize,
  embed
});

export type {} // Keep TypeScript happy 