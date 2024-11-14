import React, { forwardRef, useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Bot, FastForward, ArrowLeft, ArrowRight, RotateCcw, Globe, X, Loader2, FileText, GripHorizontal, PanelLeftOpen, Clock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import { trpcClient } from '../util/trpc-client';
import Draggable from 'react-draggable';
import { useDrag } from 'react-dnd';
import { Badge } from '@/components/ui/badge';
import { useWebview } from '@/hooks/useWebview';

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

interface UnifiedBarProps {
  query: string;
  setQuery: (query: string) => void;
  isLoading: boolean;
  useAgent: boolean;
  handleAgentToggle: (checked: boolean) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  title?: string;
  showChat: boolean;
  conversations: any[];
  onNewChat: () => void;
  createStickyNote: (result: any, position: { x: number; y: number }) => void;
  isBrowserVisible: boolean;
  setIsBrowserVisible: (visible: boolean) => void;
  isBrowserMode: boolean;
  webviewRef: React.RefObject<Electron.WebviewTag>;
  showResults: boolean;
  searchResults: SearchResult[];
  selectedIndex: number;
  isContextVisible: boolean;
  setIsContextVisible: (visible: boolean) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  handleNavigation: (direction: 'back' | 'forward' | 'reload') => void;
  handleUrlChange: (url: string) => void;
}

const ResponseItem = ({ response, createStickyNote }: any) => {
  const handlePathClick = async (path: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (path.startsWith('http')) {
      window.dispatchEvent(new CustomEvent('open-in-webview', {
        detail: { url: path }
      }));
    } else {
      try {
        await trpcClient.document.open.mutate(path);
      } catch (error) {
        console.error('Failed to open document:', error);
      }
    }
  };

  return (
    <Card className="hover:bg-accent/50 transition-all duration-200 rounded-xl overflow-hidden backdrop-blur-sm bg-background/95">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{response.question}</h3>
          <span className="text-xs text-muted-foreground">
            {new Date(response.timestamp).toLocaleString()}
          </span>
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{response.answer}</ReactMarkdown>
        </div>
        {response.sources && response.sources.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">Sources:</h4>
            <ul className="text-sm space-y-1">
              {response.sources.map((source: any, index: number) => (
                <li key={index} className="flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  <button
                    onClick={(e) => handlePathClick(source.path, e)}
                    className="text-primary hover:underline hover:text-primary/80 transition-colors text-left"
                  >
                    {source.path}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
};

const SearchResultCard = ({ result, index, isSelected, onDragEnd }: {
  result: SearchResult
  index: number
  isSelected: boolean
  onDragEnd: (result: SearchResult, position: { x: number; y: number }) => void
}) => {
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const url = e.currentTarget.href;
    window.dispatchEvent(new CustomEvent('open-in-webview', {
      detail: { url }
    }));
  };

  const processTextWithLinks = (text: string) => {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    
    const parts = text.split(urlPattern);
    return parts.map((part, i) => {
      if (part.match(urlPattern)) {
        return (
          <a
            key={i}
            href={part}
            onClick={handleLinkClick}
            className="text-primary hover:underline"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const [{ isDragging }, drag] = useDrag({
    type: 'searchResult',
    item: { type: 'searchResult', result },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    }),
    end: (item, monitor) => {
      const dropResult = monitor.getDropResult<{ x: number; y: number }>();
      if (dropResult) {
        onDragEnd(result, dropResult);
      }
    }
  });

  return (
    <Card
      ref={drag}
      className={cn(
        'p-3 hover:bg-accent/50 transition-colors cursor-move',
        isSelected && 'ring-1 ring-primary',
        isDragging && 'opacity-50'
      )}
    >
      <div className="flex items-start gap-2">
        <Search className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
        <div className="space-y-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {result.metadata.title || result.metadata.path.split('/').pop()}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {processTextWithLinks(result.text)}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {new Date(result.metadata.modified_at * 1000).toLocaleDateString()}
          </div>
        </div>
      </div>
    </Card>
  );
};

const UnifiedBar = forwardRef<HTMLInputElement, UnifiedBarProps>(({
  query,
  useAgent,
  handleAgentToggle,
  handleInputChange,
  title,
  showChat,
  conversations,
  onNewChat,
  createStickyNote,
  isBrowserVisible,
  setIsBrowserVisible,
  isBrowserMode,
  webviewRef,
  isLoading,
  showResults,
  searchResults,
  selectedIndex,
  isContextVisible,
  setIsContextVisible,
  canGoBack,
  canGoForward,
  handleNavigation,
  handleUrlChange,
}, ref) => {
  const [isChatExpanded, setIsChatExpanded] = useState(true);
  const [isResultsExpanded, setIsResultsExpanded] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isChatExpanded && scrollContainerRef.current) {
      const scrollContainer = scrollContainerRef.current;
      const scrollTimeout = setTimeout(() => {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);

      return () => clearTimeout(scrollTimeout);
    }
  }, [conversations, isChatExpanded, isLoading]);

  const getFirstSentence = (text: string) => {
    const match = text.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : text.slice(0, 100) + '...';
  };

  const processUrl = (input: string): string => {
    let url = input.trim()
    
    // Handle common search engine shortcuts
    if (/^(g|google)\s+/.test(url)) {
      return `https://www.google.com/search?q=${encodeURIComponent(url.replace(/^(g|google)\s+/, ''))}`
    }
    
    // If it's already a valid URL, ensure it has a protocol
    if (url.includes('.')) {
      // Remove any leading/trailing whitespace and common prefixes
      url = url.replace(/^(?:https?:\/\/)?(?:www\.)?/, '')
      
      // Handle IP addresses
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)) {
        return `http://${url}`
      }
      
      // Handle localhost
      if (url.startsWith('localhost')) {
        return `http://${url}`
      }
      
      // Handle valid domains
      if (/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}/.test(url)) {
        return `https://${url}`
      }
    }
    
    // If it doesn't look like a URL, treat it as a search query
    return `https://duckduckgo.com/?q=${encodeURIComponent(url)}`
  }

  const isUrl = (input: string): boolean => {
    const processed = input.trim().toLowerCase()
    return (
      processed.startsWith('http://') ||
      processed.startsWith('https://') ||
      processed.startsWith('localhost') ||
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(processed) || // IP address
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}/.test(processed) // Domain name
    )
  }

  // Add effect to detect URLs in input and show browser
  useEffect(() => {
    if (query && isUrl(query)) {
      setIsBrowserVisible(true)
    }
  }, [query, setIsBrowserVisible])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = query.trim()
    
    if (!input) return

    console.log('UnifiedBar: Submitting input:', input)

    if (isUrl(input)) {
      // Handle URL navigation
      const processedUrl = processUrl(input)
      console.log('UnifiedBar: Submitting URL:', processedUrl)
      handleUrlChange(processedUrl)
      setIsBrowserVisible(true) // Ensure browser is visible when submitting URL
    } else {
      // Handle search/chat
    }
  }

  return (
    <Draggable
      handle=".drag-handle"
      bounds="parent"
      position={position}
      onStop={(e, data) => {
        setPosition({ x: data.x, y: data.y });
      }}
    >
      <div className="fixed w-[600px] z-50" style={{ bottom: '40px', left: '50%', transform: 'translateX(-50%)' }}>
        {/* Chat Response Panel - Above prompt bar */}
        <AnimatePresence>
          {showChat && conversations.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ 
                height: isChatExpanded ? '300px' : 52,
                opacity: 1,
                transition: {
                  height: {
                    type: "spring",
                    stiffness: 100,
                    damping: 15
                  }
                }
              }}
              exit={{ height: 0, opacity: 0 }}
              onClick={() => setIsChatExpanded(!isChatExpanded)}
              style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '8px' }}
              className="overflow-hidden rounded-xl border bg-background/95 backdrop-blur shadow-lg cursor-pointer"
            >
              {/* Header/Preview */}
              <div className="flex items-center p-3 border-b bg-muted/50 sticky top-0 z-10">
                <div className="flex-1 flex items-center gap-3">
                  <Bot className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {getFirstSentence(conversations[conversations.length - 1].answer)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {isChatExpanded ? 'Click to collapse' : 'Click to expand'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNewChat();
                      setIsChatExpanded(false);
                    }}
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Expanded Content with auto-scroll */}
              {isChatExpanded && (
                <div 
                  ref={scrollContainerRef}
                  className="overflow-y-auto h-[calc(300px-52px)]"
                >
                  <div className="p-4 space-y-4">
                    {conversations.map((response, index) => (
                      <ResponseItem
                        key={index}
                        response={response}
                        createStickyNote={createStickyNote}
                      />
                    ))}
                    {isLoading && (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prompt Bar - Fixed position */}
        <form className="relative group">
          <Card className="bg-background/95 shadow-2xl flex flex-col transition-all duration-200 overflow-hidden border rounded-xl">
            {/* Drag Handle */}
            <div className="absolute inset-x-0 top-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-move drag-handle flex items-center justify-center">
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="flex items-center gap-2 p-2">
              {/* Navigation Controls - Only show when browser is visible */}
              {isBrowserVisible && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleNavigation('back')}
                    disabled={!canGoBack}
                    type="button"
                    className="h-8 w-8"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleNavigation('forward')}
                    disabled={!canGoForward}
                    type="button"
                    className="h-8 w-8"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleNavigation('reload')}
                    type="button"
                    className="h-8 w-8"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="relative flex-1">
                <Search 
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" 
                />
                <Input
                  ref={ref}
                  type="text"
                  value={query}
                  onChange={handleInputChange}
                  placeholder={isBrowserMode ? "Enter URL or search..." : "Search or ask a question..."}
                  className="w-full pl-9 pr-20 py-2 text-sm border-none focus-visible:ring-0 bg-muted/50"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {/* Browser Toggle moved to the right */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsBrowserVisible(!isBrowserVisible)}
                    className="h-8 w-8"
                  >
                    <Globe className={cn(
                      "h-4 w-4 transition-colors",
                      isBrowserVisible && "text-primary"
                    )} />
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {useAgent ? (
                        <Bot className="h-4 w-4" />
                      ) : (
                        <FastForward className="h-4 w-4" />
                      )}
                    </span>
                    <Switch
                      checked={useAgent}
                      onCheckedChange={handleAgentToggle}
                      className="data-[state=checked]:bg-primary h-4 w-7"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Title Bumper */}
          {title && isBrowserVisible && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-background/95 shadow-sm border text-xs flex items-center gap-1.5 text-muted-foreground z-50">
              <Globe className="h-3 w-3" />
              <span className="max-w-[300px] truncate">{title}</span>
            </div>
          )}
        </form>

        {/* Search Results Panel - Below prompt bar */}
        <AnimatePresence>
          {isContextVisible && showResults && searchResults.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ 
                height: isResultsExpanded ? '300px' : 52,
                opacity: 1,
                transition: {
                  height: {
                    type: "spring",
                    stiffness: 100,
                    damping: 15
                  }
                }
              }}
              exit={{ height: 0, opacity: 0 }}
              onClick={() => setIsResultsExpanded(!isResultsExpanded)}
              style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px' }}
              className="overflow-hidden rounded-xl border bg-background/95 backdrop-blur shadow-lg cursor-pointer"
            >
              <div className="flex items-center justify-between p-3 border-b bg-muted/50 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">
                    {searchResults[0].metadata.title || searchResults[0].metadata.path.split('/').pop()}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {searchResults.length} results
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {isResultsExpanded ? 'Click to collapse' : 'Click to expand'}
                </span>
              </div>

              {isResultsExpanded && (
                <ScrollArea className="h-[calc(300px-52px)]">
                  <div className="p-4 space-y-2">
                    {searchResults.map((result, index) => (
                      <SearchResultCard
                        key={`result-${index}`}
                        result={result}
                        index={index}
                        isSelected={index === selectedIndex}
                        onDragEnd={createStickyNote}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Draggable>
  );
});

UnifiedBar.displayName = "UnifiedBar";

export default UnifiedBar; 