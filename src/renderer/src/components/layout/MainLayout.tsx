import React from 'react'
import { cn } from '@/lib/utils'

interface MainLayoutProps {
  children: React.ReactNode
  onBackgroundClick: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function MainLayout({ children, onBackgroundClick }: MainLayoutProps) {
  return (
    <div 
      className="h-screen w-screen flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onBackgroundClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex flex-col">
        <div className="flex gap-4 transition-all duration-200">
          {children}
        </div>
      </div>
    </div>
  )
} 