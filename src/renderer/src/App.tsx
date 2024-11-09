import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { trpcClient } from './util/trpc-client'
import { splitContent, cn, calculateStandardDeviation, highlightMatches } from '@/lib/utils'
import SearchBar from '@/components/SearchBar'
import AIResponseCard from '@/components/AIResponseCard'
import SearchResults from '@/components/SearchResults'
import ContextTabs from '@/components/ContextTabs'
const SettingsPanel = React.lazy(() => import('@/components/SettingsPanel'))
const DocumentViewer = React.lazy(() => import('@/components/DocumentViewer'))
import { KeyboardShortcuts } from '@/components/navigation/KeyboardShortcuts'
import {
  streamText,
  experimental_wrapLanguageModel as wrapLanguageModel
} from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createContextMiddleware } from './lib/context-middleware'
import { LLMSettings, ContextTab } from './types'
import type { SearchBarRef } from '@/components/SearchBar'
import { FileText, Globe } from 'lucide-react'
import { getRankedChunks, RankedChunk } from '@/lib/context-utils'
import { Button } from '@/components/ui/button'
const ResponsePanel = React.lazy(() => import('@/components/ResponsePanel'))

interface SearchResult {
  text: string
  dist: number
  metadata: {
    path: string
    created_at: number
    modified_at: number
    filetype: string
    languages: string[]
    links: string[]
    owner: string | null
    seen_at: number
    sourceType?: 'document' | 'web'
  }
}

interface AIResponse {
  question: string
  answer: string
  timestamp: number
  sources?: string[]
}

// Add custom Document interface at the top with other interfaces
interface CustomDocument {
  path: string
  content: string
  metadata?: {
    type: string
    lastModified: number
    matchScore?: number
  }
}

// Add a new type for panel states
type PanelState = 'none' | 'settings' | 'response' | 'document';

