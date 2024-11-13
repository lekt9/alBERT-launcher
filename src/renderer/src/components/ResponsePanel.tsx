import React, { useRef, useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, Send, FileText, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useDrag } from 'react-dnd'
import { Input } from '@/components/ui/input'
import { trpcClient } from '../util/trpc-client'

interface ResponsePanelProps {
  conversations: AIResponse[]
  isLoading: boolean
  onNewChat: () => void
  createStickyNote: (result: SearchResult, position: { x: number; y: number }) => void
  askAIQuestion: (query: string) => Promise<void>
  dispatch: React.Dispatch<{
    type: 'START_SEARCH' | 'SEARCH_SUCCESS' | 'SEARCH_ERROR' | 'START_CHAT' | 'CHAT_COMPLETE' | 'RESET'
    payload?: any
  }>
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResult[]>>
  setShowResults: React.Dispatch<React.SetStateAction<boolean>>
  filterOutStickyNotes: (results: SearchResult[]) => SearchResult[]
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
  commit?: {
    hash: string
    message: string
    diff: string
  }
}

const handlePathClick = async (path: string, e: React.MouseEvent): Promise<void> => {
  e.preventDefault()
  e.stopPropagation()

  if (path.startsWith('http')) {
    window.dispatchEvent(new CustomEvent('open-in-webview', {
      detail: { url: path }
    }))
  } else {
    try {
      await trpcClient.document.open.mutate(path)
    } catch (error) {
      console.error('Failed to open document:', error)
    }
  }
}

const MarkdownLink = ({ href, children }: { href?: string; children: React.ReactNode }) => {
  if (!href) return <>{children}</>

  return (
    <a
      href="#"
      onClick={(e) => handlePathClick(href, e)}
      className="text-primary hover:underline hover:text-primary/80 transition-colors"
    >
      {children}
    </a>
  )
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
      <Card className="hover:bg-accent/50 transition-all duration-200 rounded-xl overflow-hidden backdrop-blur-sm bg-background/95">
        <CardContent className="p-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{response.question}</h3>
              <span className="text-xs text-muted-foreground">
                {new Date(response.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  a: MarkdownLink
                }}
              >
                {response.answer}
              </ReactMarkdown>
            </div>
            
            {response.commit && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium">Commit Changes:</h4>
                <div className="bg-muted p-2 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <code className="text-xs">{response.commit.hash.slice(0, 7)}</code>
                    <span>{response.commit.message}</span>
                  </div>
                  <div className="mt-2">
                    <ReactMarkdown className="text-sm">{response.commit.diff}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {response.sources && response.sources.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Sources:</h4>
                <ul className="text-sm space-y-1">
                  {response.sources.map((source, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      <a
                        href="#"
                        onClick={(e) => handlePathClick(source.path, e)}
                        className="text-primary hover:underline hover:text-primary/80 transition-colors"
                      >
                        {source.path}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
})

const ResponsePanel: React.FC<ResponsePanelProps> = ({
  conversations,
  isLoading,
  onNewChat,
  createStickyNote,
  askAIQuestion,
  dispatch,
  setSearchResults,
  setShowResults,
  filterOutStickyNotes
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

    setAutoScroll(true)
    dispatch({ type: 'START_SEARCH', payload: { query: followUpQuestion } })

    try {
      const quickResults = await trpcClient.search.quick.query(followUpQuestion)
      
      if (quickResults.length === 0) {
        setShowResults(false)
        dispatch({ type: 'SEARCH_ERROR', payload: 'No results found' })
        return
      }

      const filteredResults = filterOutStickyNotes(quickResults)
      setSearchResults(filteredResults)
      setShowResults(true)

      dispatch({ 
        type: 'START_CHAT', 
        payload: { 
          query: followUpQuestion, 
          results: filteredResults 
        } 
      })

      await askAIQuestion(followUpQuestion)
      dispatch({ type: 'CHAT_COMPLETE' })
    } catch (error) {
      console.error('Search or chat failed:', error)
      dispatch({ type: 'SEARCH_ERROR', payload: String(error) })
    }

    setFollowUpQuestion('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden bg-background/95 rounded-xl">
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
