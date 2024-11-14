import { createTRPCProxyClient } from '@trpc/client'
import { ipcLink } from 'electron-trpc/renderer'
import type { AppRouter } from '../../../main/api'

export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [ipcLink()]
})

// Add helper function for similarity scoring
export async function getContextSimilarityScores(
  queries: string[],
  documents: { content: string; path: string }[]
): Promise<{ path: string; scores: number[] }[]> {
  const scores = await trpcClient.embeddings.getSimilarityScores.query({
    queries,
    documents: documents.map(d => d.content)
  })

  return documents.map((doc, docIndex) => ({
    path: doc.path,
    scores: scores.map(queryScores => queryScores[docIndex])
  }))
}

export async function indexUrl(
  url: string,
  content: string,
  title: string,
  depth: number = 0,
  maxDepth: number = 2
) {
  return await trpcClient.indexing.indexUrl.mutate({
    url,
    content,
    title,
    depth,
    maxDepth
  })
}