function App(): JSX.Element {
  // State Definitions
  const [query, setQuery] = useState<string>('')
  const [showResults, setShowResults] = useState<boolean>(false)
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isPrivate, setIsPrivate] = useState<boolean>(() => {
    const savedPrivacy = localStorage.getItem('llm-privacy')
    return savedPrivacy ? JSON.parse(savedPrivacy) : true
  })

  const [privateSettings, setPrivateSettings] = useState<LLMSettings>(() => {
    const saved = localStorage.getItem('llm-settings-private')
    return saved
      ? JSON.parse(saved)
      : {
          baseUrl: 'http://localhost:11434/v1',
          apiKey: '',
          model: 'llama3.2:1b',
          modelType: 'ollama'
        }
  })

  const [publicSettings, setPublicSettings] = useState<LLMSettings>(() => {
    const saved = localStorage.getItem('llm-settings-public')
    return saved
      ? JSON.parse(saved)
      : {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: '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',
          model: 'openai/gpt-4o-mini',
          modelType: 'openai'
        }
  })

  const currentSettings = useMemo(
    () => (isPrivate ? privateSettings : publicSettings),
    [isPrivate, privateSettings, publicSettings]
  )

  const [conversations, setConversations] = useState<AIResponse[]>([])
  const [contextDocuments, setContextDocuments] = useState<CustomDocument[]>([])
  const [hoveredCardPath, setHoveredCardPath] = useState<string | null>(null)

  const [contextTabs, setContextTabs] = useState<ContextTab[]>([])

  // Update the activePanel state to use the new type
  const [activePanel, setActivePanel] = useState<PanelState>('response')

  const searchBarRef = useRef<SearchBarRef>(null)

  // Add this near your other state definitions
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  // Add to state definitions
  const [rankedChunks, setRankedChunks] = useState<RankedChunk[]>([])

  // Add effect to handle reranking
  useEffect(() => {
    const updateRankedChunks = async () => {
      const documents = [
        ...contextTabs.map(tab => ({
          content: tab.content,
          path: tab.path,
          type: 'pinned' as const
        })),
        ...searchResults.map(result => ({
          content: result.text,
          path: result.metadata.path,
          type: result.metadata.sourceType === 'web' ? 'web' : 'document'
        }))
      ]

      const chunks = await getRankedChunks({
        query,
        documents,
        chunkSize: 500,
        minScore: 0.1
      })

      setRankedChunks(chunks)
    }

    if (query && (searchResults.length > 0 || contextTabs.length > 0)) {
      updateRankedChunks()
    } else {
      setRankedChunks([])
    }
  }, [query, searchResults, contextTabs])

  // Update combinedSearchContext to use rankedChunks
  const combinedSearchContext = useMemo(() => {
    const MAX_CONTEXT_LENGTH = 50000
    let context = ''
    let remainingLength = MAX_CONTEXT_LENGTH

    // Build context from ranked chunks
    for (const chunk of rankedChunks) {
      if (chunk.text.length <= remainingLength) {
        context += `\n\nFrom ${chunk.path}${chunk.type === 'pinned' ? ' (pinned)' : ''}:\n${chunk.text}`
        remainingLength -= chunk.text.length
      }
      if (remainingLength <= 0) break
    }

    return context.trim()
  }, [rankedChunks])

  // Debounced Search Function
  const debouncedSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setShowResults(false)
        setSearchResults([])
        return false
      }
      setIsLoading(true)
      try {
        const fileResults = await trpcClient.search.all.query(searchQuery)
        if (fileResults.length === 0) {
          setShowResults(false) // Collapse when no results
        } else {
          setShowResults(true)
        }
        setSearchResults(fileResults)
        return fileResults.length > 0
      } catch (error) {
        console.error('Search failed:', error)
        setSearchResults([])
        setShowResults(false)
        return false
      } finally {
        setIsLoading(false)
      }
    },
    [currentSettings]
  )

  // Update the handleInputChange function
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value
      setQuery(newQuery)
      setSelectedIndex(-1)

      if (!newQuery.trim()) {
        setShowResults(false)
        setSearchResults([])
      }

      // Clear any existing timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }

      // Set new timeout for search
      searchTimeoutRef.current = setTimeout(() => {
        debouncedSearch(newQuery)
      }, 500)
    },
    [debouncedSearch]
  )

  // Add cleanup effect
  useEffect(() => {
    return (): void => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  // Copy to Clipboard Function
  const copyToClipboard = useCallback(
    async (text: string, hideAfter = true, includeContext = false) => {
      try {
        let contentToCopy = text

        if (includeContext) {
          if (contextTabs.length > 0) {
            contentToCopy = `Query: ${query}\n\nContext:\n${combinedSearchContext}`
          } else if (showResults && selectedIndex >= 0) {
            const selectedResult = searchResults[selectedIndex]
            contentToCopy = `Selected content from ${selectedResult.metadata.path}:\n${selectedResult.text}`
          } else {
            contentToCopy = `Query: ${query}\n\nResults:\n${searchResults
              .map((result) => `${result.metadata.path}:\n${result.text}`)
              .join('\n\n')}`
          }
        }

        await navigator.clipboard.writeText(contentToCopy)
        if (hideAfter) {
          trpcClient.window.hide.mutate()
        }
      } catch (error) {
        console.error('Failed to copy:', error)
      }
    },
    [query, contextTabs, showResults, selectedIndex, searchResults]
  )

  // Fetch Document Content
  const fetchDocumentContent = useCallback(
    async (filePath: string) => {
      if (!filePath) {
        console.error('No file path provided')
        return
      }

      try {
        const content = await trpcClient.document.fetch.query(filePath)
        if (content) {
          // Update contextTabs
          setContextTabs((prev) => {
            const exists = prev.some((tab) => tab.path === filePath)
            if (!exists) {
              return [
                ...prev,
                {
                  path: filePath,
                  content,
                  isExpanded: false,
                  metadata: {
                    type: filePath.startsWith('http') ? 'web' : 'file',
                    lastModified: Date.now()
                  }
                }
              ]
            }
            return prev
          })

          setShowResults(true)
        }
      } catch (error) {
        console.error('Error fetching document:', error)
      }
    },
    [query]
  )

  // Open Folder Function
  const openAlBERTFolder = useCallback(async () => {
    try {
      await trpcClient.folder.openAlBERT.mutate()
    } catch (error) {
      console.error('Failed to open alBERT folder:', error)
    }
  }, [])

  // Add AI Response to Context
  const addAIResponseToContext = useCallback(() => {
    if (conversations.length > 0) {
      const lastConversation = conversations[conversations.length - 1]
      const aiResponseContent = `Q: ${lastConversation.question}\n\nA: ${lastConversation.answer}`
      setContextTabs((prev) => {
        const exists = prev.some((tab) => tab.content === aiResponseContent)
        if (!exists) {
          return [
            ...prev,
            {
              path: `AI Response (${new Date(lastConversation.timestamp).toLocaleTimeString()})`,
              content: aiResponseContent,
              isExpanded: false,
              metadata: {
                type: 'ai_response',
                lastModified: lastConversation.timestamp,
                matchScore: 1
              }
            }
          ]
        }
        return prev
      })
    }
  }, [conversations])

  // Ask AI Question
  const askAIQuestion = useCallback(
    async (prompt: string) => {
      if (!showResults || searchResults.length === 0) {
        console.warn('Search results are not ready yet.')
        return
      }

      setIsLoading(true)
      try {
        const provider =
          currentSettings.modelType === 'openai'
            ? createOpenAI({
                apiKey: currentSettings.apiKey,
                baseUrl: currentSettings.baseUrl
              })
            : createOpenAI({
                apiKey: currentSettings.apiKey,
                baseUrl: 'http://localhost:11434/v1'
              })

        const baseModel = provider(currentSettings.model)

        // Get relevant chunks for sources
        const relevantChunks = rankedChunks
          .filter(chunk => chunk.score > 0.5)
          .map(chunk => ({
            path: chunk.path,
            text: chunk.text,
            score: chunk.score
          }))

        const contextMiddleware = createContextMiddleware({
          getContext: () => combinedSearchContext
        })

        const model = wrapLanguageModel({
          model: baseModel,
          middleware: contextMiddleware
        })

        const textStream = await streamText({
          model,
          prompt: `Use the following context to answer the question. If the context doesn't contain relevant information, say so. 

When citing sources, use markdown links in your response like this: [relevant text](path/to/source). Make sure to cite your sources inline as you use them.

At the end of your response, include a "Sources:" section with a numbered list of all sources used and brief descriptions of how they were used.

Context:
${combinedSearchContext}

${
  conversations.length > 0
    ? `Previous conversations:\n${conversations
        .map(
          conv => `Q: ${conv.question}\nA: ${conv.answer}`
        )
        .join('\n\n')}\n\n`
    : ''
}Question: ${prompt}

Answer with inline citations:`
        })

        const newConversation: AIResponse = {
          question: prompt,
          answer: '',
          timestamp: Date.now(),
          sources: []
        }

        setConversations(prev => [...prev, newConversation])

        let fullResponse = ''
        let sourcesSection = ''

        for await (const textPart of textStream.textStream) {
          fullResponse += textPart
          
          // Extract markdown links from the response
          const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
          const links = Array.from(fullResponse.matchAll(markdownLinkRegex))
          
          // Parse sources section if present
          const sourcesSplit = fullResponse.split('\nSources:')
          const mainResponse = sourcesSplit[0].trim()
          sourcesSection = sourcesSplit[1]?.trim() || ''

          // Combine inline citations with sources section
          const sources = new Map<string, Source>()

          // Add inline citations
          links.forEach(([, text, path]) => {
            if (!sources.has(path)) {
              sources.set(path, {
                path,
                preview: text,
                citations: [text]
              })
            } else {
              const existing = sources.get(path)!
              if (!existing.citations?.includes(text)) {
                existing.citations = [...(existing.citations || []), text]
              }
            }
          })

          // Add descriptions from sources section
          if (sourcesSection) {
            const sourceLines = sourcesSection.split('\n')
            sourceLines.forEach(line => {
              const match = line.match(/\d+\.\s+([^-]+)-(.+)/)
              if (match) {
                const [, path, description] = match
                const cleanPath = path.trim()
                if (sources.has(cleanPath)) {
                  sources.get(cleanPath)!.description = description.trim()
                } else {
                  sources.set(cleanPath, {
                    path: cleanPath,
                    description: description.trim()
                  })
                }
              }
            })
          }

          setConversations(prev => 
            prev.map((conv, i) => 
              i === prev.length - 1 
                ? { 
                    ...conv, 
                    answer: mainResponse,
                    sources: Array.from(sources.values())
                  }
                : conv
            )
          )
        }
      } catch (error) {
        console.error('AI answer failed:', error)
        setConversations(prev => [
          ...prev,
          {
            question: prompt,
            answer: 'Sorry, I encountered an error while generating the response.',
            timestamp: Date.now(),
            sources: []
          }
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [
      showResults,
      searchResults,
      contextTabs,
      conversations,
      currentSettings,
      combinedSearchContext,
      rankedChunks
    ]
  )

  // Keyboard Event Handler
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent): Promise<void> => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (activePanel !== 'none') {
          setActivePanel('none')
        } else {
          trpcClient.window.hide.mutate()
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (contextTabs.length > 0) {
          // Unpin the most recently pinned document
          setContextTabs((prev) => {
            const newTabs = [...prev]
            newTabs.pop()
            return newTabs
          })
        } else {
          // Toggle between settings and response panels
          setActivePanel((prev) => {
            if (prev === 'settings') return 'response'
            if (prev === 'response') return 'settings'
            return 'settings'
          })
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        // First check if settings panel is open
        if (activePanel === 'settings') {
          setActivePanel('response')
          return
        }

        // Only proceed with pinning if settings panel is not open
        if (selectedIndex !== -1 && searchResults[selectedIndex]) {
          // Pin the selected document to context
          const result = searchResults[selectedIndex]
          if (!contextTabs.some((tab) => tab.path === result.metadata.path)) {
            fetchDocumentContent(result.metadata.path)
          }
        } else if (selectedIndex === -1 && conversations.length > 0) {
          // Pin AI response to context
          const aiResponseContent = `Q: ${conversations[conversations.length - 1].question}\n\nA: ${conversations[conversations.length - 1].answer}`
          setContextTabs((prev) => {
            const exists = prev.some((tab) => tab.content === aiResponseContent)
            if (!exists) {
              return [
                ...prev,
                {
                  path: `AI Response (${new Date(conversations[conversations.length - 1].timestamp).toLocaleTimeString()})`,
                  content: aiResponseContent,
                  isExpanded: false,
                  metadata: {
                    type: 'ai_response',
                    lastModified: conversations[conversations.length - 1].timestamp,
                    matchScore: 1
                  }
                }
              ]
            }
            return prev
          })
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (query.trim()) {
          if (!showResults || searchResults.length === 0) {
            // Only search first if we don't have results yet
            const searchSuccess = await debouncedSearch(query)
            if (searchSuccess) {
              askAIQuestion(query)
            }
          } else {
            // If we already have search results, just ask the question
            askAIQuestion(query)
          }
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (conversations || showResults) {
          const maxIndex = searchResults.length - 1
          setSelectedIndex((prev) => (prev === -1 ? 0 : Math.min(prev + 1, maxIndex)))
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (conversations || showResults) {
          setSelectedIndex((prev) => {
            if (prev === 0) return -1
            return prev > 0 ? prev - 1 : prev
          })
        }
      } else if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (activePanel === 'document') {
          copyToClipboard('', true, true)
        } else if (showResults && searchResults.length > 0) {
          if (selectedIndex >= 0) {
            copyToClipboard(searchResults[selectedIndex].text, true, true)
          } else {
            copyToClipboard('', true, true)
          }
        }
      } else if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        openAlBERTFolder()
      }
    },
    [
      selectedIndex,
      searchResults,
      contextTabs,
      conversations,
      fetchDocumentContent,
      activePanel,
      query,
      showResults,
      debouncedSearch,
      askAIQuestion
    ]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return (): void => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Scroll into view for selected search result
  useEffect(() => {
    const selectedCard = document.querySelector(`.card-item:nth-child(${selectedIndex + 1})`)
    selectedCard?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIndex])

  // Focus Management
  useEffect(() => {
    // Logic to manage focus
  }, [activePanel, showResults])

  useEffect(() => {
    const handleWindowShow = (): void => {
      searchBarRef.current?.focus()
    }

    window.addEventListener('focus', handleWindowShow)
    return (): void => window.removeEventListener('focus', handleWindowShow)
  }, [])

  return (
    <div
      className="h-screen w-screen flex items-center justify-center bg-background/0 backdrop-blur-sm"
      onClick={() => {
        // Logic to handle background click
      }}
    >
      <div className="flex flex-col">
        <div className="flex gap-4 transition-all duration-200">
          {/* Settings Panel */}
          {activePanel === 'settings' && (
            <Suspense fallback={<div>Loading Settings...</div>}>
              <Card
                className="bg-background/95 shadow-2xl flex flex-col transition-all duration-200"
                style={{ width: 600 }}
              >
                <CardContent className="p-4 flex flex-col h-[600px]">
                  <SettingsPanel
                    isPrivate={isPrivate}
                    setIsPrivate={setIsPrivate}
                    privateSettings={privateSettings}
                    publicSettings={publicSettings}
                    setPrivateSettings={setPrivateSettings}
                    setPublicSettings={setPublicSettings}
                    setActivePanel={setActivePanel}
                  />
                </CardContent>
              </Card>
            </Suspense>
          )}

          {/* Main Search Card */}
          <Card
            className="bg-background/95 shadow-2xl flex flex-col transition-all duration-200"
            style={{ width: 600 }}
          >
            <CardContent className="p-0 flex-1 flex flex-col h-[600px]">
              <div className="flex flex-col h-full">
                {/* Container that centers search when no content */}
                <div
                  className={cn(
                    'flex flex-col transition-all duration-200',
                    showResults && searchResults.length > 0
                      ? 'flex-none'
                      : 'flex-1 justify-center'
                  )}
                >
                  {/* Search Bar Section */}
                  <SearchBar
                    ref={searchBarRef}
                    query={query}
                    setQuery={setQuery}
                    isLoading={isLoading}
                    isPrivate={isPrivate}
                    handlePrivacyToggle={setIsPrivate}
                    handleInputChange={handleInputChange}
                  />
                </div>

                {/* Results Section */}
                {showResults && searchResults.length > 0 && (
                  <SearchResults
                    searchResults={searchResults}
                    selectedIndex={selectedIndex}
                    handleResultClick={(result) => {
                      // Just fetch the document content and add to context tabs
                      if (!contextTabs.some((tab) => tab.path === result.metadata.path)) {
                        fetchDocumentContent(result.metadata.path)
                      }
                    }}
                    rankedChunks={rankedChunks}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* AI Response Panel */}
          {conversations.length > 0 && activePanel === 'response' && (
            <Suspense fallback={<div>Loading Response Panel...</div>}>
              <Card
                className="bg-background/95 shadow-2xl flex flex-col transition-all duration-200"
                style={{ width: 600 }}
              >
                <CardContent className="p-4 flex flex-col h-[600px]">
                  <ResponsePanel
                    conversations={conversations}
                    addAIResponseToContext={() => {
                      if (conversations.length > 0) {
                        const lastConversation = conversations[conversations.length - 1]
                        const aiResponseContent = `Q: ${lastConversation.question}\n\nA: ${lastConversation.answer}`
                        setContextTabs((prev) => {
                          const exists = prev.some((tab) => tab.content === aiResponseContent)
                          if (!exists) {
                            return [
                              ...prev,
                              {
                                path: `AI Response (${new Date(lastConversation.timestamp).toLocaleTimeString()})`,
                                content: aiResponseContent,
                                isExpanded: false,
                                metadata: {
                                  type: 'ai_response',
                                  lastModified: lastConversation.timestamp,
                                  matchScore: 1
                                }
                              }
                            ]
                          }
                          return prev
                        })
                      }
                    }}
                  />
                </CardContent>
              </Card>
            </Suspense>
          )}

          {/* Context Tabs */}
          <ContextTabs contextTabs={contextTabs} setContextTabs={setContextTabs} />
        </div>

        <KeyboardShortcuts showDocument={activePanel === 'document'} activePanel={activePanel} />
      </div>
    </div>
  )
}

export default App
