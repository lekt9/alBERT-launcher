import React, { useEffect, useRef, useState } from 'react'
import { MessageSquare, Pin, FileText, ExternalLink, Send, Plus, Copy } from 'lucide-react'
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
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent
} from '@/components/ui/accordion'

interface ResponsePanelProps {
  conversations: AIResponse[]
  addAIResponseToContext: () => void
  askAIQuestion: (question: string) => Promise<void>
  isLoading: boolean
  onDragStart: (
    e: React.DragEvent<HTMLDivElement>,
    content: { text: string; metadata: any }
  ) => void
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

  const copyToClipboard = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
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
      <ScrollArea
        ref={scrollAreaRef}
        className="flex-1 px-2"
        onScroll={handleScroll}
      >
        <div className="space-y-4 py-2">
          {completedConversations.map((conv, idx) => (
            <Card
              key={idx}
              className={cn(
                "relative group",
                "bg-gradient-to-b from-white/80 to-white/60 dark:from-slate-800/80 dark:to-slate-900/60",
                "backdrop-blur-md rounded-[1.5rem]",
                "border border-white/40 dark:border-slate-700/40",
                "shadow-[0_8px_16px_-6px_rgba(0,0,0,0.1),inset_0_2px_4px_rgba(255,255,255,0.4)]",
                "dark:shadow-[0_8px_16px_-6px_rgba(0,0,0,0.2),inset_0_2px_4px_rgba(0,0,0,0.4)]",
                "transition-all duration-300",
                "hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.15),inset_0_2px_4px_rgba(255,255,255,0.4)]",
                "dark:hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(0,0,0,0.4)]"
              )}
              draggable="true"
              onDragStart={(e) => onDragStart(e, { text: conv.answer, metadata: {} })}
              onDragEnd={onDragEnd}
            >
              <div className="absolute inset-0 bg-white/20 dark:bg-slate-900/20 blur-xl rounded-[1.5rem]" />
              <div className="relative p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 dark:bg-primary/20 rounded-full p-2">
                      <MessageSquare className="h-4 w-4 text-primary dark:text-primary" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                      {new Date(conv.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleCopy(conv.answer)}
                    >
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handlePin(conv)}
                    >
                      <Pin className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 space-y-2">
                  <div className="text-sm text-muted-foreground font-medium">
                    {conv.question}
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ node, inline, className, children, ...props }) {
                          if (inline) {
                            return <code className="bg-muted/50 rounded px-1" {...props}>{children}</code>
                          }
                          return (
                            <div className="relative group">
                              <div className="absolute inset-0 bg-muted/20 dark:bg-muted/10 blur-sm rounded-lg" />
                              <SyntaxHighlighter
                                {...props}
                                style={vscDarkPlus}
                                language="typescript"
                                PreTag="div"
                                className="relative !bg-transparent !mt-0 rounded-lg"
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            </div>
                          )
                        }
                      }}
                    >
                      {conv.answer}
                    </ReactMarkdown>
                  </div>

                  {/* Sources Accordion */}
                  {conv.sources && conv.sources.length > 0 && (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="sources" className="border-none">
                        <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:text-foreground">
                          Sources ({conv.sources.length})
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2">
                            {conv.sources.map((source, i) => (
                              <div
                                key={i}
                                className="text-sm bg-muted/30 dark:bg-muted/20 rounded-lg p-3"
                              >
                                <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
                                     onClick={() => handleSourceClick(source.path)}>
                                  {source.path.startsWith('http') ? (
                                    <Globe className="h-4 w-4" />
                                  ) : (
                                    <FileText className="h-4 w-4" />
                                  )}
                                  <span className="truncate">{source.path}</span>
                                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                </div>
                                {source.citations && (
                                  <div className="mt-2 space-y-1">
                                    {source.citations.map((citation, i) => (
                                      <div
                                        key={i}
                                        className="text-xs text-muted-foreground bg-muted/50 dark:bg-muted/30 p-2 rounded-lg"
                                      >
                                        &ldquo;{citation}&rdquo;
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Follow-up Question Input */}
      <form
        onSubmit={handleFollowUpSubmit}
        className="sticky bottom-0 p-2"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-background/40 dark:bg-background/40 blur-xl rounded-[1.5rem]" />
          <div className="relative bg-gradient-to-b from-white/80 to-white/60 dark:from-slate-800/80 dark:to-slate-900/60 backdrop-blur-md rounded-[1.5rem] border border-white/40 dark:border-slate-700/40 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)] dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] p-2">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                type="text"
                placeholder="Ask a follow-up question..."
                value={followUpQuestion}
                onChange={(e) => setFollowUpQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className={cn(
                  "flex-1",
                  "bg-transparent",
                  "border-0",
                  "focus:ring-0",
                  "placeholder:text-muted-foreground/40"
                )}
              />
              <Button 
                type="submit" 
                size="icon"
                disabled={isLoading || !followUpQuestion.trim()}
                className="bg-primary/10 hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/30"
              >
                <Send className="h-4 w-4 text-primary dark:text-primary" />
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ResponsePanel;
