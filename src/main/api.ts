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
      }),
      open: t.procedure.input(z.string()).mutation(async ({ input: filePath }) => {
        log.info('tRPC Call: document.open', filePath)
        try {
          if (filePath.startsWith('http')) {
            // Open URLs in default browser
            await shell.openExternal(filePath)
          } else {
            // Open local files
            await shell.openPath(path.resolve(filePath))
          }
          return true
        } catch (error) {
          log.error('Error opening file:', error)
          return false
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
      quick: t.procedure.input(z.string()).query(async ({ input: searchTerm }) => {
        log.info('tRPC Call: search.quick')
        try {
          const [fileResults, webResults] = await Promise.all([
            searchFiles(searchTerm),
            quickSearchWeb(searchTerm)
          ])

          const combinedResults = [...fileResults, ...webResults].filter(
            (result) => result.text && result.text.trim().length > 0
          )

          return combinedResults
        } catch (error) {
          log.error('Error performing quick search:', error)
          throw error
        }
      }),

      full: t.procedure.input(z.string()).query(async ({ input: searchTerm }) => {
        log.info('tRPC Call: search.full')
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

          // Use reranking
          const rankings = await rerank(
            searchTerm,
            combinedResults.map((r) => r.text)
          )

          const rankedResults = combinedResults.map((result, index) => ({
            ...result,
            dist: rankings[index]
          }))

          return rankedResults.sort((a, b) => b.dist - a.dist)
        } catch (error) {
          log.error('Error performing full search:', error)
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

    const processedResults = await Promise.all(
      searchResults.web.results.map(async (result) => {
        try {
          const content = await readContent(result.url)
          return {
            text: content,
            metadata: {
              path: result.url,
              title: result.title,
              created_at: Date.now() / 1000,
              modified_at: Date.now() / 1000,
              filetype: 'web',
              languages: ['en'],
              links: [result.url],
              owner: null,
              seen_at: Date.now() / 1000,
              sourceType: 'web'
            }
          }
        } catch (error) {
          log.error(`Failed to extract content from ${result.url}:`, error)
          return null
        }
      })
    )

    return processedResults.filter(Boolean)
  } catch (error) {
    log.error('Error performing web search:', error)
    return []
  }
}

async function quickSearchWeb(searchTerm: string) {
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

    // Use description instead of fetching full content
    return searchResults.web.results.map(result => ({
      text: result.description || result.title,
      metadata: {
        path: result.url,
        title: result.title,
        created_at: Date.now() / 1000,
        modified_at: Date.now() / 1000,
        filetype: 'web',
        languages: ['en'],
        links: [result.url],
        owner: null,
        seen_at: Date.now() / 1000,
        sourceType: 'web'
      }
    }))
  } catch (error) {
    log.error('Error performing quick web search:', error)
    return []
  }
}

export type AppRouter = ReturnType<typeof getRouter>
