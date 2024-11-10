import React, { useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import type { SearchResult } from '../App'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

export interface SearchStep {
  id: string
  query: string
  status: 'waiting' | 'searching' | 'thinking' | 'complete' | 'failed'
  results?: SearchResult[]
  answer?: string
}

export default function SearchBadges({ steps }: { steps: SearchStep[] }): JSX.Element {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Auto scroll to bottom when steps change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [steps])

  // Filter out completed evaluation steps without answers
  const filteredSteps = steps.filter(step => {
    if (step.query === 'Evaluating results...' && step.status === 'complete' && !step.answer) {
      return false
    }
    return true
  })

  return (
    <div 
      ref={scrollContainerRef}
      className="flex flex-wrap gap-2 overflow-y-auto max-h-[4.5rem] min-h-[4.5rem] px-4 py-2 scrollbar-thin scrollbar-thumb-primary scrollbar-track-transparent"
      style={{
        scrollBehavior: 'smooth',
        maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
      }}
    >
      <div className="flex flex-wrap gap-2 w-full">
        {filteredSteps.map((step) => (
          <Badge
            key={step.id}
            variant={
              step.status === 'waiting' ? 'secondary' :
              step.status === 'searching' ? 'default' :
              step.status === 'thinking' ? 'outline' :
              step.status === 'complete' ? 'default' :
              'destructive'
            }
            className={cn(
              'whitespace-nowrap transition-all duration-200 flex items-center gap-1',
              step.status === 'complete' ? 'bg-primary text-primary-foreground' : ''
            )}
          >
            {(step.status === 'searching' || step.status === 'thinking') && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            {step.query}
            {step.answer && (
              <span className="ml-2 text-xs opacity-75">
                → {step.answer}
              </span>
            )}
          </Badge>
        ))}
      </div>
    </div>
  )
} 