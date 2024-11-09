import React, { useEffect, useRef } from 'react'
import { MessageSquare, Pin, FileText, ExternalLink } from 'lucide-react'
import { AIResponse } from '@/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Card } from '@/components/ui/card'
import { trpcClient } from '../util/trpc-client'
import { Button } from './ui/button'

interface ResponsePanelProps {
  conversations: AIResponse[]
  addAIResponseToContext: () => void
}

const ResponsePanel: React.FC<ResponsePanelProps> = ({ conversations, addAIResponseToContext }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const completedConversations = conversations.filter((conv) => conv.answer)

  if (!completedConversations.length) return null

  const handleSourceClick = async (path: string) => {
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

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [conversations])

  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-2 space-y-6">
        {completedConversations.map((conversation) => (
          <Card
            key={conversation.timestamp}
            className="group relative overflow-hidden transition-all duration-200"
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
              <button
                onClick={() => addAIResponseToContext()}
                className="p-2 hover:bg-accent rounded-full"
                title="Pin to context"
              >
                <Pin className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Content Section */}
            <div className="p-4">
              {/* Answer with enhanced markdown */}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node, ...props }) => (
                      <Button onClick={() => handleSourceClick(props.href || '')} variant="link">
                        {props.children}
                      </Button>
                    ),
                    code: ({ node, inline, className, children, ...props }) => {
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
                            {source.description && (
                              <div className="text-sm text-muted-foreground mt-1">
                                {source.description}
                              </div>
                            )}
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
        <div ref={scrollRef} />
      </div>
    </ScrollArea>
  )
}

export default ResponsePanel
