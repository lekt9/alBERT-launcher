import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
  useRef,
  useReducer
} from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { trpcClient } from './util/trpc-client'
import { cn } from '@/lib/utils'
import SearchBar from '@/components/SearchBar'
import SearchResults from '@/components/SearchResults'
import ContextTabs from '@/components/ContextTabs'
const SettingsPanel = React.lazy(() => import('@/components/SettingsPanel'))
import { KeyboardShortcuts } from '@/components/navigation/KeyboardShortcuts'
import { streamText, experimental_wrapLanguageModel as wrapLanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createContextMiddleware } from './lib/context-middleware'
import { LLMSettings, ContextTab } from './types'
import type { SearchBarRef } from '@/components/SearchBar'
import { getRankedChunks, RankedChunk } from '@/lib/context-utils'
const ResponsePanel = React.lazy(() => import('@/components/ResponsePanel'))

interface SearchResult {
  text: string
  dist: {
    corpus_id: number
    score: number
    text: string
  }
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
  sources?: Source[]
}

// Add a new type for panel states
type PanelState = 'none' | 'settings' | 'response' | 'document' | 'chat'

// Add this interface near the top with other interfaces
interface Source {
  path: string
  preview?: string
  citations?: string[]
  description?: string
}

// Add this interface near the top
interface CachedSearch {
  query: string
  results: SearchResult[]
  timestamp: number
}

// Add these types near the top with other interfaces
type SearchState =
  | { status: 'idle' }
  | { status: 'searching'; query: string; shouldChat?: boolean }
  | { status: 'searched'; query: string; results: SearchResult[] }
  | { status: 'chatting'; query: string; results: SearchResult[] }
  | { status: 'error'; error: string }

// Add this reducer function before the App component
function searchReducer(
  state: SearchState,
  action: {
    type:
      | 'START_SEARCH'
      | 'SEARCH_SUCCESS'
      | 'SEARCH_ERROR'
      | 'START_CHAT'
      | 'CHAT_COMPLETE'
      | 'RESET'
    payload?: any
  }
): SearchState {
  switch (action.type) {
    case 'START_SEARCH':
      return { status: 'searching', query: action.payload }
    case 'SEARCH_SUCCESS':
      return {
        status: 'searched',
        query: action.payload.query,
        results: action.payload.results
      }
    case 'SEARCH_ERROR':
      return { status: 'error', error: action.payload }
    case 'START_CHAT':
      return {
        status: 'chatting',
        query: action.payload.query,
        results: action.payload.results
      }
    case 'CHAT_COMPLETE':
      return { status: 'idle' }
    case 'RESET':
      return { status: 'idle' }
    default:
      return state
  }
}

