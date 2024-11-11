// @components/SearchResults.tsx
import React, { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, ExternalLink, Globe } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { trpcClient } from '../util/trpc-client'
import { RankedChunk } from '@/lib/context-utils'

interface SearchResult {
  text: string
  dist: number
  metadata: {
    path: string
    title?: string
    created_at: number
    modified_at: number
    filetype: string
    languages: string[]
    links: string[]
    owner: string | null
    seen_at: number
    sourceType?: 'document' | 'web'
  }
}

interface SearchResultsProps {
  searchResults: SearchResult[]
  selectedIndex: number
  rankedChunks: RankedChunk[]
  onDragStart: (e: React.DragEvent<HTMLDivElement>, result: SearchResult) => void
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
}

const cardVariants = {
  initial: {
    x: 0,
    opacity: 0,
    scale: 0.8
  },
  animate: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.05,
      type: "spring",
      stiffness: 300,
      damping: 30
    }
  },
  exit: {
    x: -20,
    opacity: 0,
    scale: 0.8,
    transition: {
      duration: 0.05
    }
  }
}

const handlePathClick = async (path: string, e: React.MouseEvent) => {
  e.stopPropagation() // Prevent triggering the card click

  if (path.startsWith('http')) {
    // Open URLs in default browser
    window.open(path, '_blank')
  } else {
    // Open local files using trpc
    try {
      await trpcClient.document.open.mutate(path)
    } catch (error) {
      console.error('Failed to open document:', error)
    }
  }
}

const truncateText = (text: string, maxLength: number = 150) => {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

const SearchResults = React.memo<SearchResultsProps>(
  ({ searchResults, selectedIndex, rankedChunks, onDragStart, onDragEnd }) => {
    // Group chunks by path and sort within groups by their original position
    const groupedChunks = useMemo(() => {
      const chunksByPath = new Map<string, RankedChunk[]>()

      rankedChunks.forEach((chunk) => {
        if (!chunksByPath.has(chunk.path)) {
          chunksByPath.set(chunk.path, [])
        }
        chunksByPath.get(chunk.path)?.push(chunk)
      })

      // For each document, sort its chunks and combine them
      const combinedChunks: Array<RankedChunk & { combinedText: string }> = []

      chunksByPath.forEach((chunks, path) => {
        // Sort chunks by their original position in the text
        // We can use the fact that splitContent creates chunks in sequence
        const sortedChunks = chunks.sort((a, b) => {
          // Find the position of these chunks in the original text
          const result = searchResults.find((r) => r.metadata.path === path)
          if (!result) return 0
          return result.text.indexOf(a.text) - result.text.indexOf(b.text)
        })

        // Combine chunks with markdown separator
        const combinedText = sortedChunks.map((chunk) => chunk.text.trim()).join('\n\n---\n\n')

        // Use the highest score among the chunks for this document
        const maxScore = Math.max(...chunks.map((c) => c.score))

        combinedChunks.push({
          ...chunks[0],
          text: combinedText,
          score: maxScore,
          combinedText
        })
      })

      // Sort combined chunks by their scores
      return combinedChunks.sort((a, b) => b.score - a.score)
    }, [rankedChunks, searchResults])

    const handleResultClick = async (result: SearchResult) => {
      try {
        await trpcClient.document.open.mutate(result.metadata.path)
      } catch (error) {
        console.error('Failed to open document:', error)
      }
    }

    return (
      <div className={cn(
        'flex-1 overflow-hidden px-2',
        searchResults.length === 0 ? 'h-0' : ''
      )}>
        <ScrollArea className={cn(
          'h-full',
          searchResults.length === 0 ? 'p-0' : ''
        )}>
          {groupedChunks.map((chunk, index) => {
            const result = searchResults.find((r) => r.metadata.path === chunk.path)
            if (!result) return null

            const isWebSource = result.metadata.sourceType === 'web' || result.metadata.path.startsWith('http')
            const displayName = isWebSource
              ? truncateText(result.metadata.title || result.metadata.path.split('/').pop() || '', 50)
              : truncateText(result.metadata.path.split('/').pop() || '', 50)

            const truncatedContent = truncateText(chunk.combinedText, 500)

            return (
              <motion.div
                key={`${chunk.path}-${index}`}
                variants={cardVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                layoutId={`card-${chunk.path}-${index}`}
                className={cn(
                  'relative my-4 first:mt-2 last:mb-2',
                  'cursor-move group',
                  index === selectedIndex ? 'z-10' : 'z-0'
                )}
                draggable="true"
                onDragStart={(e) => onDragStart(e, result)}
                onDragEnd={onDragEnd}
              >
                <div className="absolute inset-0 bg-white/20 dark:bg-slate-900/20 blur-lg rounded-[1.5rem] group-hover:bg-white/30 dark:group-hover:bg-slate-900/30 transition-all duration-300" />
                <Card
                  className={cn(
                    'relative bg-gradient-to-b from-white/90 to-white/80 dark:from-slate-800/90 dark:to-slate-900/80',
                    'backdrop-blur-md rounded-[1.5rem] overflow-hidden',
                    'border border-white/40 dark:border-slate-700/40',
                    'shadow-[0_8px_16px_-6px_rgba(0,0,0,0.1),inset_0_2px_4px_rgba(255,255,255,0.4)]',
                    'dark:shadow-[0_8px_16px_-6px_rgba(0,0,0,0.2),inset_0_2px_4px_rgba(0,0,0,0.4)]',
                    'transition-all duration-300',
                    'group-hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.15),inset_0_2px_4px_rgba(255,255,255,0.4)]',
                    'dark:group-hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(0,0,0,0.4)]',
                    index === selectedIndex ? 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background/50' : ''
                  )}
                  onClick={() => handleResultClick(result)}
                >
                  <CardContent className="p-3 flex items-start space-x-3">
                    <div className="flex gap-2">
                      <div className="bg-muted rounded-full p-2 mt-1">
                        {isWebSource ? (
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <span
                          onClick={(e) => handlePathClick(result.metadata.path, e)}
                          className="hover:text-primary cursor-pointer transition-colors flex items-center gap-1"
                          title={result.metadata.path}
                        >
                          {displayName}
                          {isWebSource ? (
                            <ExternalLink className="h-3 w-3" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {isWebSource ? 'Web' : 'Document'}
                        </span>
                        {/* <Badge variant="secondary" className="ml-2">
                          Score: {chunk.score.toFixed(2)}
                        </Badge> */}
                      </h3>
                      {isWebSource && (
                        <div
                          className="text-xs text-muted-foreground mt-1 hover:text-primary cursor-pointer transition-colors"
                          onClick={(e) => handlePathClick(result.metadata.path, e)}
                          title={result.metadata.path}
                        >
                          {truncateText(result.metadata.path, 100)}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1 prose prose-sm max-w-none">
                        <ReactMarkdown>{truncatedContent}</ReactMarkdown>
                      </div>
                      <div className="flex items-center mt-2 space-x-2">
                        <span className="text-xs text-muted-foreground">
                          Modified:{' '}
                          {new Date(result.metadata.modified_at * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </ScrollArea>
        {searchResults.length > 0 && (
          <div className="flex items-center justify-between mt-2 px-4 text-xs text-muted-foreground">
            <span>{selectedIndex === -1 ? 'Press → to pin to context' : 'Press ↑ to select'}</span>
            <span>Drag items to create sticky notes</span>
          </div>
        )}
      </div>
    )
  }
)

SearchResults.displayName = 'SearchResults'

export default SearchResults
