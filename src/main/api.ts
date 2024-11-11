import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { BrowserWindow, app, shell } from 'electron'
import { BraveSearch } from 'brave-search'
import SearchDB from './db'
import log from './logger'
import path from 'node:path'
import { readContent } from './utils/reader'
import { embed, rerank } from './embeddings'
import type { SearchResult } from './types'

interface CacheEntry {
  timestamp: number;
  results: SearchResult[];
}

const searchCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Helper function to check if cache entry is still valid
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_DURATION;
}

const t = initTRPC.create({
  isServer: true
})

const braveSearch = new BraveSearch(process.env.BRAVE_API_KEY || 'BSAl9amg1Hel8m8nwWsszt-j6DuAXiZ')

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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'

async function getPerplexityAnswer(searchTerm: string): Promise<SearchResult | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "perplexity/llama-3.1-sonar-small-128k-online",
        "messages": [
          {
            "role": "system",
            "content": "You are a search engine api that provides answers to questions with as many links to sources as possible. You must include a link url in your answer"
          },
          {
            "role": "user",
            "content": searchTerm
          }
        ]
      })
    });

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content;

    if (!answer) return null;

    return {
      text: answer,
      metadata: {
        path: answer.match(/\bhttps?:\/\/[^\s<>]+/)?.[0] || '',
        title: 'AI Answer',
        created_at: Date.now() / 1000,
        modified_at: Date.now() / 1000,
        filetype: 'web',
        languages: ['en'],
        links: [],
        owner: null,
        seen_at: Date.now() / 1000,
        sourceType: 'web',
        description: 'AI-generated answer from Perplexity'
      }
    };
  } catch (error) {
    log.error('Perplexity search failed:', error);
    return null;
  }
}

const marshmallowStyles = {
  card: "bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg rounded-3xl shadow-lg border border-white/20 dark:border-slate-800/50 hover:shadow-xl transition-shadow duration-200",
  header: "rounded-t-3xl bg-gradient-to-b from-white/50 to-transparent dark:from-slate-800/50 p-6",
  content: "p-6 space-y-4",
  button: "rounded-2xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 shadow-md hover:shadow-lg transition-all duration-200 px-4 py-2",
  input: "rounded-2xl bg-white/70 dark:bg-slate-800/70 border-white/30 dark:border-slate-700/30 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 shadow-inner",
  results: "space-y-3 p-4",
  resultCard: "bg-white/60 dark:bg-slate-800/60 rounded-2xl p-4 hover:shadow-lg transition-all duration-200 border border-white/30 dark:border-slate-700/30"
}

export const getRouter = (window: BrowserWindow): ReturnType<typeof t.router> => {
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
        }),
      getSimilarityScores: t.procedure
        .input(
          z.object({
            queries: z.array(z.string()),
            documents: z.array(z.string())
          })
        )
        .query(async ({ input }) => {
          const { queries, documents } = input
          
          // Get embeddings for queries and documents
          const [queryEmbeddings, docEmbeddings] = await Promise.all([
            embed(queries),
            embed(documents)
          ])

          // Calculate cosine similarity scores
          const scores = queryEmbeddings.map(queryEmb => 
            docEmbeddings.map(docEmb => {
              const dotProduct = queryEmb.reduce((sum, val, i) => sum + val * docEmb[i], 0)
              const queryNorm = Math.sqrt(queryEmb.reduce((sum, val) => sum + val * val, 0))
              const docNorm = Math.sqrt(docEmb.reduce((sum, val) => sum + val * val, 0))
              return dotProduct / (queryNorm * docNorm)
            })
          )

          return scores
        })
    }),

    search: router({
      quick: t.procedure.input(z.string()).query(async ({ input: searchTerm }) => {
        log.info('tRPC Call: search.quick')
        try {
          // Check cache first
          const cachedResult = searchCache.get(searchTerm);
          if (cachedResult && isCacheValid(cachedResult)) {
            log.info('Returning cached search results');
            return cachedResult.results;
          }

          // Inside the quick search procedure, replace the commented section with:
          const [fileResults, perplexityResult] = await Promise.all([
            searchFiles(searchTerm),
            getPerplexityAnswer(searchTerm).catch(error => {
              log.error('Perplexity search failed:', error)
              return null
            })
          ]);

          const combinedResults = [
            ...(perplexityResult ? [perplexityResult] : []),
            ...fileResults
          ].filter((result) => result.text && result.text.trim().length > 0);

          searchCache.set(searchTerm, { timestamp: Date.now(), results: combinedResults });

          return combinedResults;
        } catch (error) {
          log.error('Error performing quick search:', error)
          // If the overall search fails, try to return just file results
          try {
            const fileResults = await searchFiles(searchTerm)
            return fileResults
          } catch (innerError) {
            log.error('Even file search failed:', innerError)
            throw error // If everything fails, throw the original error
          }
        }
      }),

      // Add a new procedure to clear the cache
      clearCache: t.procedure.mutation(() => {
        log.info('tRPC Call: search.clearCache');
        searchCache.clear();
        return true;
      }),

      // Add a procedure to get cache stats
      getCacheStats: t.procedure.query(() => {
        const stats = {
          size: searchCache.size,
          entries: Array.from(searchCache.entries()).map(([key, value]) => ({
            query: key,
            timestamp: value.timestamp,
            isValid: isCacheValid(value)
          }))
        };
        return stats;
      })
    }),

    window: router({
      hide: t.procedure.mutation(() => {
        log.info('tRPC Call: window.hide')
        window.webContents.executeJavaScript(`
          document.body.style.opacity = '0';
          setTimeout(() => { window.hide(); }, 200);
        `)
      }),
      show: t.procedure.mutation(() => {
        log.info('tRPC Call: window.show')
        window.show()
        window.webContents.executeJavaScript(`
          document.body.style.opacity = '0';
          requestAnimationFrame(() => {
            document.body.style.opacity = '1';
            document.body.style.transition = 'opacity 200ms ease-in-out';
          });
        `)
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

    sources: router({
      fetch: t.procedure
        .input(z.array(z.string())) // Array of paths
        .query(async ({ input: paths }) => {
          try {
            const sources = await Promise.all(
              paths.map(async (path) => {
                try {
                  const content = await readContent(path)
                  return {
                    path,
                    content,
                    error: null
                  }
                } catch (error) {
                  return {
                    path,
                    content: null,
                    error: String(error)
                  }
                }
              })
            )
            return sources.filter(source => source.content !== null)
          } catch (error) {
            log.error('Error fetching sources:', error)
            throw error
          }
        })
    }),

    content: router({
      fetch: t.procedure
        .input(z.string()) // Single path
        .query(async ({ input: path }) => {
          try {
            const content = await readContent(path)
            return {
              path,
              content,
              error: null
            }
          } catch (error) {
            log.error('Error fetching content:', error)
            return {
              path,
              content: null,
              error: String(error)
            }
          }
        })
    }),
  })
}

// Helper functions
async function searchFiles(searchTerm: string): Promise<SearchResult[]> {
  const userDataPath = app.getPath('userData')
  const searchDB = await SearchDB.getInstance(userDataPath)
  return await searchDB.search(searchTerm)
}

export type AppRouter = ReturnType<typeof getRouter>

// Add animation helpers
const fadeInUp = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.2, ease: "easeOut" }
}

const springTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30
}

// Export the styles and animations for use in other components
export const uiStyles = {
  marshmallow: marshmallowStyles,
  animations: {
    fadeInUp,
    springTransition
  }
}
