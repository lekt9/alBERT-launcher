import React, { useRef, useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useDrag } from 'react-dnd'
import { Input } from '@/components/ui/input'

interface ResponsePanelProps {
  conversations: AIResponse[]
  addAIResponseToContext: () => void
  askAIQuestion: (originalQuery: string) => Promise<void>
  isLoading: boolean
  onNewChat: () => void
  onDragStart?: () => void
  onDragEnd?: () => void
  createStickyNote?: (
    result: { text: string; metadata: any },
    position: { x: number; y: number }
  ) => void
}

interface AIResponse {
  question: string
  answer: string
  timestamp: number
  sources?: Array<{
    path: string
    preview?: string
    citations?: string[]
  }>
}

const ResponseItem = React.forwardRef<
  HTMLDivElement,
  {
    response: AIResponse
    createStickyNote?: ResponsePanelProps['createStickyNote']
  }
>(({ response, createStickyNote }, ref) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'searchResult',
    item: () => ({
      type: 'searchResult',
      result: {
        text: `# ${response.question}\n\n${response.answer}`,
        metadata: {
          path: `ai-response-${response.timestamp}.md`,
          created_at: response.timestamp / 1000,
          modified_at: response.timestamp / 1000,
          filetype: 'markdown',
          languages: ['en'],
          links: [],
          owner: null,
          seen_at: response.timestamp / 1000,
          sourceType: 'document',
          title: response.question
        }
      }
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    }),
    end: (item, monitor) => {
      const dropResult = monitor.getDropResult<{ x: number; y: number }>()
      if (dropResult && createStickyNote) {
        createStickyNote(item.result, {
          x: dropResult.x,
          y: dropResult.y
        })
      }
    }
  })

  const setRefs = (element: HTMLDivElement) => {
    drag(element)
    if (typeof ref === 'function') {
      ref(element)
    } else if (ref) {
      ref.current = element
    }
  }

  return (
    <div ref={setRefs} style={{ opacity: isDragging ? 0.5 : 1 }} className="space-y-4 p-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{response.question}</h3>
          <span className="text-xs text-muted-foreground">
            {new Date(response.timestamp).toLocaleString()}
          </span>
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{response.answer}</ReactMarkdown>
        </div>
        {response.sources && response.sources.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">Sources:</h4>
            <ul className="text-sm space-y-1">
              {response.sources.map((source, index) => (
                <li key={index}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      // Handle source click
                    }}
                    className="text-blue-500 hover:underline"
                  >
                    {source.path}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
})

const ResponsePanel: React.FC<ResponsePanelProps> = ({
  conversations,
  isLoading,
  onNewChat,
  createStickyNote,
  askAIQuestion
}) => {
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const lastMessageRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [conversations, autoScroll])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollContainer = e.currentTarget
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50
    setAutoScroll(isAtBottom)
  }

  const handleFollowUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!followUpQuestion.trim() || isLoading) return

    setAutoScroll(true) // Re-enable auto-scroll when sending new message
    await askAIQuestion(followUpQuestion)
    setFollowUpQuestion('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden bg-background/95">
      <CardContent className="flex-1 p-0 flex flex-col h-full">
        <div className="flex-none flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">AI Responses</h2>
          <Button variant="ghost" size="icon" onClick={onNewChat} title="New Chat">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea 
          className="flex-1 min-h-0"
          onScroll={handleScroll}
          ref={scrollAreaRef}
          style={{
            maskImage: 'linear-gradient(to bottom, transparent, black 10px, black calc(100% - 10px), transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10px, black calc(100% - 10px), transparent)'
          }}
        >
          <div className="px-4 py-2">
            {conversations.map((response, index) => (
              <ResponseItem 
                key={index} 
                response={response} 
                createStickyNote={createStickyNote}
                ref={index === conversations.length - 1 ? lastMessageRef : undefined}
              />
            ))}
            {isLoading && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>
        </ScrollArea>
        
        <form
          onSubmit={handleFollowUpSubmit}
          className="flex-none p-4 border-t bg-background/95 backdrop-blur-sm"
        >
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Ask a follow-up question..."
              value={followUpQuestion}
              onChange={(e) => setFollowUpQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={isLoading || !followUpQuestion.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default ResponsePanel
