import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { BrowserWindow, app, shell } from 'electron'
import { BraveSearch } from 'brave-search'
import SearchDB from './db'
import log from './logger'
import path from 'node:path'
import { readContent } from './utils/reader'
import { embed, rerank } from './embeddings'

const t = initTRPC.create({
  isServer: true
})

const braveSearch = new BraveSearch(process.env.BRAVE_API_KEY || 'BSAptOw_xjYBpxDm33wl0OEhsUBPBXP')

export const getRouter = (window: BrowserWindow) => {
  const router = t.router

  return router({
    document: router({
      fetch: t.procedure.input(z.string()).query(async ({ input: filePath }) => {
        log.info('tRPC Call: document.fetch')
        try {
          const content = await readContent(filePath)
          return content
        } catch (error) {
          log.error('Error reading file:', error)
          throw error
        }
      })
    }),

    embeddings: router({
      embed: t.procedure
        .input(z.union([z.string(), z.array(z.string())]))
        .query(async ({ input }) => {
          const textArray = Array.isArray(input) ? input : [input]
          const results = await embed(textArray)
          return Array.isArray(input) ? results : results[0]
        }),
      rerank: t.procedure
        .input(
          z.object({
            query: z.string(),
            documents: z.array(z.string()),
            options: z
              .object({
                top_k: z.number().optional(),
                return_documents: z.boolean().optional()
              })
              .optional()
          })
        )
        .query(async ({ input }) => {
          const { query, documents, options = {} } = input
          return await rerank(query, documents, options)
        })
    }),

    search: router({
      all: t.procedure.input(z.string()).query(async ({ input: searchTerm }) => {
        log.info('tRPC Call: search.all')
        try {
          const [fileResults, webResults] = await Promise.all([
            searchFiles(searchTerm),
            searchWeb(searchTerm)
          ])

          const combinedResults = [...fileResults, ...webResults].filter(
            (result) => result.text && result.text.trim().length > 0
          )

          if (combinedResults.length === 0) {
            return []
          }

          // Use reranking instead of embeddings
          const rerankedResults = await rerank(
            searchTerm,
            combinedResults.map((r) => r.text),
            { return_documents: false }
          )

          // Combine the reranking scores with the original results
          const rankedResults = combinedResults.map((result, index) => ({
            ...result,
            dist: rerankedResults[index].score
          }))

          return rankedResults.sort((a, b) => b.dist - a.dist)
        } catch (error) {
          log.error('Error performing combined search:', error)
          throw error
        }
      })
    }),

    window: router({
      hide: t.procedure.mutation(() => {
        log.info('tRPC Call: window.hide')
        window.hide()
      }),
      show: t.procedure.mutation(() => {
        log.info('tRPC Call: window.show')
        window.show()
      }),
      toggle: t.procedure.mutation(() => {
        log.info('tRPC Call: window.toggle')
        if (window.isVisible()) {
          window.hide()
        } else {
          window.show()
          window.focus()
        }
      })
    }),

    folder: router({
      openAlBERT: t.procedure.mutation(() => {
        log.info('tRPC Call: folder.openAlBERT')
        const alBERTPath = path.join(app.getPath('home'), 'alBERT')
        shell.openPath(alBERTPath).catch((error) => {
          log.error('Failed to open alBERT folder:', error)
        })
      })
    }),

    file: router({
      open: t.procedure.input(z.string()).mutation(async ({ input }) => {
        try {
          const filePath = path.resolve(input)
          await shell.openPath(filePath)
          return true
        } catch (error) {
          console.error('Failed to open file:', error)
          return false
        }
      })
    })
  })
}

// Helper functions
async function searchFiles(searchTerm: string) {
  const userDataPath = app.getPath('userData')
  const searchDB = await SearchDB.getInstance(userDataPath)
  return await searchDB.search(searchTerm)
}

// Add retry utility function at the top
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 1000,
  maxDelay = 5000
): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === retries - 1) throw error

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, i), maxDelay)
      // Add some jitter
      const jitter = Math.random() * 200
      await wait(delay + jitter)

      log.warn(`Retry ${i + 1}/${retries} for web search after ${delay}ms`)
    }
  }
  throw new Error('Retry failed')
}

// Update the searchWeb function with retry logic
async function searchWeb(searchTerm: string) {
  try {
    const searchResults = await retryWithBackoff(
      async () =>
        braveSearch.webSearch(searchTerm, {
          count: 5,
          search_lang: 'en',
          country: 'US',
          text_decorations: false
        }),
      3, // 3 retries
      1000, // Start with 1s delay
      5000 // Max 5s delay
    )

    if (!searchResults.web?.results) {
      return []
    }
    const processedResults = (
      await Promise.allSettled(
        searchResults.web.results.map(async (result) => {
          try {
            // Also add retry for content fetching
            const content = await retryWithBackoff(
              () => readContent(result.url),
              2, // 2 retries for content
              500, // Start with 500ms delay
              2000 // Max 2s delay
            )

            return {
              text: content,
              metadata: {
                path: result.url,
                created_at: Date.now() / 1000,
                modified_at: Date.now() / 1000,
                filetype: 'web',
                languages: ['en'],
                links: [result.url],
                owner: null,
                seen_at: Date.now() / 1000
              }
            }
          } catch (error) {
            log.error(`Failed to extract content from ${result.url} after retries:`, error)
            return null
          }
        })
      )
    )
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<{
          text: string
          dist: number
          metadata: {
            path: string
            created_at: number
            modified_at: number
            filetype: string
            languages: string[]
            links: string[]
            owner: string | null
            seen_at: number
          }
        }> => result.status === 'fulfilled' && result.value !== null
      )
      .map((result) => result.value)

    return processedResults
  } catch (error) {
    log.error('Error performing web search after all retries:', error)
    throw error
  }
}

export type AppRouter = ReturnType<typeof getRouter>
