import React, { useEffect, useRef, useState } from 'react'
import { MessageSquare, Pin, FileText, ExternalLink, Send, Plus } from 'lucide-react'
import { AIResponse } from '@/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Card } from '@/components/ui/card'
import { trpcClient } from '../util/trpc-client'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'

interface ResponsePanelProps {
  conversations: AIResponse[]
  addAIResponseToContext: () => void
  askAIQuestion: (question: string) => Promise<void>
  isLoading: boolean
  onDragStart: (e: React.DragEvent<HTMLDivElement>, content: { text: string; metadata: any }) => void
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  onNewChat: () => void
}

const ResponsePanel: React.FC<ResponsePanelProps> = ({ 
  conversations, 
  addAIResponseToContext, 
  askAIQuestion,
  isLoading,
  onDragStart,
  onDragEnd,
  onNewChat
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const lastMessageRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const completedConversations = conversations.filter((conv) => conv.answer)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      })
    }
  }, [conversations, autoScroll])

  // Detect manual scroll to disable auto-scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
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

  if (!completedConversations.length) return null

  const handleSourceClick = async (path: string): Promise<void> => {
    if (path.startsWith('http')) {
      window.open(path, '_blank')
    } else {
      try {
        await trpcClient.document.open.mutate(path)
      } catch (error) {
        console.error('Failed to open document:', error)
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h2 className="text-sm font-medium">Chat History</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewChat}
          className="hover:bg-accent rounded-full"
          title="New Chat"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea 
        ref={scrollAreaRef}
        className="flex-1"
        onScroll={handleScroll}
        style={{
          maskImage: 'linear-gradient(to bottom, transparent, black 10px, black calc(100% - 10px), transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10px, black calc(100% - 10px), transparent)'
        }}
      >
        <div className="px-4 py-2 space-y-6">
          {completedConversations.map((conversation, index) => (
            <Card
              key={conversation.timestamp}
              className={cn(
                "group relative overflow-hidden transition-all duration-200",
                index === completedConversations.length - 1 && "mb-4"
              )}
              ref={index === completedConversations.length - 1 ? lastMessageRef : undefined}
              draggable="true"
              onDragStart={(e) => {
                e.stopPropagation()
                onDragStart(e, {
                  text: conversation.answer,
                  metadata: {
                    path: `ai-response-${conversation.timestamp}`,
                    title: conversation.question,
                    created_at: conversation.timestamp / 1000,
                    modified_at: conversation.timestamp / 1000,
                    filetype: 'ai-response',
                    languages: ['en'],
                    links: conversation.sources?.map(s => s.path) || [],
                    owner: null,
                    seen_at: Date.now() / 1000,
                    sourceType: 'ai-response',
                    sources: conversation.sources
                  }
                })
              }}
              onDragEnd={(e) => {
                e.stopPropagation()
                onDragEnd(e)
              }}
            >
              {/* Header Section */}
              <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm line-clamp-1">{conversation.question}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(conversation.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    Drag to create note
                  </span>
                  <button
                    onClick={addAIResponseToContext}
                    className="p-2 hover:bg-accent rounded-full"
                    title="Pin to context"
                  >
                    <Pin className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Content Section */}
              <div className="p-4">
                {/* Answer with enhanced markdown */}
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ ...props }) => (
                        <Button onClick={() => handleSourceClick(props.href || '')} variant="link">
                          {props.children}
                        </Button>
                      ),
                      code: ({ inline, className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || '')
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        )
                      },
                      table: ({ children }) => (
                        <div className="overflow-x-auto">
                          <table className="border-collapse border border-border">{children}</table>
                        </div>
                      ),
                      th: ({ children }) => (
                        <th className="border border-border bg-muted p-2 text-left">{children}</th>
                      ),
                      td: ({ children }) => <td className="border border-border p-2">{children}</td>
                    }}
                  >
                    {conversation.answer}
                  </ReactMarkdown>
                </div>

                {/* Sources Section */}
                {conversation.sources && conversation.sources.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="text-sm font-medium mb-2">Sources</div>
                    <div className="grid gap-2">
                      {conversation.sources.map((source, index) => (
                        <Card
                          key={index}
                          className="p-3 hover:bg-accent/50 cursor-pointer transition-colors"
                          onClick={() => handleSourceClick(source.path)}
                        >
                          <div className="flex items-start gap-2">
                            {source.path.startsWith('http') ? (
                              <ExternalLink className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{source.path}</div>
                              {source.citations && source.citations.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {source.citations.map((citation, i) => (
                                    <div
                                      key={i}
                                      className="text-xs text-muted-foreground bg-muted/50 p-2 rounded"
                                    >
                                      &ldquo;{citation}&rdquo;
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Follow-up Question Input - Now outside ScrollArea */}
      <form 
        onSubmit={handleFollowUpSubmit} 
        className="sticky bottom-0 bg-background/95 backdrop-blur-sm p-4 border-t shadow-lg"
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
    </div>
  )
}

export default ResponsePanel
