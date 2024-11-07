import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { BrowserWindow, app, shell } from 'electron'
import SearchDB from './db'
import { parseFile } from './utils/fileParser'
import log from './logger'
import path from 'node:path'

const t = initTRPC.create({
  isServer: true
})

export const getRouter = (window: BrowserWindow) =>
  t.router({
    // Document operations
    document: t.router({
      fetch: t.procedure.input(z.string()).query(async ({ input: filePath }) => {
        log.info('tRPC Call: document.fetch')
        try {
          const content = await parseFile(filePath)
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
        const userDataPath = app.getPath('userData')
        const searchDB = await SearchDB.getInstance(userDataPath)
        return await searchDB.search(searchTerm)
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
    })
  })

export type AppRouter = ReturnType<typeof getRouter>
