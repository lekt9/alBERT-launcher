import React, { useRef, useImperativeHandle, forwardRef } from 'react'
import { Input } from '@/components/ui/input'
import {
  Search,
  Loader2,
  FastForwardIcon,
  BotIcon,
  Settings2,
  Sparkles,
  RadioTower
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

interface SearchBarProps {
  query: string
  setQuery: (query: string) => void
  isLoading: boolean
  useAgent: boolean
  handleAgentToggle: (checked: boolean) => void
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onOpenSettings: () => void
  isSettingsActive: boolean
  connectorSummary: string
  connectorCount: number
  connectorSyncing: boolean
}

export interface SearchBarRef {
  focus: () => void
}

const SearchBar = forwardRef<SearchBarRef, SearchBarProps>(
  (
    {
      query,
      isLoading,
      useAgent,
      handleAgentToggle,
      handleInputChange,
      onOpenSettings,
      isSettingsActive,
      connectorSummary,
      connectorCount,
      connectorSyncing
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus()
      }
    }))

    return (
      <div className="space-y-2">
        <div className="glass-panel relative overflow-hidden rounded-[30px] border border-white/10 p-[1px] shadow-[0_40px_120px_-70px_rgba(56,189,248,0.6)]">
          <div className="pointer-events-none absolute inset-0 rounded-[30px] bg-gradient-to-r from-sky-400/10 via-transparent to-fuchsia-400/10 opacity-70" />
          <div className="relative flex items-center gap-4 rounded-[28px] bg-slate-950/60 px-6 py-4">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-slate-200 shadow-inner shadow-white/5">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/30 to-transparent" />
              <Search className="relative h-5 w-5" />
            </div>
            <div className="flex-1">
              <Input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                placeholder={query ? 'Ask a follow-up question…' : 'Search anything…'}
                className="h-14 w-full rounded-full border-none bg-transparent px-4 text-lg font-medium text-slate-100 placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-100/90 backdrop-blur-lg">
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1 rounded-full border-white/10 bg-white/10 px-2 py-0 text-[11px] uppercase tracking-[0.2em] text-slate-200/90"
                  >
                    <Sparkles className="h-3 w-3" />
                    {useAgent ? 'Agentic' : 'Direct'}
                  </Badge>
                  <Switch
                    checked={useAgent}
                    onCheckedChange={handleAgentToggle}
                    className="data-[state=checked]:bg-sky-400/90 data-[state=checked]:shadow-[0_0_18px_rgba(125,211,252,0.6)]"
                    title={useAgent ? 'Agent-assisted search enabled' : 'Direct search'}
                  />
                </div>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-slate-200/80 transition hover:border-white/20 hover:bg-white/10"
                >
                  <RadioTower className="h-3.5 w-3.5 text-sky-200" />
                  {connectorSummary}
                  {connectorSyncing && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-200" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={onOpenSettings}
                className="group relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                aria-pressed={isSettingsActive}
                aria-label="Toggle settings"
              >
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 transition group-hover:opacity-100 group-aria-[pressed=true]:opacity-100"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(125,211,252,0.35), rgba(244,114,182,0.25))'
                  }}
                />
                <Settings2 className="relative h-5 w-5" />
              </button>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-sky-200" />
                ) : (
                  <BotIcon
                    className={`h-5 w-5 ${useAgent ? 'text-sky-200' : 'text-slate-300/70'}`}
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-3 px-4 text-xs text-slate-300/70">
          <span>
            Press ⏎ to run an in-depth search • ⌘/Ctrl + C to copy context
            {connectorCount > 0 &&
              ` • ${connectorCount} MCP ${connectorCount === 1 ? 'connector' : 'connectors'} linked`}
          </span>
          <span className="flex items-center gap-1">
            <FastForwardIcon className="h-3 w-3 text-slate-300/80" />
            <span>⌘/Ctrl + K opens your knowledgebase</span>
          </span>
        </div>
      </div>
    )
  }
)

SearchBar.displayName = 'SearchBar'

export default SearchBar
