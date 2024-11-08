import path from 'path'
import fs from 'fs/promises'
import { sha256 } from 'hash-wasm'
import { embed } from './embeddings'
import * as workers from './worker-management'
import { logger } from './utils/logger'
import type { EmbeddedClient } from 'weaviate-ts-embedded'
import { readContent } from './utils/reader'

/* monkeypatch fetch to allow weaviate port */

// Get the badPorts list from the original undici module.
const badPorts = require('undici/lib/fetch/constants').badPorts
// Remove envoy port
const index = badPorts.indexOf('6666')
if (index !== -1) {
  badPorts.splice(index, 1)
}
// Replace global fetch with our monkeypatched fetch
global.fetch = require('undici').fetch
interface FileIndex {
  [path: string]: string // path -> hash mapping
}

const schema = {
  class: 'Document',
  properties: [
    { name: 'path', dataType: ['string'] },
    { name: 'content', dataType: ['text'] },
    { name: 'filename', dataType: ['string'] },
    { name: 'extension', dataType: ['string'] },
    { name: 'lastModified', dataType: ['number'] },
    { name: 'hash', dataType: ['string'] }
  ],
  vectorizer: 'none'
}

interface WeaviateDocument {
  content: string
  path: string
  lastModified: number
  extension: string
}

class SearchDB {
  private static instance: SearchDB | null = null
  private client: EmbeddedClient
  private fileIndex: FileIndex = {}
  private indexPath: string
  private isShuttingDown: boolean = false
  private _vectorizer: Awaited<ReturnType<typeof workers.getVectorizer>> | null = null

  private constructor(client: EmbeddedClient, indexPath: string) {
    this.client = client
    this.indexPath = indexPath
    this.setupShutdownHandlers()
  }

  private async _getVectorizer(): Promise<Awaited<ReturnType<typeof workers.getVectorizer>>> {
    if (!this._vectorizer) {
      this._vectorizer = await workers.getVectorizer()
    }
    return this._vectorizer
  }

  public async indexDirectory(
    dirPath: string,
    progressCallback?: (progress: number, status: string) => void
  ): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const currentFiles = new Set<string>()
      let processed = 0
      const total = entries.length

      for (const entry of entries) {
        try {
          const fullPath = path.join(dirPath, entry.name)

          if (entry.isDirectory()) {
            await this.indexDirectory(fullPath, progressCallback)
          } else {
            currentFiles.add(fullPath)
            await this.indexFile(fullPath)
            processed++

            if (progressCallback) {
              const progress = (processed / total) * 100
              progressCallback(progress, `Indexing ${entry.name}`)
            }
          }
        } catch (error) {
          logger.error(`Error processing entry ${entry.name}:`, error)
        }
      }

      // Clean up deleted files
      const filesToRemove = Object.keys(this.fileIndex).filter(
        (indexedPath) => indexedPath.startsWith(dirPath) && !currentFiles.has(indexedPath)
      )

      for (const fileToRemove of filesToRemove) {
        await this.removeFile(fileToRemove)
      }

