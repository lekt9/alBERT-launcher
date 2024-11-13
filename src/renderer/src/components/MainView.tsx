import React from 'react'
import { cn } from '@/lib/utils'
import BrowserWindow from './BrowserWindow'
import { RankedChunk } from '@/lib/context-utils'
import { SearchResult } from '../types'
import { motion, AnimatePresence } from 'framer-motion'

interface MainViewProps {
  url: string
  onNavigate: (url: string) => void
  webviewRef: React.RefObject<Electron.WebviewTag>
  isBrowserVisible: boolean
}

const MainView: React.FC<MainViewProps> = ({
  url,
  onNavigate,
  webviewRef,
  isBrowserVisible,
}) => {
  return (
    <div className="flex-1 overflow-hidden flex">
      <div className="flex-1 relative">
        <div className="h-full">
          <motion.div
            className="h-full transition-all duration-200"
            transition={{ duration: 0.2 }}
          >
            <AnimatePresence mode="wait">
              {isBrowserVisible ? (
                <motion.div
                  key="browser"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2 }}
                  className="h-full"
                >
                  <BrowserWindow 
                    url={url} 
                    onNavigate={onNavigate}
                    ref={webviewRef}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex items-center justify-center text-muted-foreground"
                >
                  Click the globe icon to open browser
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default MainView
