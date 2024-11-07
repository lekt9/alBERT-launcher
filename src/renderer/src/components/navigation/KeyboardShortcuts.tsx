import React from 'react'

interface KeyboardShortcutsProps {
  showDocument: boolean
  activePanel: 'none' | 'chat' | 'document' | 'settings'
}

export function KeyboardShortcuts({ showDocument, activePanel }: KeyboardShortcutsProps) {
  return (
    <div className="flex flex-col items-center mt-4 text-white/50 text-sm space-y-4">
      <div className="flex justify-center space-x-6">
        <div className="flex items-center space-x-1">
          <kbd className="px-2 py-1 bg-black/20 rounded">↑↓</kbd>
          <span>Navigate</span>
        </div>
        <div className="flex items-center space-x-1">
          <kbd className="px-2 py-1 bg-black/20 rounded">←</kbd>
          <span>
            {showDocument 
              ? 'Remove Last Document' 
              : activePanel === 'settings'
              ? 'Close Settings'
              : 'Settings'}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <kbd className="px-2 py-1 bg-black/20 rounded">→</kbd>
          <span>
            {activePanel === 'settings' 
              ? 'Close Settings' 
              : 'Add to Context'}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <kbd className="px-2 py-1 bg-black/20 rounded">Enter</kbd>
          <span>Ask Question</span>
        </div>
      </div>
      <div className="flex justify-center space-x-6">
        <div className="flex items-center space-x-1">
          <kbd className="px-2 py-1 bg-black/20 rounded">Esc</kbd>
          <span>Clear All</span>
        </div>
        <div className="flex items-center space-x-1">
          <kbd className="px-2 py-1 bg-black/20 rounded">⌘/Ctrl + C</kbd>
          <span>Copy</span>
        </div>
        <div className="flex items-center space-x-1">
          <kbd className="px-2 py-1 bg-black/20 rounded">⌘/Ctrl + K</kbd>
          <span>Open Knowledgebase</span>
        </div>
      </div>
    </div>
  )
} 