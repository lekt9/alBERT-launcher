import React, { useState, useEffect } from 'react'
import { Input } from '../ui/input'
import { Search, Lock, LockOpen, Loader2 } from 'lucide-react'
import { Switch } from '../ui/switch'

interface SearchInputProps {
  query: string
  isLoading: boolean
  isPrivate: boolean
  currentConversation: {
    id: string;
    messages: Array<any>;
  } | null
  inputRef: React.RefObject<HTMLInputElement>
  onQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPrivacyToggle: (checked: boolean) => void
}

export function SearchInput({
  query,
  isLoading,
  isPrivate,
  currentConversation,
  inputRef,
  onQueryChange,
  onPrivacyToggle
}: SearchInputProps) {
  return (
    <div className="flex-none">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={onQueryChange}
          placeholder={currentConversation ? "Ask a follow-up question..." : "Search..."}
          className="w-full pl-12 pr-24 py-4 text-xl border-none focus-visible:ring-0 rounded-none"
          autoFocus
          onBlur={(e) => {
            if (!e.relatedTarget?.matches('input, textarea')) {
              e.target.focus()
            }
          }}
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
              onCheckedChange={onPrivacyToggle}
              className="data-[state=checked]:bg-green-500"
            />
          </div>
          {isLoading && (
            <Loader2 className="h-5 w-5 animate-spin ml-2" />
          )}
        </div>
      </div>
    </div>
  )
} 