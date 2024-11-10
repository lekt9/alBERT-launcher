import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './ui/button'
import { 
  Search, 
  MessageSquare, 
  PinIcon, 
  Settings, 
  ArrowRight,
  Keyboard
} from 'lucide-react'

interface OnboardingStep {
  id: number
  title: string
  description: string
  targetSelector: string // CSS selector for the target element
  tooltipPosition: 'top' | 'bottom' | 'left' | 'right'
  tooltipOffset?: number // Optional offset from the target
  icon: React.ReactNode
}

const steps: OnboardingStep[] = [
  {
    id: 1,
    title: "Welcome to alBERT!",
    description: "Let's take a quick tour of the main features. Click 'Next' to begin.",
    targetSelector: '[data-highlight="search-container"]',
    tooltipPosition: 'bottom',
    icon: <Search className="w-6 h-6" />
  },
  {
    id: 2,
    title: "Smart Search",
    description: "Start by typing your question or search term here. The app will instantly show relevant results from your documents.",
    targetSelector: '[data-highlight="search-input"]',
    tooltipPosition: 'bottom',
    tooltipOffset: 10,
    icon: <Search className="w-6 h-6" />
  },
  {
    id: 3,
    title: "AI Chat",
    description: "Press Enter to start a chat with AI. It will analyze your documents and provide detailed answers with citations.",
    targetSelector: '[data-highlight="response-panel"]',
    tooltipPosition: 'right',
    tooltipOffset: 20,
    icon: <MessageSquare className="w-6 h-6" />
  },
  {
    id: 4,
    title: "Sticky Notes",
    description: "Drag any search result or chat response to create a sticky note. Sticky notes are always remembered by the AI for future searches. You can move them around and edit them freely.",
    targetSelector: '[data-highlight="search-results"]',
    tooltipPosition: 'right',
    icon: <PinIcon className="w-6 h-6" />
  },
  {
    id: 5,
    title: "Settings & Privacy",
    description: "Toggle between private (local) and public AI models, and customize your settings here.",
    targetSelector: '[data-highlight="settings-toggle"]',
    tooltipPosition: 'left',
    tooltipOffset: 10,
    icon: <Settings className="w-6 h-6" />
  },
  {
    id: 6,
    title: "Keyboard Shortcuts",
    description: "Use ↑↓ to navigate results, Enter to chat, Ctrl/Cmd+N for new note, and more!",
    targetSelector: '[data-highlight="keyboard-shortcuts"]',
    tooltipPosition: 'top',
    tooltipOffset: 10,
    icon: <Keyboard className="w-6 h-6" />
  }
]

const useHighlightEffect = (currentStep: number) => {
  useEffect(() => {
    // Remove previous highlights
    document.querySelectorAll('[data-highlight]').forEach(el => {
      el.classList.remove('highlight-active')
    })

    // Add highlight to current step
    const currentTarget = document.querySelector(steps[currentStep].targetSelector)
    if (currentTarget) {
      currentTarget.classList.add('highlight-active')
    }

    return () => {
      // Cleanup
      if (currentTarget) {
        currentTarget.classList.remove('highlight-active')
      }
    }
  }, [currentStep])
}

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps): JSX.Element {
  const [currentStep, setCurrentStep] = useState(0)
  const step = steps[currentStep]
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)

  // Use the highlight effect
  useHighlightEffect(currentStep)

  // Update positions when step changes or on window resize
  React.useEffect(() => {
    const updatePositions = (): void => {
      const targetElement = document.querySelector(step.targetSelector)
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect()
        setHighlightRect(rect)

        // Calculate tooltip position based on target and preferred position
        let x = 0
        let y = 0
        const offset = step.tooltipOffset || 0

        switch (step.tooltipPosition) {
          case 'top':
            x = rect.left + rect.width / 2
            y = rect.top - offset
            break
          case 'bottom':
            x = rect.left + rect.width / 2
            y = rect.bottom + offset
            break
          case 'left':
            x = rect.left - offset
            y = rect.top + rect.height / 2
            break
          case 'right':
            x = rect.right + offset
            y = rect.top + rect.height / 2
            break
        }

        setTooltipPosition({ x, y })
      }
    }

    updatePositions()
    window.addEventListener('resize', updatePositions)
    return () => window.removeEventListener('resize', updatePositions)
  }, [currentStep, step])

  const handleNext = (): void => {
    if (currentStep === steps.length - 1) {
      onComplete()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleSkip = (): void => {
    onComplete()
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-background/5 z-50">
        {/* Highlight overlay */}
        {highlightRect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bg-primary/10 border-2 border-primary rounded-lg"
            style={{
              top: highlightRect.top,
              left: highlightRect.left,
              width: highlightRect.width,
              height: highlightRect.height
            }}
          />
        )}

        {/* Tooltip */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="absolute bg-card border rounded-lg shadow-lg p-6 max-w-md"
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            transform: `translate(-50%, -50%) translate(0, ${
              step.tooltipPosition === 'bottom' ? '20px' : 
              step.tooltipPosition === 'top' ? '-20px' : '0'
            })`
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              {step.icon}
            </div>
            <h3 className="text-lg font-semibold">{step.title}</h3>
          </div>
          
          <p className="text-muted-foreground mb-6">
            {step.description}
          </p>

          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={handleSkip}>
              Skip Tour
            </Button>
            <Button onClick={handleNext}>
              {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>

          <div className="flex justify-center mt-4 gap-1">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full ${
                  index === currentStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
} 