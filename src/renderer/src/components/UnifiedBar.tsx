import React, { forwardRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Bot, FastForward, ArrowLeft, ArrowRight, RotateCcw, Globe, X, Loader2, FileText, GripHorizontal } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import { trpcClient } from '../util/trpc-client';
import Draggable from 'react-draggable';

interface UnifiedBarProps {
  query: string;
  setQuery: (query: string) => void;
  isLoading: boolean;
  useAgent: boolean;
  handleAgentToggle: (checked: boolean) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNavigate: (direction: 'back' | 'forward' | 'reload') => void;
  canGoBack: boolean;
  canGoForward: boolean;
  isBrowserMode: boolean;
  onSubmit: (value: string, isUrl: boolean) => void;
  title?: string;
  showChat: boolean;
  conversations: any[];
  onNewChat: () => void;
  createStickyNote: (result: any, position: { x: number; y: number }) => void;
  isLoading: boolean;
  askAIQuestion: (query: string) => Promise<void>;
  dispatch: any;
  setSearchResults: React.Dispatch<React.SetStateAction<any[]>>;
  setShowResults: React.Dispatch<React.SetStateAction<boolean>>;
  filterOutStickyNotes: (results: any[]) => any[];
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

const UnifiedBar = forwardRef<HTMLInputElement, UnifiedBarProps>(({
  query,
  useAgent,
  handleAgentToggle,
  handleInputChange,
  onNavigate,
  canGoBack,
  canGoForward,
  isBrowserMode,
  onSubmit,
  title,
  showChat,
  conversations,
  onNewChat,
  createStickyNote,
  isLoading,
  askAIQuestion,
  dispatch,
  setSearchResults,
  setShowResults,
  filterOutStickyNotes
}, ref) => {
  const [isChatExpanded, setIsChatExpanded] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const getFirstSentence = (text: string) => {
    const match = text.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : text.slice(0, 100) + '...';
  };

  const isUrl = (input: string): boolean => {
    return input.includes('.') || input.startsWith('http://') || input.startsWith('https://');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = query.trim();
    
    if (!input) return;

    if (isUrl(input)) {
      onSubmit(input, true);
    } else {
      setIsChatExpanded(true);
      onSubmit(input, false);
    }
  };

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
        {/* Chat Response Panel */}
        <AnimatePresence>
          {showChat && conversations.length > 0 && (
            <motion.div
              initial={{ height: 52, y: 20 }}
              animate={{ 
                height: isChatExpanded ? 'auto' : 52,
                y: 0,
                transition: {
                  height: {
                    type: "spring",
                    stiffness: 100,
                    damping: 15
                  },
                  y: {
                    type: "spring",
                    stiffness: 200,
                    damping: 20
                  }
                }
              }}
              exit={{ 
                height: 52,
                y: 20,
                opacity: 0
              }}
              onClick={() => setIsChatExpanded(!isChatExpanded)}
              className="mb-2 overflow-hidden rounded-xl border bg-background/95 backdrop-blur shadow-lg cursor-pointer"
            >
              {/* Header/Preview */}
              <div className="flex items-center p-3 border-b bg-muted/50">
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

              {/* Expanded Content */}
              {isChatExpanded && (
                <ScrollArea className="max-h-[400px]">
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
                </ScrollArea>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prompt Bar */}
        <form onSubmit={handleSubmit} className="relative group">
          <Card className="bg-background/95 shadow-2xl flex flex-col transition-all duration-200 rounded-xl overflow-hidden">
            {/* Drag Handle */}
            <div className="absolute inset-x-0 top-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-move drag-handle flex items-center justify-center">
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="flex items-center gap-2 p-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onNavigate('back')}
                  disabled={!canGoBack}
                  type="button"
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onNavigate('forward')}
                  disabled={!canGoForward}
                  type="button"
                  className="h-8 w-8"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onNavigate('reload')}
                  type="button"
                  className="h-8 w-8"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

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
          {title && (
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-background/95 shadow-sm border text-xs flex items-center gap-1.5 text-muted-foreground">
              <Globe className="h-3 w-3" />
              <span className="max-w-[300px] truncate">{title}</span>
            </div>
          )}
        </form>
      </div>
    </Draggable>
  );
});

UnifiedBar.displayName = "UnifiedBar";

export default UnifiedBar; 