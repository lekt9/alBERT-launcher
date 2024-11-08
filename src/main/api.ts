import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { BrowserWindow, app, shell } from 'electron'
import { BraveSearch } from 'brave-search'
import SearchDB from './db'
import log from './logger'
import path from 'node:path'
import { embed } from './embeddings'
import { readContent } from './utils/reader'

const t = initTRPC.create({
  isServer: true
})

const braveSearch = new BraveSearch(process.env.BRAVE_API_KEY || 'BSAptOw_xjYBpxDm33wl0OEhsUBPBXP')

export const getRouter = (window: BrowserWindow) => {
  const router = t.router;
  
  return router({
    document: router({
      fetch: t.procedure
        .input(z.string())
        .query(async ({ input: filePath }) => {
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

    search: router({
      all: t.procedure
        .input(z.string())
        .query(async ({ input: searchTerm }) => {
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

            const searchEmbedding = await embed(searchTerm)
            const resultEmbeddings = await Promise.all(
              combinedResults.map((result) => embed(result.text.trim()))
            )

            const rankedResults = combinedResults.map((result, index) => ({
              ...result,
              dist: cosineSimilarity(searchEmbedding, resultEmbeddings[index])
            }))

            return rankedResults.sort((a, b) => a.dist - b.dist)
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
      open: t.procedure
        .input(z.string())
        .mutation(async ({ input }) => {
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

async function searchWeb(searchTerm: string) {
  try {
    const searchResults = await braveSearch.webSearch(searchTerm, {
      count: 5,
      search_lang: 'en',
      country: 'US',
      text_decorations: false
    })

    if (!searchResults.web?.results) {
      return []
    }

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
      .filter((result): result is PromiseFulfilledResult<any> =>
        result.status === 'fulfilled' && result.value !== null
      )
      .map((result) => result.value)

    return processedResults
  } catch (error) {
    log.error('Error performing web search:', error)
    throw error
  }
}

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

export type AppRouter = ReturnType<typeof getRouter>
