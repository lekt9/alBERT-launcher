import React, { useState } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import BrowserWindow from './BrowserWindow'
import { RankedChunk } from '@/lib/context-utils'
import { SearchResult } from '../types'
import { motion, AnimatePresence } from 'framer-motion'
import { PanelLeftOpen } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface MainViewProps {
  isBrowserMode: boolean
  url: string
  onNavigate: (url: string) => void
  showResults: boolean
  searchResults: SearchResult[]
  selectedIndex: number
  rankedChunks: RankedChunk[]
  createStickyNote: (result: SearchResult, position: { x: number; y: number }) => void
  conversations: any[]
  isLoading: boolean
  onNewChat: () => void
  askAIQuestion: (query: string) => Promise<void>
  dispatch: any
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResult[]>>
  setShowResults: React.Dispatch<React.SetStateAction<boolean>>
  filterOutStickyNotes: (results: SearchResult[]) => SearchResult[]
  showChat: boolean
  webviewRef: React.RefObject<Electron.WebviewTag>
}

const MainView: React.FC<MainViewProps> = ({
  url,
  onNavigate,
  showResults,
  searchResults,
  selectedIndex,
  createStickyNote,
  webviewRef,
}) => {
  const [isContextVisible, setIsContextVisible] = useState(false);

  return (
    <div className="flex-1 overflow-hidden flex">
      <div className="flex-1 relative">
        <div className="h-full">
          <motion.div
            className={cn(
              'h-full transition-all duration-200',
              isContextVisible && showResults ? 'ml-[400px]' : ''
            )}
            animate={{
              marginLeft: isContextVisible && showResults ? 400 : 0
            }}
            transition={{ duration: 0.2 }}
          >
            <BrowserWindow 
              url={url} 
              onNavigate={onNavigate}
              ref={webviewRef}
            />
          </motion.div>
        </div>
      </div>

      {/* Context Toggle Button */}
      {showResults && searchResults.length > 0 && (
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "fixed left-4 top-4 z-50 transition-all duration-200",
            isContextVisible ? "left-[420px]" : "left-4"
          )}
          onClick={() => setIsContextVisible(!isContextVisible)}
        >
          <PanelLeftOpen className={cn(
            "h-4 w-4 transition-all",
            isContextVisible && "rotate-180"
          )} />
        </Button>
      )}

      {/* Search Results Panel */}
      <AnimatePresence>
        {isContextVisible && showResults && searchResults.length > 0 && (
          <motion.div
            initial={{ x: -400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -400, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed left-0 top-0 bottom-0 w-[400px] bg-background/95 backdrop-blur border-r"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-sm font-semibold">Context</h2>
                <Badge variant="secondary" className="text-xs">
                  {searchResults.length} results
                </Badge>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-2">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default MainView
