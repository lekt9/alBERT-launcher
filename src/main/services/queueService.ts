import { embed } from '../embeddings';

interface QueueItem {
  url: string;
  priority: number;
  title: string;
  parentQuery?: string;
}

export class ScrapingQueue {
  private queue: QueueItem[] = [];
  private processing: Set<string> = new Set();
  private maxConcurrent: number = 3;
  private queryEmbedding?: number[];

  constructor() {}

  public async setCurrentQuery(query: string) {
    this.queryEmbedding = await embed(query);
  }

  public async addToQueue(url: string, title: string, content: string) {
    if (this.processing.has(url) || this.queue.some(item => item.url === url)) {
      return;
    }

    let priority = 0;
    if (this.queryEmbedding && content) {
      const contentEmbedding = await embed(content);
      // Calculate cosine similarity between query and content embeddings
      priority = this.calculateCosineSimilarity(this.queryEmbedding, contentEmbedding);
    }

    this.queue.push({ url, priority, title });
    this.sortQueue();
  }

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  private sortQueue() {
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  public getNext(): QueueItem | undefined {
    while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
      const item = this.queue.shift();
      if (item && !this.processing.has(item.url)) {
        this.processing.add(item.url);
        return item;
      }
    }
    return undefined;
  }

  public markComplete(url: string) {
    this.processing.delete(url);
  }

  public hasMore(): boolean {
    return this.queue.length > 0 || this.processing.size > 0;
  }

  public clear() {
    this.queue = [];
    this.processing.clear();
    this.queryEmbedding = undefined;
  }
} 