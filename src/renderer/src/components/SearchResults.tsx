// @components/SearchResults.tsx
import React, { useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, MessageSquare, ExternalLink, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { trpcClient } from '../util/trpc-client';

interface SearchResult {
  text: string;
  dist: number;
  metadata: {
    path: string;
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

const SearchResults: React.FC<SearchResultsProps> = React.memo(
  ({ searchResults, selectedIndex, handleResultClick }) => {
    const openFile = useCallback(async (path: string) => {
      try {
        await trpcClient.file.open.mutate(path);
      } catch (error) {
        console.error('Failed to open file:', error);
      }
    }, []);

    return (
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="transition-all duration-200 h-[500px]" >
          {searchResults
            .filter((result) => result.metadata.filetype !== 'ai_response')
            .map((result, index) => (
              <motion.div
                key={index}
                variants={cardVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                layoutId={`card-${result.metadata.path}`}
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
                        {result.metadata.sourceType === 'web' ? (
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        {result.metadata.path.split('/').pop()}
                        <span className="text-xs font-normal text-muted-foreground">
                          {result.metadata.sourceType === 'web' ? 'Web Source' : 'Document'}
                        </span>
                      </h3>
                      <div className="text-xs text-muted-foreground mt-1 prose prose-sm max-w-none">
                        <ReactMarkdown>{result.text}</ReactMarkdown>
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
            ))}
        </ScrollArea>
        <div className="flex items-center mt-2 text-xs text-muted-foreground">
          <span>
            {selectedIndex === -1
              ? 'Press → to pin to context'
              : 'Press ↑ to select'}
          </span>
        </div>
      </div>
    );
  }
);

SearchResults.displayName = 'SearchResults';

export default SearchResults;