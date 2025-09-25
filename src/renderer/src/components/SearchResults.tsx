import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, ExternalLink, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { trpcClient } from '../util/trpc-client';
import { RankedChunk } from '@/lib/context-utils';
import { useDrag } from 'react-dnd';
import { Badge } from '@/components/ui/badge';
import type { SearchResult } from '../types/search';

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

  const selectionClasses =
    index === selectedIndex
      ? 'ring-1 ring-sky-300/70 shadow-[0_40px_120px_-60px_rgba(125,211,252,0.55)]'
      : 'shadow-[0_24px_80px_-70px_rgba(15,23,42,0.85)]';

  const variantLabel = isWebSource ? 'Web source' : 'Local file';
  const formattedScore = Math.max(0, chunk.score || 0).toFixed(2);

  return (
    <div
      ref={drag}
      style={{ opacity: isDragging ? 0.35 : 1 }}
      className={cn(
        'card-item m-2 transition-transform duration-300 ease-out hover:-translate-y-1.5',
        index === selectedIndex ? 'z-10' : 'z-0'
      )}
    >
      <Card
        className={cn(
          'glass-panel group relative overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/65 backdrop-blur-2xl',
          selectionClasses
        )}
        onClick={() => handleResultClick(result)}
      >
        <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100" style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.12), rgba(236,72,153,0.08))' }} />
        <CardContent className="relative flex items-start gap-4 p-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sky-200">
            {isWebSource ? (
              <Globe className="h-5 w-5" />
            ) : (
              <FileText className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                <button
                  type="button"
                  onClick={(e) => handlePathClick(result.metadata.path, e)}
                  className="group/button inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-left text-sm font-semibold text-white transition hover:bg-white/10"
                  title={result.metadata.path}
                >
                  {displayName}
                  {isWebSource ? (
                    <ExternalLink className="h-3 w-3 text-slate-200" />
                  ) : (
                    <FileText className="h-3 w-3 text-slate-200" />
                  )}
                </button>
                <Badge className="rounded-full border-white/10 bg-white/10 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-200/90">
                  {variantLabel}
                </Badge>
              </div>
              <Badge
                variant="secondary"
                className="rounded-full border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100"
              >
                Relevance {formattedScore}
              </Badge>
            </div>

            {isWebSource && (
              <div
                className="inline-flex max-w-full items-center gap-2 truncate text-xs text-slate-300/80"
                onClick={(e) => handlePathClick(result.metadata.path, e)}
                title={result.metadata.path}
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{truncateText(result.metadata.path, 100)}</span>
              </div>
            )}

            <div className="prose prose-invert prose-sm max-w-none text-slate-200/90">
              <ReactMarkdown>{truncatedContent}</ReactMarkdown>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300/70">
              <span>
                Modified{' '}
                {new Date(result.metadata.modified_at * 1000).toLocaleDateString()}
              </span>
              <span>Drag to pin as a floating note</span>
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
          'flex-1 overflow-hidden rounded-b-[28px] border border-white/10 bg-white/5 backdrop-blur-xl',
          searchResults.length === 0 ? 'h-0 border-0 bg-transparent' : ''
        )}
      >
        <ScrollArea
          className={cn('h-full px-2 py-3', searchResults.length === 0 ? 'p-0' : '')}
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
          <div className="glass-panel mx-3 mb-3 flex items-center justify-between rounded-[24px] border border-white/10 bg-slate-950/60 px-4 py-3 text-[11px] text-slate-200/80">
            <span>
              {selectedIndex === -1
                ? 'Press → to pin highlighted context'
                : 'Use ↑ / ↓ to explore results'}
            </span>
            <span className="hidden sm:inline">Drag cards to create floating notes</span>
          </div>
        )}
      </div>
    );
  }
);

SearchResults.displayName = 'SearchResults';

export default SearchResults;