function App(): JSX.Element {
  // State Definitions
  const [query, setQuery] = useState<string>('')
  const [showResults, setShowResults] = useState<boolean>(false)
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isPrivate, setIsPrivate] = useState<boolean>(() => {
    const savedPrivacy = localStorage.getItem('llm-privacy')
    return savedPrivacy ? JSON.parse(savedPrivacy) : false
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

  const [contextTabs, setContextTabs] = useState<ContextTab[]>([])

  // Update the activePanel state to use the new type
  const [activePanel, setActivePanel] = useState<PanelState>('response')

  const searchBarRef = useRef<SearchBarRef>(null)

  // Add this near your other state definitions
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  // Add to state definitions
  const [rankedChunks, setRankedChunks] = useState<RankedChunk[]>([])

  // Add cache state
  const [searchCache, setSearchCache] = useState<CachedSearch[]>([])

  // Add this state to track if Enter was pressed during search
  const enterPressedDuringSearch = useRef<boolean>(false)

  // Add this helper function near other utility functions
  const getCachedResults = useCallback(
    (query: string) => {
      const cached = searchCache.find((item) => item.query === query)
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        // Cache valid for 5 minutes
        return cached.results
      }
      return null
    },
    [searchCache]
  )

  // Add effect to handle reranking
  useEffect(() => {
    const updateRankedChunks = async (): Promise<void> => {
      const documents = [
        ...contextTabs.map((tab) => ({
          content: tab.content,
          path: tab.path,
          type: 'pinned' as const
        })),
        ...searchResults.map((result) => ({
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
      if (chunk.text && chunk.text.length <= remainingLength) {
        context += `\n\nFrom ${chunk.path}${chunk.type === 'pinned' ? ' (pinned)' : ''}:\n${chunk.text}`
        remainingLength -= chunk.text.length
      }
      if (remainingLength <= 0) break
    }

    return context.trim()
  }, [rankedChunks])

  // Move askAIQuestion before debouncedSearch
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

        const contextMiddleware = createContextMiddleware({
          getContext: () => combinedSearchContext
        })

        const model = wrapLanguageModel({
          model: baseModel,
          middleware: contextMiddleware
        })

        const textStream = await streamText({
          model,
          prompt: `Use the following context to answer the question. Use markdown formatting to create a well formatted response using visual aids such as headings and images and tables from the context to answer the question as well and informative as possible.  If the context doesn't contain relevant information, say so. 

When citing sources, use markdown links in your response like this: [relevant text](path/to/source). Make sure to cite your sources inline, using markdown links as you use them. Instead of using the source name as the link text, use the words within the source that are relevant to quote it inside the [].

Context:
${combinedSearchContext}

${
  conversations.length > 0
    ? `Previous conversations:\n${conversations
        .map((conv) => `Q: ${conv.question}\nA: ${conv.answer}`)
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

        setConversations((prev) => [...prev, newConversation])

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

          setConversations((prev) =>
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
        setConversations((prev) => [
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
    [showResults, searchResults, currentSettings, combinedSearchContext, conversations]
  )

  // Add state machine
  const [searchState, dispatch] = useReducer(searchReducer, { status: 'idle' })

  // Update debouncedSearch to wait for full search before chat
  const debouncedSearch = useCallback(
    async (searchQuery: string, shouldChat = false) => {
      if (!searchQuery.trim()) {
        dispatch({ type: 'RESET' })
        setShowResults(false)
        setSearchResults([])
        setIsLoading(false)
        return false
      }

      setIsLoading(true)
      dispatch({ type: 'START_SEARCH', payload: { query: searchQuery, shouldChat } })

      // Check cache first
      const cachedResults = getCachedResults(searchQuery)
      if (cachedResults) {
        setSearchResults(cachedResults)
        setShowResults(true)
        dispatch({
          type: 'SEARCH_SUCCESS',
          payload: { query: searchQuery, results: cachedResults }
        })

        if (shouldChat) {
          // Even with cached results, perform a fresh full search before chat
          try {
            const fullResults = await trpcClient.search.full.query(searchQuery)
            if (fullResults.length > 0) {
              setSearchResults(fullResults)
              dispatch({
                type: 'START_CHAT',
                payload: { query: searchQuery, results: fullResults }
              })
              await askAIQuestion(searchQuery)
              dispatch({ type: 'CHAT_COMPLETE' })
            }
          } catch (error) {
            console.error('Full search failed:', error)
            dispatch({ type: 'SEARCH_ERROR', payload: String(error) })
          }
        }
        setIsLoading(false)
        return true
      }

      try {
        if (shouldChat) {
          // For chat, first do quick search to show results immediately
          const quickResults = await trpcClient.search.quick.query(searchQuery)
          if (quickResults.length > 0) {
            setShowResults(true)
            setSearchResults(quickResults)
            dispatch({
              type: 'SEARCH_SUCCESS',
              payload: { query: searchQuery, results: quickResults }
            })
          }

          // Then perform full search before starting chat
          const fullResults = await trpcClient.search.full.query(searchQuery)
          if (fullResults.length === 0) {
            setShowResults(false)
            dispatch({ type: 'SEARCH_ERROR', payload: 'No results found' })
          } else {
            setSearchResults(fullResults)
            setSearchCache((prev) => {
              const newCache = [
                { query: searchQuery, results: fullResults, timestamp: Date.now() },
                ...prev.filter((item) => item.query !== searchQuery)
              ].slice(0, 5)
              return newCache
            })

            dispatch({
              type: 'START_CHAT',
              payload: { query: searchQuery, results: fullResults }
            })
            await askAIQuestion(searchQuery)
            dispatch({ type: 'CHAT_COMPLETE' })
          }
        } else {
          // For regular search, just use quick search
          const quickResults = await trpcClient.search.quick.query(searchQuery)
          if (quickResults.length === 0) {
            setShowResults(false)
            dispatch({ type: 'SEARCH_ERROR', payload: 'No results found' })
          } else {
            setShowResults(true)
            setSearchResults(quickResults)
            dispatch({
              type: 'SEARCH_SUCCESS',
              payload: { query: searchQuery, results: quickResults }
            })
          }
        }
        setIsLoading(false)
        return true
      } catch (error) {
        console.error('Search failed:', error)
        setSearchResults([])
        setShowResults(false)
        dispatch({ type: 'SEARCH_ERROR', payload: String(error) })
        setIsLoading(false)
        return false
      }
    },
    [getCachedResults, askAIQuestion]
  )

  // Update handleInputChange to always use quick search
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value
      setQuery(newQuery)
      setSelectedIndex(-1)
      enterPressedDuringSearch.current = false

      if (!newQuery.trim()) {
        setShowResults(false)
        setSearchResults([])
        return
      }

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }

      searchTimeoutRef.current = setTimeout(() => {
        debouncedSearch(newQuery, false) // Always use quick search for typing
      }, 800)
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
        if (!query.trim()) return

        setIsLoading(true)
        dispatch({ type: 'START_SEARCH', payload: { query } })

        try {
          // Always perform full search first
          const fullResults = await trpcClient.search.full.query(query)
          
          if (fullResults.length === 0) {
            setShowResults(false)
            dispatch({ type: 'SEARCH_ERROR', payload: 'No results found' })
            return
          }

          // Update search results and cache
          setSearchResults(fullResults)
          setShowResults(true)
          setSearchCache((prev) => {
            const newCache = [
              { query, results: fullResults, timestamp: Date.now() },
              ...prev.filter((item) => item.query !== query)
            ].slice(0, 5)
            return newCache
          })

          // Wait for context to be updated
          await new Promise(resolve => setTimeout(resolve, 100))

          // Start chat after context is populated
          dispatch({ type: 'START_CHAT', payload: { query, results: fullResults } })
          await askAIQuestion(query)
          dispatch({ type: 'CHAT_COMPLETE' })
        } catch (error) {
          console.error('Search or chat failed:', error)
          dispatch({ type: 'SEARCH_ERROR', payload: String(error) })
        } finally {
          setIsLoading(false)
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
    [query, searchState, activePanel, contextTabs, selectedIndex, searchResults, conversations, askAIQuestion]
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

  // Add cleanup effect for cache
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setSearchCache((prev) => prev.filter((item) => Date.now() - item.timestamp < 5 * 60 * 1000))
    }, 60 * 1000) // Clean up every minute

    return () => clearInterval(cleanupInterval)
  }, [])

  // Add effect to handle state transitions
  useEffect(() => {
    switch (searchState.status) {
      case 'searched':
        // If this was a search triggered by wanting to chat, start the chat
        if (enterPressedDuringSearch.current) {
          enterPressedDuringSearch.current = false
          dispatch({
            type: 'START_CHAT',
            payload: {
              query: searchState.query,
              results: searchState.results
            }
          })
          askAIQuestion(searchState.query)
        }
        break

      case 'chatting':
        setIsLoading(true)
        break

      case 'idle':
        setIsLoading(false)
        break

      case 'error':
        setIsLoading(false)
        break
    }
  }, [searchState])

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
            <CardContent
              className={cn(
                'p-0 flex flex-col',
                // Remove any padding/spacing when no results
                showResults && searchResults.length > 0 ? 'h-[600px]' : 'h-auto'
              )}
            >
              <div
                className={cn(
                  'flex flex-col',
                  // Remove the height and any spacing when no results
                  showResults && searchResults.length > 0 ? 'h-full' : 'h-auto'
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

                {/* Results Section */}
                {showResults && (
                  <SearchResults
                    searchResults={searchResults}
                    selectedIndex={selectedIndex}
                    handleResultClick={(result) => {
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
                    askAIQuestion={askAIQuestion}
                    isLoading={isLoading}
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