      return Array.from(currentFiles)
    } catch (error) {
      logger.error(`Error indexing directory ${dirPath}:`, error)
      throw error
    }
  }

  public async indexFile(filePath: string): Promise<void> {
    try {
      const currentHash = await this.calculateFileHash(filePath)
      const previousHash = this.fileIndex[filePath]

      if (previousHash === currentHash) {
        logger.info(`File ${filePath} is unchanged. Skipping indexing.`)
        return
      }

      // Delete previous version if exists
      if (previousHash) {
        await this.removeFile(filePath)
      }

      const stats = await fs.stat(filePath)
      const parsedPath = path.parse(filePath)
      const content = await this.getContent(filePath)

      const vectorizer = await this._getVectorizer()
      const vector = await vectorizer.vectorize([content])

      await this.client.data
        .creator()
        .withClassName('Document')
        .withProperties({
          path: filePath,
          content: content,
          filename: parsedPath.name,
          extension: parsedPath.ext.slice(1),
          lastModified: stats.mtimeMs,
          hash: currentHash
        })
        .withVector(vector[0])
        .do()

      this.fileIndex[filePath] = currentHash
      await this.persist()
      logger.info(`Indexed file: ${filePath}`)
    } catch (error) {
      logger.error(`Error indexing file ${filePath}:`, error)
      throw error
    }
  }

  public static async getInstance(userDataPath: string): Promise<SearchDB> {
    if (!SearchDB.instance) {
      const indexPath = path.join(userDataPath, 'alBERT_search-index.json')

      // Dynamic import of weaviate-ts-embedded
      const weaviate = await import('weaviate-ts-embedded')
      const options = new weaviate.EmbeddedOptions()
      const client = weaviate.default.client(options)
      await client.embedded.start()

      SearchDB.instance = new SearchDB(client, indexPath)
      await SearchDB.instance.initializeDB()
      await SearchDB.instance.loadFileIndex()
    }
    return SearchDB.instance
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (): Promise<void> => {
      if (this.isShuttingDown) return
      this.isShuttingDown = true
      console.log('Shutting down Weaviate embedded server...')
      await this.persist()  // Ensure data is persisted before shutdown
      await this.shutdown()
      // Don't call process.exit() directly - let the app handle shutdown
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    process.on('beforeExit', async () => {
      if (!this.isShuttingDown) {
        await this.shutdown()
      }
    })
  }

  private async initializeDB(): Promise<void> {
    try {
      try {
        await this.client.schema.classCreator().withClass(schema).do()
        console.log('Schema created successfully.')
      } catch (err) {
        const error = err as Error
        console.log('Schema already exists or failed to create:', error.message)
      }
    } catch (err) {
      const error = err as Error
      console.error('Error initializing Weaviate schema:', error)
      throw error
    }
  }

  public async loadFileIndex(): Promise<void> {
    try {
      const indexContent = await fs.readFile(this.indexPath, 'utf-8')
      this.fileIndex = JSON.parse(indexContent)
      console.log('File index loaded successfully.')
    } catch (error) {
      console.log('No existing file index found, starting fresh.')
      this.fileIndex = {}
    }
  }

  public async persist(): Promise<void> {
    try {
      await fs.writeFile(this.indexPath, JSON.stringify(this.fileIndex, null, 2), 'utf-8')
      console.log('File index persisted successfully.')
    } catch (error) {
      console.error('Error persisting search data:', error)
    }
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath)
    return await sha256(content)
  }

  private async getContent(filePath: string): Promise<string> {
    return await readContent(filePath)
  }

  public async search(searchTerm: string): Promise<Array<{
    text: string
    metadata: {
      path: string
      created_at: number
      modified_at: number
      filetype: string
      languages: string[]
      links: string[]
      owner: null
      seen_at: number
    }
  }>> {
    try {
      const vector = await embed(searchTerm)
      const result = await this.client.graphql
        .get()
        .withClassName('Document')
        .withHybrid({
          query: searchTerm,
          vector
        })
        .withLimit(10)
        .withFields('content path lastModified extension')
        .do()

      return result.data.Get.Document.map((hit: WeaviateDocument) => ({
        text: hit.content,
        metadata: {
          path: hit.path,
          created_at: hit.lastModified / 1000,
          modified_at: hit.lastModified / 1000,
          filetype: hit.extension,
          languages: [],
          links: [],
          owner: null,
          seen_at: Date.now() / 1000
        }
      }))
    } catch (error) {
      console.error('Search error:', error)
      throw error
    }
  }

  public async removeFile(filePath: string): Promise<void> {
    try {
      await this.client.batch
        .objectsBatchDeleter()
        .withClassName('Document')
        .withWhere({
          operator: 'Equal',
          path: ['path'],
          valueString: filePath
        })
        .do()

      delete this.fileIndex[filePath]
      await this.persist()
      console.log(`Removed file from index: ${filePath}`)
    } catch (error) {
      console.error(`Error removing file ${filePath}:`, error)
    }
  }

  public async indexUrl(url: string, content: string, title: string): Promise<void> {
    try {
      const hash = await sha256(Buffer.from(content))
      const vector = await embed(content)

      await this.client.data
        .creator()
        .withClassName('Document')
        .withProperties({
          path: url,
          content: content,
          filename: title,
          extension: 'md',
          lastModified: Date.now(),
          hash: hash
        })
        .withVector(vector)
        .do()

      this.fileIndex[url] = hash
      await this.persist()
      console.log(`Indexed URL: ${url}`)
    } catch (error) {
      console.error(`Error indexing URL ${url}:`, error)
    }
  }

  public async shutdown(): Promise<void> {
    try {
      await this.client.embedded.stop()
      console.log('Weaviate embedded server stopped successfully.')
    } catch (error) {
      console.error('Error shutting down Weaviate embedded server:', error)
    }
  }

  public async startIndexing(
    dirPath: string,
    progressCallback?: (progress: number, status: string) => void
  ): Promise<string[]> {
    try {
      const result = await this.indexDirectory(dirPath, progressCallback)

      if (progressCallback) {
        progressCallback(100, 'Indexing complete')
      }

      return result
    } catch (error) {
      console.error('Error during indexing:', error)
      if (progressCallback) {
        progressCallback(0, 'Indexing failed')
      }
      throw error
    }
  }

  public async setupFileWatcher(dirPath: string): Promise<void> {
    const chokidar = await import('chokidar')
    const watcher = chokidar.default.watch(dirPath, {
      ignored: /[/\\]\./,
      persistent: true,
      ignoreInitial: true
    })

    watcher
      .on('add', async (path) => {
        await this.indexFile(path)
        await this.persist()
      })
      .on('change', async (path) => {
        await this.indexFile(path)
        await this.persist()
      })
      .on('unlink', async (path) => {
        await this.removeFile(path)
        await this.persist()
      })
  }
}

export default SearchDB
