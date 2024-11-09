// @components/SearchResults.tsx
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, MessageSquare, ExternalLink, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { trpcClient } from '../util/trpc-client';
import { getRankedChunks, RankedChunk } from '@/lib/context-utils';

interface SearchResult {
  text: string;
  dist: number;
  metadata: {
    path: string;
    title?: string;
    created_at: number;
    modified_at: number;
    filetype: string;
    languages: string[];
    links: string[];
    owner: string | null;
    seen_at: number;
    sourceType?: 'document' | 'web';
  };
}

interface SearchResultsProps {
  searchResults: SearchResult[];
  selectedIndex: number;
  handleResultClick: (result: SearchResult) => void;
  rankedChunks: RankedChunk[];
}

const cardVariants = {
  initial: {
    x: 0,
    opacity: 0,
    scale: 0.8,
  },
  animate: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.05,
    },
  },
  exit: {
    x: -20,
    opacity: 0,
    scale: 0.8,
    transition: {
      duration: 0.05,
    },
  },
};

const handlePathClick = async (path: string, e: React.MouseEvent) => {
  e.stopPropagation(); // Prevent triggering the card click
  
  if (path.startsWith('http')) {
    // Open URLs in default browser
    window.open(path, '_blank');
  } else {
    // Open local files using trpc
    try {
      await trpcClient.document.open.mutate(path);
    } catch (error) {
      console.error('Failed to open document:', error);
    }
  }
};

const SearchResults: React.FC<SearchResultsProps> = React.memo(
  ({ searchResults, selectedIndex, handleResultClick, rankedChunks }) => {
    // Group chunks by path and sort within groups by their original position
    const groupedChunks = useMemo(() => {
      const chunksByPath = new Map<string, RankedChunk[]>()
      
      rankedChunks.forEach(chunk => {
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
          const result = searchResults.find(r => r.metadata.path === path)
          if (!result) return 0
          return result.text.indexOf(a.text) - result.text.indexOf(b.text)
        })

        // Combine chunks with markdown separator
        const combinedText = sortedChunks
          .map(chunk => chunk.text.trim())
          .join('\n\n---\n\n')

        // Use the highest score among the chunks for this document
        const maxScore = Math.max(...chunks.map(c => c.score))

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

    return (
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="transition-all duration-200 h-[500px]">
          {groupedChunks.map((chunk, index) => {
            const result = searchResults.find(r => r.metadata.path === chunk.path)
            if (!result) return null

            const isWebSource = result.metadata.sourceType === 'web' || result.metadata.path.startsWith('http')
            const displayName = isWebSource 
              ? (result.metadata.title || result.metadata.path.split('/').pop())
              : result.metadata.path.split('/').pop()
            
            return (
              <motion.div
                key={`${chunk.path}-${index}`}
                variants={cardVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                layoutId={`card-${chunk.path}-${index}`}
                className={cn(
                  'card-item m-2 cursor-pointer',
                  index === selectedIndex ? 'z-10' : 'z-0'
                )}
              >
                <Card
                  className={cn(
                    'hover:bg-accent/50 transition-all duration-200',
                    index === selectedIndex ? 'bg-accent border-primary' : ''
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
                        >
                          {displayName}
                          {isWebSource ? (
                            <ExternalLink className="h-3 w-3" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {isWebSource ? 'Web Source' : 'Document'}
                        </span>
                        <Badge variant="secondary" className="ml-2">
                          Score: {chunk.score.toFixed(2)}
                        </Badge>
                      </h3>
                      {isWebSource && (
                        <div 
                          className="text-xs text-muted-foreground mt-1 hover:text-primary cursor-pointer transition-colors"
                          onClick={(e) => handlePathClick(result.metadata.path, e)}
                        >
                          {result.metadata.path}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1 prose prose-sm max-w-none">
                        <ReactMarkdown>{chunk.combinedText}</ReactMarkdown>
                      </div>
                      <div className="flex items-center mt-2 space-x-2">
                        <span className="text-xs text-muted-foreground">
                          Modified: {new Date(result.metadata.modified_at * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </ScrollArea>
        <div className="flex items-center mt-2 text-xs text-muted-foreground">
          <span>
            {selectedIndex === -1
              ? 'Press → to pin to context'
              : 'Press ↑ to select'}
          </span>
        </div>
      </div>
    )
  }
);

SearchResults.displayName = 'SearchResults';

export default SearchResults;