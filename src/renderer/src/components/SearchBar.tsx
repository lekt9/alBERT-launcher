import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Loader2, FastForwardIcon, BotIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  query: string;
  setQuery: (query: string) => void;
  isLoading: boolean;
  useAgent: boolean;
  handleAgentToggle: (checked: boolean) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export interface SearchBarRef {
  focus: () => void;
}

const SearchBar = forwardRef<SearchBarRef, SearchBarProps>(({
  query,
  isLoading,
  useAgent,
  handleAgentToggle,
  handleInputChange,
}, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    }
  }));

  return (
    <div className="relative p-2">
      <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 blur-xl rounded-[2rem]" />
      <div className="relative bg-gradient-to-b from-white/80 to-white/60 dark:from-slate-800/80 dark:to-slate-900/60 backdrop-blur-md rounded-[2rem] shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)] dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-white/40 dark:border-slate-700/40">
        <div className="relative px-2 py-1">
          <Search 
            className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground/60 h-5 w-5" 
          />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder={query ? 'Ask a follow-up question...' : 'Search...'}
            className={cn(
              "w-full px-14 py-4 text-lg",
              "bg-transparent border-0",
              "rounded-[1.75rem]",
              "placeholder:text-muted-foreground/40",
              "focus:ring-0 focus:border-0",
              "shadow-none"
            )}
          />
          <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-3">
            <div className="flex items-center gap-3 bg-white/50 dark:bg-slate-800/50 rounded-full px-3 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
              <span className="text-xs text-muted-foreground/60">
                {useAgent ? (
                  <BotIcon className="h-4 w-4" />
                ) : (
                  <FastForwardIcon className="h-4 w-4" />
                )}
              </span>
              <Switch
                checked={useAgent}
                onCheckedChange={handleAgentToggle}
                className={cn(
                  "data-[state=checked]:bg-primary/70",
                  "bg-muted/50"
                )}
                title={useAgent ? "Agent-assisted search enabled" : "Direct search"}
              />
            </div>
            {isLoading && (
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-full p-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

SearchBar.displayName = 'SearchBar';

export default SearchBar; 