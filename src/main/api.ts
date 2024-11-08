import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { BrowserWindow, app, shell } from 'electron'
import { BraveSearch } from 'brave-search'
import SearchDB from './db'
import log from './logger'
import path from 'node:path'
import { embed } from './embeddings'
import { extractContentFromUrl } from './utils/markdown'
import { readContent } from './utils/reader'

const t = initTRPC.create({
  isServer: true
})

const braveSearch = new BraveSearch(process.env.BRAVE_API_KEY || 'BSAptOw_xjYBpxDm33wl0OEhsUBPBXP')

export const getRouter = (window: BrowserWindow) =>
  t.router({
    // Document operations
    document: t.router({
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

    // Search operations
    search: t.router({
      files: t.procedure.input(z.string()).query(async ({ input: searchTerm }) => {
        log.info('tRPC Call: search.files')
        return await searchFiles(searchTerm)
      }),

      web: t.procedure.input(z.string()).query(async ({ input: searchTerm }) => {
        log.info('tRPC Call: search.web')
        return await searchWeb(searchTerm)
      }),

      all: t.procedure.input(z.string()).query(async ({ input: searchTerm }) => {
        log.info('tRPC Call: search.all')
        try {
          // Fetch results from both sources in parallel
          const [fileResults, webResults] = await Promise.all([
            searchFiles(searchTerm),
            searchWeb(searchTerm)
          ])

          // Combine results and filter out empty content
          const combinedResults = [...fileResults, ...webResults].filter(
            (result) => result.text && result.text.trim().length > 0
          )

          if (combinedResults.length === 0) {
            return []
          }

          // Get embedding for the search term
          const searchEmbedding = await embed(searchTerm)

          // Get embeddings for all results
          const resultEmbeddings = await Promise.all(
            combinedResults.map((result) => embed(result.text.trim()))
          )

          // Calculate cosine similarity and add to results
          const rankedResults = combinedResults.map((result, index) => ({
            ...result,
            dist: cosineSimilarity(searchEmbedding, resultEmbeddings[index])
          }))

          // Sort by similarity (ascending distance)
          return rankedResults.sort((a, b) => a.dist - b.dist)
        } catch (error) {
          log.error('Error performing combined search:', error)
          throw error
        }
      })
    }),

    // Window management
    window: t.router({
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

    // Indexing progress
    indexing: t.router({
      progress: t.procedure
        .input(
          z.object({
            progress: z.number(),
            status: z.string()
          })
        )
        .mutation(({ input }) => {
          log.info('tRPC Call: indexing.progress')
          window.webContents.send('indexing-progress', input)
        })
    }),

    // Add this new procedure to open the alBERT folder
    folder: t.router({
      openAlBERT: t.procedure.mutation(() => {
        log.info('tRPC Call: folder.openAlBERT')
        const alBERTPath = path.join(app.getPath('home'), 'alBERT')
        shell.openPath(alBERTPath).catch((error) => {
          log.error('Failed to open alBERT folder:', error)
        })
      })
    }),

    // Add new embeddings router
    embeddings: t.router({
      getEmbedding: t.procedure.input(z.string()).query(async ({ input: text }) => {
        log.info('tRPC Call: embeddings.getEmbedding')
        try {
          const embedding = await embed(text)
          return embedding
        } catch (error) {
          log.error('Error generating embedding:', error)
          throw error
        }
      }),

      // Optional: Add a batch embedding endpoint if needed
      getBatchEmbeddings: t.procedure.input(z.array(z.string())).query(async ({ input: texts }) => {
        log.info('tRPC Call: embeddings.getBatchEmbeddings')
        try {
          const embeddings = await Promise.all(texts.map((text) => embed(text)))
          return embeddings
        } catch (error) {
          log.error('Error generating batch embeddings:', error)
          throw error
        }
      })
    })
  })

export type AppRouter = ReturnType<typeof getRouter>

// Helper functions (add these outside the router)
async function searchFiles(searchTerm: string) {
  const userDataPath = app.getPath('userData')
  const searchDB = await SearchDB.getInstance(userDataPath)
  return await searchDB.search(searchTerm)
}

async function searchWeb(searchTerm: string) {
  try {
    const searchResults = await braveSearch.webSearch(searchTerm, {
      count: 5,
      search_lang: 'en',
      country: 'US',
      text_decorations: false
    })

    const processedResults = (
      await Promise.allSettled(
        searchResults.web.results.map(async (result) => {
          try {
            const content = await readContent(result.url)
            return {
              text: content,
              dist: 0,
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
            log.error(`Failed to extract content from ${result.url}:`, error)
            return null
          }
        })
      )
    )
      .filter(
        (result): result is PromiseFulfilledResult<any> =>
          result.status === 'fulfilled' && result.value !== null
      )
      .map((result) => result.value)

    return processedResults
  } catch (error) {
    log.error('Error performing web search:', error)
    throw error
  }
}

// Cosine similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (normA * normB)
}
