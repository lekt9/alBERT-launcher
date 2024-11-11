import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Lock, LockOpen, FastForwardIcon, BotIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

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
    <div className="relative">
      <Search 
        className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" 
      />
      <Input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        placeholder={query ? 'Ask a follow-up question...' : 'Search...'}
        className="w-full pl-12 pr-24 py-4 text-xl border-none focus-visible:ring-0 rounded-none bg-background text-foreground"
      />
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {useAgent ? (
              <BotIcon className="h-4 w-4" />
            ) : (
              <FastForwardIcon className="h-4 w-4" />
            )}
          </span>
          <Switch
            checked={useAgent}
            onCheckedChange={handleAgentToggle}
            className="data-[state=checked]:bg-primary"
            title={useAgent ? "Agent-assisted search enabled" : "Direct search"}
          />
        </div>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin ml-2" />}
      </div>
    </div>
  );
});

SearchBar.displayName = 'SearchBar';

export default SearchBar; 