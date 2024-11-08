import React from 'react';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Lock, LockOpen } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface SearchBarProps {
  query: string;
  setQuery: (query: string) => void;
  isLoading: boolean;
  isPrivate: boolean;
  handlePrivacyToggle: (checked: boolean) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const SearchBar: React.FC<SearchBarProps> = React.memo(({
  query,
  isLoading,
  isPrivate,
  handlePrivacyToggle,
  handleInputChange,
}) => {
  return (
    <div className="relative">
      <Search 
        className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" 
      />
      <Input
        type="text"
        value={query}
        onChange={handleInputChange}
        placeholder={query ? 'Ask a follow-up question...' : 'Search...'}
        className="w-full pl-12 pr-24 py-4 text-xl border-none focus-visible:ring-0 rounded-none bg-background text-foreground"
      />
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {isPrivate ? (
              <Lock className="h-4 w-4" />
            ) : (
              <LockOpen className="h-4 w-4" />
            )}
          </span>
          <Switch
            checked={isPrivate}
            onCheckedChange={handlePrivacyToggle}
            className="data-[state=checked]:bg-primary"
          />
        </div>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin ml-2" />}
      </div>
    </div>
  );
});

SearchBar.displayName = 'SearchBar';

export default SearchBar; 