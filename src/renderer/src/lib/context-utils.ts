import { splitContent } from './utils'
import { trpcClient } from '@/util/trpc-client'

export interface RankedChunk {
  text: string
  path: string
  type: string
  score: number
}

export async function getRankedChunks({
  query,
  documents,
  chunkSize = 1000,
  chunkOverlap = 20,
  minScore = 0.1
}: {
  query: string
  documents: Array<{
    content: string
    path: string
    type: string
  }>
  chunkSize?: number
  chunkOverlap?: number
  minScore?: number
}): Promise<RankedChunk[]> {
  // Process documents into chunks
  const allChunks = documents.flatMap((doc) => {
    const chunks = splitContent(doc.content, chunkSize, chunkOverlap)
    return chunks.map((chunk) => ({
      text: chunk,
      path: doc.path,
      type: doc.type
    }))
  }).filter(chunk => chunk.text && chunk.text.length > 0)

  if (allChunks.length === 0) {
    return []
  }
  return allChunks
  try {
    const rankings = await trpcClient.embeddings.rerank.query({
      query,
      documents: allChunks.map(chunk => chunk.text.slice(0, 350))
    })

    // Combine rankings with chunk metadata
    const rankedChunks = rankings.map((score, index) => ({
      ...allChunks[index],
      score
    }))

    // Sort by score and filter low-relevance chunks
    return rankedChunks
      .sort((a, b) => b.score - a.score)
      .filter(chunk => chunk.score > minScore)

  } catch (error) {
    console.error('Error reranking chunks:', error)
    return allChunks.map((chunk, index) => ({
      ...chunk,
      score: 1 - (index / allChunks.length)
    }))
  }
} 