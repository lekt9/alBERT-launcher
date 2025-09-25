import type { SmitheryContextResult } from '../types'
import type { SearchResult, StickyNote } from '../types/search'

interface BuildCombinedContextOptions {
  stickyNotes: StickyNote[]
  smitheryResults: SmitheryContextResult[]
  searchResults: SearchResult[]
  maxLength?: number
}

export function buildCombinedContext({
  stickyNotes,
  smitheryResults,
  searchResults,
  maxLength = 50_000
}: BuildCombinedContextOptions): string {
  let contextLength = 0
  let context = ''

  const append = (chunk: string) => {
    if (!chunk) return
    const nextLength = contextLength + chunk.length
    if (nextLength <= maxLength) {
      context += chunk
      contextLength = nextLength
    }
  }

  const stickyContext = stickyNotes
    .map((note) => {
      const relevanceNote = ' (pinned)'
      return `\n\nFrom ${note.metadata.path}${relevanceNote}:\n${note.text}`
    })
    .join('')

  append(stickyContext)

  smitheryResults.forEach((result) => {
    const title = result.title ? ` – ${result.title}` : ''
    append(
      `\n\nFrom Smithery MCP "${result.serverName ?? result.serverId}"${title}:\n${result.snippet}`
    )
  })

  for (const result of searchResults) {
    const snippet = result.text
    if (!snippet?.trim()) continue
    append(`\n\nFrom ${result.metadata.path}:\n${snippet}`)
    if (contextLength >= maxLength) {
      break
    }
  }

  return context.trim()
}
