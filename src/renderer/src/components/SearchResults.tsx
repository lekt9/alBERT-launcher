import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, ExternalLink, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpcClient } from '../util/trpc-client';
import { RankedChunk } from '@/lib/context-utils';
import { useDrag } from 'react-dnd';

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
  rankedChunks: RankedChunk[];
  createStickyNote: (
    result: SearchResult,
    position: { x: number; y: number }
  ) => void;
}

interface DropResult {
  x: number;
  y: number;
}

const handlePathClick = async (path: string, e: React.MouseEvent): Promise<void> => {
  e.stopPropagation();

  if (path.startsWith('http')) {
    window.open(path, '_blank');
  } else {
    try {
      await trpcClient.document.open.mutate(path);
    } catch (error) {
      console.error('Failed to open document:', error);
    }
  }
};

const truncateText = (text: string, maxLength: number = 150): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

const SearchResultItem: React.FC<{
  result: SearchResult;
  chunk: RankedChunk & { combinedText: string };
  index: number;
  selectedIndex: number;
  createStickyNote: (result: SearchResult, position: { x: number; y: number }) => void;
}> = ({ result, chunk, index, selectedIndex, createStickyNote }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'searchResult',
    item: () => ({
      type: 'searchResult',
      result,
      text: chunk.combinedText,
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const dropResult = monitor.getDropResult<{ x: number; y: number }>();
      if (dropResult) {
        createStickyNote(result, {
          x: dropResult.x,
          y: dropResult.y,
        });
      }
    },
  });

  const isWebSource =
    result.metadata.sourceType === 'web' ||
    result.metadata.path.startsWith('http');
  const displayName = isWebSource
    ? truncateText(
        result.metadata.title ||
          result.metadata.path.split('/').pop() ||
          '',
        50
      )
    : truncateText(result.metadata.path.split('/').pop() || '', 50);

  const truncatedContent = truncateText(chunk.combinedText, 500);

  return (
    <div
      ref={drag}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className={cn(
        'card-item m-2',
        index === selectedIndex ? 'z-10' : 'z-0'
      )}
    >
      <Card
        className={cn(
          'hover:bg-accent/50 transition-all duration-200 rounded-xl overflow-hidden backdrop-blur-sm',
          index === selectedIndex
            ? 'bg-accent/95 border-primary'
            : 'bg-background/95'
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
                {new Date(
                  result.metadata.modified_at * 1000
                ).toLocaleDateString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const SearchResults: React.FC<SearchResultsProps> = React.memo(
  ({ searchResults, selectedIndex, rankedChunks, createStickyNote }) => {
    const groupedChunks = useMemo(() => {
      const chunksByPath = new Map<string, RankedChunk[]>();

      rankedChunks.forEach((chunk) => {
        if (!chunksByPath.has(chunk.path)) {
          chunksByPath.set(chunk.path, []);
        }
        chunksByPath.get(chunk.path)?.push(chunk);
      });

      const combinedChunks: Array<RankedChunk & { combinedText: string }> = [];
      chunksByPath.forEach((chunks) => {
        const combinedText = chunks
          .map((chunk) => chunk.text.trim())
          .join('\n\n---\n\n');

        const maxScore = Math.max(...chunks.map((c) => c.score));

        combinedChunks.push({
          ...chunks[0],
          text: combinedText,
          score: maxScore,
          combinedText,
        });
      });

      return combinedChunks.sort((a, b) => b.score - a.score);
    }, [rankedChunks]);

    const handleResultClick = async (result: SearchResult): Promise<void> => {
      try {
        await trpcClient.document.open.mutate(result.metadata.path);
      } catch (error) {
        console.error('Failed to open document:', error);
      }
    };

    return (
      <div
        className={cn(
          'flex-1 overflow-hidden rounded-b-xl',
          searchResults.length === 0 ? 'h-0' : ''
        )}
      >
        <ScrollArea
          className={cn('h-full', searchResults.length === 0 ? 'p-0' : '')}
        >
          {groupedChunks.map((chunk, index) => {
            const result = searchResults.find(
              (r) => r.metadata.path === chunk.path
            );
            if (!result) return null;

            return (
              <SearchResultItem
                key={`${chunk.path}-${index}`}
                result={result}
                chunk={chunk}
                index={index}
                selectedIndex={selectedIndex}
                createStickyNote={createStickyNote}
              />
            );
          })}
        </ScrollArea>
        {searchResults.length > 0 && (
          <div className="flex items-center justify-between mt-2 px-4 pb-2 text-xs text-muted-foreground bg-background/95 backdrop-blur-sm rounded-b-xl">
            <span>
              {selectedIndex === -1 ? 'Press → to pin to context' : 'Press ↑ to select'}
            </span>
            <span>Drag items to create sticky notes</span>
          </div>
        )}
      </div>
    );
  }
);

SearchResults.displayName = 'SearchResults';

export default SearchResults;
