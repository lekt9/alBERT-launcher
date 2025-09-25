import { useEffect, useMemo, useRef, useState } from 'react'
import { getRankedChunks, RankedChunk } from '@/lib/context-utils'
import { getContextSimilarityScores } from '../util/trpc-client'
import type { SearchResult } from '../types/search'
import type { SmitheryContextResult } from '../types'

type ContextDocument = {
  content: string
  path: string
  type: 'document' | 'web' | 'mcp'
}

interface UseContextScoringOptions {
  query: string
  searchResults: SearchResult[]
  smitheryResults: SmitheryContextResult[]
}

interface UseContextScoringResult {
  rankedChunks: RankedChunk[]
  documentScores: Map<string, number>
}

const buildDocuments = (
  searchResults: SearchResult[],
  smitheryResults: SmitheryContextResult[]
): ContextDocument[] => {
  const searchDocuments = searchResults.map((result) => ({
    content: result.text,
    path: result.metadata.path,
    type: result.metadata.sourceType === 'web' ? 'web' : 'document'
  }))

  const smitheryDocuments = smitheryResults.map((result) => ({
    content: result.snippet,
    path: `mcp://${result.serverId}/${result.id}`,
    type: 'mcp' as const
  }))

  return [...searchDocuments, ...smitheryDocuments].filter((doc): doc is ContextDocument =>
    Boolean(doc.content?.trim())
  )
}

export function useContextScoring({
  query,
  searchResults,
  smitheryResults
}: UseContextScoringOptions): UseContextScoringResult {
  const [rankedChunks, setRankedChunks] = useState<RankedChunk[]>([])
  const [documentScores, setDocumentScores] = useState<Map<string, number>>(() => new Map())
  const requestIdRef = useRef(0)

  const documents = useMemo(
    () => buildDocuments(searchResults, smitheryResults),
    [searchResults, smitheryResults]
  )

  useEffect(() => {
    if (!query.trim() || documents.length === 0) {
      setRankedChunks([])
      setDocumentScores(new Map())
      return
    }

    let cancelled = false
    const requestId = (requestIdRef.current += 1)

    const updateRankedChunks = async () => {
      try {
        const chunks = await getRankedChunks({
          query,
          documents,
          chunkSize: 500,
          minScore: 0.1
        })

        if (!cancelled && requestIdRef.current === requestId) {
          setRankedChunks(chunks)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to rank context chunks', error)
          setRankedChunks([])
        }
      }
    }

    updateRankedChunks()

    return () => {
      cancelled = true
    }
  }, [documents, query])

  useEffect(() => {
    if (!query.trim() || documents.length === 0) {
      setDocumentScores(new Map())
      return
    }

    let cancelled = false
    const requestId = (requestIdRef.current += 1)

    const updateSimilarityScores = async () => {
      try {
        const similarityScores = await getContextSimilarityScores([query], documents)

        if (cancelled || requestIdRef.current !== requestId) {
          return
        }

        const scoreMap = new Map<string, number>()
        similarityScores.forEach((doc) => {
          const score = doc.scores[0]
          scoreMap.set(doc.path, score)
        })

        setDocumentScores(scoreMap)
      } catch (error) {
        if (!cancelled) {
          console.error('Error calculating similarity scores:', error)
          setDocumentScores(new Map())
        }
      }
    }

    updateSimilarityScores()

    return () => {
      cancelled = true
    }
  }, [documents, query])

  return { rankedChunks, documentScores }
}
