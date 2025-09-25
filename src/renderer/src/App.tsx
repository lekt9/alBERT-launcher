import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
  useRef,
  useReducer
} from 'react'
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card'
import { trpcClient } from './util/trpc-client'
import { cn, debounce } from '@/lib/utils'
import SearchBar from '@/components/SearchBar'
import SearchResults from '@/components/SearchResults'
const SettingsPanel = React.lazy(() => import('@/components/SettingsPanel'))
import { KeyboardShortcuts } from '@/components/navigation/KeyboardShortcuts'
import { generateText, streamText, experimental_wrapLanguageModel as wrapLanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createContextMiddleware } from './lib/context-middleware'
import {
  LLMSettings,
  ContextTab,
  SmitheryMCPServer,
  SmitheryContextResult,
  Source,
  AIResponse
} from './types'
import type { SearchBarRef } from '@/components/SearchBar'
import type {
  CachedSearch,
  PanelState,
  SearchResult,
  SearchState,
  StickyNote
} from './types/search'
const ResponsePanel = React.lazy(() => import('@/components/ResponsePanel'))
import SearchBadges, { SearchStep } from '@/components/SearchBadges'
import { v4 as uuidv4 } from 'uuid'
import { AnimatePresence } from 'framer-motion'
import { Globe, FileText, X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  markdownShortcutPlugin,
  linkPlugin,
  tablePlugin,
  thematicBreakPlugin,
  frontmatterPlugin,
  codeBlockPlugin,
  imagePlugin
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { generateObject } from 'ai'
import { z } from 'zod'
import { DndProvider, useDrag, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { usePersistentState } from './hooks/usePersistentState'
import { createDefaultPrivateSettings, createDefaultPublicSettings } from './lib/default-settings'
import { createSmitheryServerFromInput } from './lib/smithery'
import { useSmitheryContext } from './hooks/useSmitheryContext'
import { useContextScoring } from './hooks/useContextScoring'
import { buildCombinedContext } from './lib/context-builder'

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

// Add this utility function near the top of the file
const truncateText = (text: string, maxLength: number = 150): string => {
  if (!text) return ''
  if (text.length <= maxLength) return text

  // Find the last space before maxLength
  const lastSpace = text.lastIndexOf(' ', maxLength)
  if (lastSpace === -1) return text.slice(0, maxLength) + '...'

  return text.slice(0, lastSpace) + '...'
}

// Add this component before the App component
const DropArea: React.FC<{
  children: React.ReactNode
  onDrop: (item: any, position: { x: number; y: number }) => void
  className?: string
}> = ({ children, onDrop, className }) => {
  const [, drop] = useDrop({
    accept: 'searchResult',
    drop: (item: any, monitor) => {
      const offset = monitor.getClientOffset()
      if (offset) {
        return { x: offset.x, y: offset.y }
      }
    }
  })

  return (
    <div ref={drop} className={cn('relative min-h-screen w-full overflow-hidden', className)}>
      {children}
    </div>
  )
}

const PANEL_BASE_CLASS =
  'relative flex w-full flex-col rounded-2xl border border-slate-800 bg-slate-950/90 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.9)] transition-colors duration-200 hover:border-slate-700 focus-within:border-slate-600'

function App(): JSX.Element {
  // State Definitions
  const [query, setQuery] = useState<string>('')
  const [showResults, setShowResults] = useState<boolean>(false)
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isPrivate, setIsPrivate] = usePersistentState<boolean>('llm-privacy', false)
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>([])

  const [useAgent, setUseAgent] = usePersistentState<boolean>('use-agent', true)

  const [privateSettings, setPrivateSettings] = usePersistentState<LLMSettings>(
    'llm-settings-private',
    createDefaultPrivateSettings
  )

  const [publicSettings, setPublicSettings] = usePersistentState<LLMSettings>(
    'llm-settings-public',
    createDefaultPublicSettings
  )

  const [smitheryApiKey, setSmitheryApiKey] = usePersistentState<string>('smithery-api-key', '')
  const [smitheryServers, setSmitheryServers] = usePersistentState<SmitheryMCPServer[]>(
    'smithery-servers',
    () => []
  )
  const [smitheryManualError, setSmitheryManualError] = useState<string | null>(null)

  const currentSettings = useMemo(
    () => (isPrivate ? privateSettings : publicSettings),
    [isPrivate, privateSettings, publicSettings]
  )

  const activeSmitheryServers = useMemo(
    () => smitheryServers.filter((server) => server.enabled !== false),
    [smitheryServers]
  )

  const {
    results: smitheryResults,
    isLoading: isSmitheryLoading,
    error: smitheryContextError,
    refresh: refreshSmitheryContext
  } = useSmitheryContext({
    query,
    servers: smitheryServers,
    apiKey: smitheryApiKey || undefined,
    enabled: activeSmitheryServers.length > 0
  })

  const provider = useMemo(() => {
    if (currentSettings.modelType === 'openai') {
      return createOpenAI({
        apiKey: currentSettings.apiKey,
        baseUrl: currentSettings.baseUrl
      })
    }

    return createOpenAI({
      apiKey: currentSettings.apiKey,
      baseUrl: currentSettings.baseUrl || 'http://localhost:11434/v1'
    })
  }, [currentSettings])

  const [conversations, setConversations] = useState<AIResponse[]>([])

  const combinedSearchContext = useMemo(
    () =>
      buildCombinedContext({
        stickyNotes,
        smitheryResults,
        searchResults
      }),
    [searchResults, smitheryResults, stickyNotes]
  )

  // Update the activePanel state to use the new type
  const [activePanel, setActivePanel] = useState<PanelState>('response')
  const toggleSettingsPanel = useCallback(() => {
    setActivePanel((prev) => (prev === 'settings' ? 'response' : 'settings'))
  }, [])

  const searchBarRef = useRef<SearchBarRef>(null)

  // Add this near your other state definitions
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

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

  const { rankedChunks, documentScores } = useContextScoring({
    query,
    searchResults,
    smitheryResults
  })

  // Update generateChatResponse to include full agent logic
  const generateChatResponse = useCallback(
    async (
      model: any,
      originalQuery: string,
      subQueryContext: string = ''
    ): Promise<{ textStream: AsyncIterable<string> }> => {
      // Get last 4 conversation messages
      const recentConversations = conversations
        .slice(-8)
        .map((conv) => [
          { role: 'user' as const, content: conv.question.slice(0, 2000) },
          { role: 'assistant' as const, content: conv.answer.slice(0, 2000) }
        ])
        .flat()

      // If agent is disabled, use direct search and response
      if (!useAgent) {
        return streamText({
          model,
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant that provides well-formatted responses using markdown. When citing sources, use markdown links like [quote](link to file or url). Do not leave placeholder comments or images inside the response.
                  
Current Context:
${combinedSearchContext}`
            },
            ...recentConversations.filter((conv) => conv.role !== 'system'),
            {
              role: 'user',
              content: originalQuery
            }
          ]
        })
      }

      // For agent-enabled mode, use full context and reasoning
      return streamText({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that provides well-formatted responses using markdown, including visual aids like headings, images and tables when relevant. When citing sources, use markdown links like [relevant text](link to file or url). Provide all links that would be useful references to the answer in line. Use the words within the source as link text rather than the source name.
                  
Additional Context (sorted by relevance):
${combinedSearchContext}`
          },
          ...recentConversations.filter((conv) => conv.role !== 'system'),
          {
            role: 'user',
            content: `Use the following context and your knowledge to answer the question. Use markdown formatting to create a well formatted response using visual aids such as headings and images and tables from the context to answer the question as well and informative as possible. 

${subQueryContext ? `\nReasoning steps:\n${subQueryContext}` : ''}

Question: ${originalQuery}

Answer with inline url links as citations and take account todays date: ${new Date().toLocaleDateString()}`
          }
        ]
      })
    },
    [combinedSearchContext, conversations, useAgent]
  )

  // Add to your state definitions
  const [searchSteps, setSearchSteps] = useState<SearchStep[]>([])

  // Update breakDownQuery with full agent logic
  const breakDownQuery = async (
    query: string,
    existingContext: string = ''
  ): Promise<{ queries: string[]; results: SearchResult[] }> => {
    console.log('Starting breakDownQuery with:', {
      query,
      existingContextLength: existingContext.length,
      searchResultsCount: searchResults.length
    })

    const contextMiddleware = createContextMiddleware({
      getContext: () => combinedSearchContext
    })

    // Get last 4 conversation messages
    const recentConversations = conversations
      .slice(-8)
      .map((conv) => [
        { role: 'user' as const, content: conv.question.slice(0, 2000) },
        { role: 'assistant' as const, content: conv.answer.slice(0, 2000) }
      ])
      .flat()

    const model = wrapLanguageModel({
      model: provider('openai/gpt-3.5-turbo-instruct'),
      middleware: contextMiddleware
    })

    try {
      console.log('Generating evaluation object...')
      const { object } = await generateObject({
        model,
        mode: 'json',
        schema: z.object({
          hasAnswer: z
            .boolean()
            .describe('Whether the current context is sufficient to answer the query - be lenient'),
          suggestedQuery: z
            .string()
            .describe(`A search query of one sentence to describe the context you need.`),
          reasoning: z
            .string()
            .describe(
              'Brief explanation of why more information is needed or why current context is sufficient'
            )
        }),
        messages: [
          {
            role: 'system',
            content:
              'You are a search query analyzer that evaluates context completeness and generates focused search queries. Keep your responses concise. Always search for updated information and refer to the context of current queries to make sure you are searching for the most relevant information, so take account todays date: ' +
              new Date().toLocaleDateString() +
              `

Current Context:
${combinedSearchContext}`
          },
          ...recentConversations.filter((conv) => conv.role !== 'system'),
          {
            role: 'user',
            content: `Evaluate if we have sufficient information to answer this query and determine what additional information might be needed.

Main Query: ${query}

Instructions:
1. Analyze the main query and break it down into different pieces of context that is useful to answer the query
2. Evaluate the current context against these aspects
3. If more information is needed, provide a specific search query

Consider the chat history above when determining if we have sufficient context.
Your search queries must be specific and use updated information taking account todays date: ${new Date().toLocaleDateString()}.

Keep your response focused and concise.`
          }
        ]
      })

      console.log('Evaluation result:', JSON.stringify(object, null, 2))

      // Return both the query and empty results array if we have sufficient context
      if (object.hasAnswer) {
        return { queries: [], results: [] }
      }

      // Add reasoning to search steps
      setSearchSteps((prev) => [
        ...prev,
        {
          id: uuidv4(),
          query: object.reasoning,
          status: 'thinking'
        }
      ])

      // Fallback to using the suggested query or a generic one
      const fallbackQuery = object.suggestedQuery || `more specific information about ${query}`
      console.log('Using fallback query:', fallbackQuery)
      return { queries: [fallbackQuery], results: [] }
    } catch (error) {
      console.error('Error in breakDownQuery:', error)
      const fallbackQuery = `specific information about ${query}`
      console.log('Error occurred, using fallback query:', fallbackQuery)
      return { queries: [fallbackQuery], results: [] }
    }
  }

  // Update askAIQuestion to properly handle both agent and non-agent paths
  const askAIQuestion = useCallback(
    async (originalQuery: string) => {
      if (currentSettings.modelType === 'openai' && !currentSettings.apiKey.trim()) {
        setSearchSteps((prev) => {
          const alreadyWarned = prev.some(
            (step) => step.query === 'Add an OpenRouter API key in Settings to chat.'
          )
          if (alreadyWarned) {
            return prev
          }

          return [
            ...prev,
            {
              id: uuidv4(),
              query: 'Add an OpenRouter API key in Settings to chat.',
              status: 'failed'
            }
          ]
        })

        setConversations((prev) => [
          ...prev,
          {
            question: originalQuery,
            answer:
              'Add an OpenRouter API key in Settings to enable cloud responses, or switch to a private model.',
            timestamp: Date.now(),
            sources: []
          }
        ])
        return
      }

      const baseModel = provider(currentSettings.model)
      const contextMiddleware = createContextMiddleware({
        getContext: () => combinedSearchContext
      })

      const model = wrapLanguageModel({
        model: baseModel,
        middleware: contextMiddleware
      })

      if (!useAgent) {
        // Skip search steps and agent processing, but still start a chat
        try {
          const textStream = await generateChatResponse(model, originalQuery)

          const newConversation: AIResponse = {
            question: originalQuery,
            answer: '',
            timestamp: Date.now(),
            sources: []
          }

          setConversations((prev) => [...prev, newConversation])

          let fullResponse = ''
          for await (const textPart of textStream.textStream) {
            fullResponse += textPart
            setConversations((prev) =>
              prev.map((conv, i) =>
                i === prev.length - 1
                  ? {
                      ...conv,
                      answer: fullResponse
                    }
                  : conv
              )
            )
          }
        } catch (error) {
          console.error('Chat failed:', error)
        }
        return
      }

      // Agent-enabled path
      setSearchSteps([])
      let allResults: SearchResult[] = [...searchResults]
      const allSources: Source[] = []
      const subQueryContext = ''

      try {
        // Break down query and gather additional context
        const { queries } = await breakDownQuery(originalQuery)

        // If we have additional queries, perform searches
        if (queries.length > 0) {
          for (const query of queries) {
            setSearchSteps((prev) => [
              ...prev,
              {
                id: uuidv4(),
                query,
                status: 'searching'
              }
            ])

            const results = await trpcClient.search.quick.query(query)
            if (results.length > 0) {
              allResults = [...allResults, ...results]
              setSearchResults(allResults)
            }

            setSearchSteps((prev) =>
              prev.map((step) => (step.query === query ? { ...step, status: 'complete' } : step))
            )
          }
        }

        // Start chat with gathered context
        const textStream = await generateChatResponse(model, originalQuery, subQueryContext)

        const newConversation: AIResponse = {
          question: originalQuery,
          answer: '',
          timestamp: Date.now(),
          sources: allSources
        }

        setConversations((prev) => [...prev, newConversation])

        let fullResponse = ''
        for await (const textPart of textStream.textStream) {
          fullResponse += textPart
          setConversations((prev) =>
            prev.map((conv, i) =>
              i === prev.length - 1
                ? {
                    ...conv,
                    answer: fullResponse
                  }
                : conv
            )
          )
        }
      } catch (error) {
        console.error('Agent chat failed:', error)
        setSearchSteps((prev) => [
          ...prev,
          {
            id: uuidv4(),
            query: 'Error occurred during processing',
            status: 'failed'
          }
        ])
      }
    },
    [
      currentSettings,
      combinedSearchContext,
      conversations,
      searchResults,
      breakDownQuery,
      generateChatResponse,
      useAgent
    ]
  )

  // Add state machine
  const [searchState, dispatch] = useReducer(searchReducer, { status: 'idle' })

  // Update debouncedSearch to not handle chat
  const debouncedSearch = useCallback(
    async (searchQuery: string): Promise<boolean> => {
      if (!searchQuery.trim()) {
        dispatch({ type: 'RESET' })
        setShowResults(false)
        setSearchResults([])
        setIsLoading(false)
        return false
      }

      setIsLoading(true)
      dispatch({ type: 'START_SEARCH', payload: { query: searchQuery } })

      try {
        // Only use quick search
        const quickResults = await trpcClient.search.quick.query(searchQuery)

        if (quickResults.length === 0) {
          setShowResults(false)
          dispatch({ type: 'SEARCH_ERROR', payload: 'No results found' })
          setIsLoading(false)
          return false
        }

        // Filter and show quick results immediately
        const filteredQuickResults = filterOutStickyNotes(quickResults)
        setSearchResults(filteredQuickResults)
        setShowResults(filteredQuickResults.length > 0)
        dispatch({
          type: 'SEARCH_SUCCESS',
          payload: { query: searchQuery, results: filteredQuickResults }
        })

        // Start background fetch of full content
        filteredQuickResults.forEach(async (result) => {
          try {
            if (result.metadata.sourceType === 'web' && result.text.length > 500) {
              return
            }

            const response = await trpcClient.content.fetch.query(result.metadata.path)
            if (response.content) {
              setSearchResults((prev) =>
                prev.map((r) =>
                  r.metadata.path === result.metadata.path ? { ...r, text: response.content } : r
                )
              )
            }
          } catch (error) {
            console.error('Error fetching full content:', error)
          }
        })

        // Cache the results
        setSearchCache((prev) => {
          const newCache = [
            {
              query: searchQuery,
              results: filteredQuickResults,
              timestamp: Date.now()
            },
            ...prev.filter((item) => item.query !== searchQuery)
          ].slice(0, 5)
          return newCache
        })

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
    [getCachedResults, stickyNotes]
  )

  // Update handleInputChange to debounce properly
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value
      setQuery(newQuery)
      setSelectedIndex(-1)
      enterPressedDuringSearch.current = false

      // Clear any pending searches
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }

      // Only search if there's content
      if (newQuery.trim()) {
        searchTimeoutRef.current = setTimeout(() => {
          debouncedSearch(newQuery)
        }, 800)
      } else {
        setShowResults(false)
        setSearchResults([])
      }
    },
    [debouncedSearch]
  )

  const refreshSmitheryServer = useCallback(
    async (server: SmitheryMCPServer) => {
      setSmitheryManualError(null)
      try {
        const refreshed = await createSmitheryServerFromInput(server.manifestUrl ?? server.slug, {
          apiKey: smitheryApiKey || undefined,
          existing: server
        })

        setSmitheryServers((prev) =>
          prev.map((entry) =>
            entry.id === server.id ? { ...refreshed, enabled: entry.enabled } : entry
          )
        )
      } catch (error) {
        console.error('Failed to refresh Smithery connector from dashboard', error)
        setSmitheryManualError((prev) => prev ?? 'Failed to refresh Smithery connector metadata.')
      }
    },
    [setSmitheryServers, smitheryApiKey]
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
          if (showResults && selectedIndex >= 0) {
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
    [query, showResults, selectedIndex, searchResults]
  )

  // Open Folder Function
  const openWorkspaceFolder = useCallback(async () => {
    try {
      await trpcClient.folder.openAlBERT.mutate()
    } catch (error) {
      console.error('Failed to open workspace folder:', error)
    }
  }, [])

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
        if (enterPressedDuringSearch.current) {
          enterPressedDuringSearch.current = false
          dispatch({
            type: 'START_CHAT',
            payload: {
              query: searchState.query,
              results: searchState.results
            }
          })
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

  // Add clearChat function
  const clearChat = useCallback(() => {
    setConversations([])
    setQuery('')
    setSearchResults([])
    setShowResults(false)
    setSearchSteps([])
    dispatch({ type: 'RESET' })
  }, [])

  // Add this new function to handle creating sticky notes
  const createStickyNote = useCallback(
    (
      result: SearchResult | { text: string; metadata: any },
      position: { x: number; y: number }
    ): void => {
      const newNote: StickyNote = {
        ...result,
        id: uuidv4(),
        position,
        isDragging: false,
        dist: 'dist' in result ? result.dist : { corpus_id: 0, score: 1, text: result.text }
      }
      setStickyNotes((prev) => [...prev, newNote])

      // Only remove from search results if it's a SearchResult
      if ('dist' in result) {
        setSearchResults((prev) =>
          prev.filter((item) => item.metadata.path !== result.metadata.path)
        )
      }
    },
    []
  )

  const spawnQuickNote = useCallback(() => {
    createStickyNote(
      {
        text: '# New Note\n\nCapture your ideas…',
        metadata: {
          path: `note-${Date.now()}.md`,
          created_at: Date.now() / 1000,
          modified_at: Date.now() / 1000,
          filetype: 'markdown',
          languages: ['en'],
          links: [],
          owner: null,
          seen_at: Date.now() / 1000,
          sourceType: 'document'
        }
      },
      {
        x: window.innerWidth / 2 - 200,
        y: window.innerHeight / 2 - 200
      }
    )
  }, [createStickyNote])

  // Add drag handling functions using React DnD

  // Add to existing imports
  // Update the filterOutStickyNotes function
  const filterOutStickyNotes = (results: SearchResult[]): SearchResult[] => {
    const stickyNotePaths = new Set(stickyNotes.map((note) => note.metadata.path))
    return results.filter((result) => !stickyNotePaths.has(result.metadata.path))
  }

  // Add this function near other utility functions
  const handlePathClick = async (path: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation() // Prevent triggering the card click

    try {
      await trpcClient.document.open.mutate(path)
    } catch (error) {
      console.error('Failed to open document:', error)
    }
  }

  // Handle key events
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent): Promise<void> => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (!query.trim() || isLoading) return

        setIsLoading(true)
        dispatch({ type: 'START_SEARCH', payload: { query } })

        try {
          const quickResults = await trpcClient.search.quick.query(query)
          if (quickResults.length === 0) {
            setShowResults(false)
            dispatch({ type: 'SEARCH_ERROR', payload: 'No results found' })
            return
          }

          // Filter and update results
          const filteredResults = filterOutStickyNotes(quickResults)
          setSearchResults(filteredResults)
          setShowResults(true)

          // Cache results
          setSearchCache((prev) => {
            const newCache = [
              { query, results: filteredResults, timestamp: Date.now() },
              ...prev.filter((item) => item.query !== query)
            ].slice(0, 5)
            return newCache
          })

          // Always start chat, but skip agent processing if useAgent is false
          dispatch({ type: 'START_CHAT', payload: { query, results: filteredResults } })
          await askAIQuestion(query)
          dispatch({ type: 'CHAT_COMPLETE' })
        } catch (error) {
          console.error('Search or chat failed:', error)
          dispatch({ type: 'SEARCH_ERROR', payload: String(error) })
        } finally {
          setIsLoading(false)
        }
        return
      }

      // Handle Escape key
      if (e.key === 'Escape') {
        e.preventDefault()
        clearChat()
        return
      }

      // Handle arrow keys for navigation
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (showResults && searchResults.length > 0) {
          setSelectedIndex((prev) => (prev <= 0 ? searchResults.length - 1 : prev - 1))
        }
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (showResults && searchResults.length > 0) {
          setSelectedIndex((prev) => (prev >= searchResults.length - 1 ? 0 : prev + 1))
        }
        return
      }

      // Handle left arrow for settings toggle
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (activePanel === 'settings') {
          setActivePanel('response')
        } else {
          setActivePanel('settings')
        }
        return
      }

      // Handle right arrow for pinning context
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (activePanel === 'settings') {
          setActivePanel('response')
          return
        }
        return
      }

      // Handle Cmd/Ctrl + K to open knowledgebase
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        await openWorkspaceFolder()
        return
      }

      // Handle Cmd/Ctrl + C to copy only when there are search results
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        // Only prevent default and handle copy if we have search results
        if (searchResults.length > 0) {
          e.preventDefault()
          if (selectedIndex >= 0 && searchResults[selectedIndex]) {
            await copyToClipboard(searchResults[selectedIndex].text, true, true)
          } else {
            await copyToClipboard(searchResults.map((r) => r.text).join('\n\n'), true, true)
          }
        }
        // If no search results, let the system handle the copy command
        return
      }

      // Handle Cmd/Ctrl + N for new note
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        spawnQuickNote()
        return
      }
    },
    [
      query,
      searchState,
      activePanel,
      selectedIndex,
      searchResults,
      conversations,
      askAIQuestion,
      showResults,
      stickyNotes,
      isLoading,
      useAgent,
      openWorkspaceFolder,
      copyToClipboard,
      spawnQuickNote,
      clearChat
    ]
  )

  // Keyboard Event Handler
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return (): void => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Add StickyNoteComponent with React DnD
  const StickyNoteComponent: React.FC<{
    note: StickyNote
    onClose: (id: string) => void
    onDrag: (id: string, position: { x: number; y: number }) => void
    onEdit: (id: string, newText: string) => void
  }> = ({ note, onClose, onDrag, onEdit }) => {
    const noteRef = useRef<HTMLDivElement>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [localText, setLocalText] = useState(note.text)
    const editorRef = useRef<any>(null)

    // Add debounced save
    const debouncedSave = useCallback(
      debounce((id: string, text: string) => {
        onEdit(id, text)
      }, 1000),
      [onEdit]
    )

    // Handle text changes
    const handleTextChange = useCallback(
      (markdown: string) => {
        setLocalText(markdown)
        debouncedSave(note.id, markdown)
      },
      [note.id, debouncedSave]
    )

    // Add image handling configuration
    const handleImageUpload = async (file: File): Promise<string> => {
      try {
        // For now, we'll just return a data URL
        return new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
      } catch (error) {
        console.error('Error uploading image:', error)
        throw error
      }
    }

    // Implement drag functionality using React DnD
    const [{ isDragging }, drag] = useDrag({
      type: 'stickyNote',
      item: { id: note.id, type: 'stickyNote' },
      collect: (monitor) => ({
        isDragging: monitor.isDragging()
      }),
      options: {
        dropEffect: 'move'
      },
      end: (item, monitor) => {
        const clientOffset = monitor.getClientOffset()
        const initialOffset = monitor.getInitialClientOffset()

        if (clientOffset && initialOffset) {
          const deltaX = initialOffset.x - note.position.x
          const deltaY = initialOffset.y - note.position.y

          onDrag(note.id, {
            x: clientOffset.x - deltaX,
            y: clientOffset.y - deltaY
          })
        }
      }
    })

    // Add this effect to hide the drag preview
    useEffect(() => {
      if (typeof window !== 'undefined') {
        // Create an empty image for the drag preview
        const emptyImage = new Image()
        emptyImage.src =
          'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

        const dragPreview = drag.preview
        if (dragPreview) {
          dragPreview.setPreview(emptyImage)
        }
      }
    }, [drag])

    // Simplify drop - we don't need it anymore since we're using end callback
    const [, drop] = useDrop({
      accept: 'stickyNote'
    })

    const opacity = isDragging ? 0 : 1 // Hide the original while dragging

    return (
      <div
        ref={(node) => drag(drop(node))}
        style={{
          position: 'fixed',
          left: note.position.x,
          top: note.position.y,
          zIndex: isDragging ? 1000 : 50,
          opacity: 1, // Keep opacity constant to prevent flash
          visibility: isDragging ? 'hidden' : 'visible', // Use visibility instead of opacity
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: 'none',
          touchAction: 'none'
        }}
        className="group"
      >
        <Card className="w-96 rounded-2xl border border-slate-800 bg-slate-950/95 text-slate-100 shadow-lg">
          {/* Header */}
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {note.metadata.sourceType === 'web' ? (
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <h3 className="text-sm font-medium leading-none truncate">
                  {note.metadata.path.split('/').pop()}
                </h3>
              </div>
              <button
                onClick={() => onClose(note.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity rounded-sm hover:bg-accent hover:text-accent-foreground p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              className="text-xs text-muted-foreground mt-1.5 hover:text-primary cursor-pointer transition-colors truncate pl-6"
              onClick={(e) => handlePathClick(note.metadata.path, e)}
              title={note.metadata.path}
            >
              {truncateText(note.metadata.path, 60)}
            </div>
          </CardHeader>

          {/* Content section */}
          <CardContent className="p-3 pt-0">
            <ScrollArea className="h-[300px] w-full rounded-md pr-4">
              <div className="prose prose-sm dark:prose-invert max-w-none [&_.mdxeditor]:bg-transparent [&_.mdxeditor]:border-0 [&_.mdxeditor]:p-0 [&_img]:max-w-full [&_img]:h-auto">
                <MDXEditor
                  ref={editorRef}
                  markdown={localText}
                  onChange={handleTextChange}
                  plugins={[
                    headingsPlugin(),
                    listsPlugin(),
                    quotePlugin(),
                    markdownShortcutPlugin(),
                    linkPlugin(),
                    tablePlugin(),
                    thematicBreakPlugin(),
                    frontmatterPlugin(),
                    codeBlockPlugin(),
                    imagePlugin({ imageUploadHandler: handleImageUpload })
                  ]}
                  contentEditableClassName="min-h-[280px] font-mono text-sm"
                  className={cn(
                    '!bg-transparent !border-0 !p-0 overflow-hidden',
                    isEditing && 'ring-1 ring-ring rounded-sm'
                  )}
                />
              </div>
            </ScrollArea>
          </CardContent>

          {/* Footer */}
          <CardFooter className="p-3 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
              <span>
                Modified: {new Date(note.metadata.modified_at * 1000).toLocaleDateString()}
              </span>
              <span className="text-xs opacity-50 select-none">
                {isEditing ? 'Editing...' : 'Drag to move'}
              </span>
            </div>
          </CardFooter>
        </Card>
      </div>
    )
  }

  const shouldShowResponsePanel = conversations.length > 0 && activePanel === 'response'
  const isSettingsActive = activePanel === 'settings'
  const hasScrollableContent = showResults && searchResults.length > 0
  const connectorSummary = useMemo(() => {
    if (activeSmitheryServers.length === 0) {
      return 'Link MCPs'
    }

    if (activeSmitheryServers.length === 1) {
      return '1 MCP linked'
    }

    return `${activeSmitheryServers.length} MCPs linked`
  }, [activeSmitheryServers.length])

  return (
    <DndProvider backend={HTML5Backend}>
      <DropArea
        onDrop={(item, position) => {
          if (item.type === 'searchResult') {
            createStickyNote(item.result, position)
          }
        }}
        className="overflow-hidden text-slate-100"
      >
        <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-10 lg:px-8">
          <div className="flex w-full max-w-3xl flex-col items-center gap-6">
            <Card className={cn(PANEL_BASE_CLASS, 'w-full')} data-highlight="search-container">
              <CardContent className="flex max-h-[80vh] flex-col p-0">
                {searchSteps.length > 0 && (
                  <div className="px-6 pt-6">
                    <SearchBadges steps={searchSteps} />
                  </div>
                )}

                <div className="px-6 pb-4">
                  <SearchBar
                    ref={searchBarRef}
                    query={query}
                    setQuery={setQuery}
                    isLoading={isLoading}
                    useAgent={useAgent}
                    handleAgentToggle={setUseAgent}
                    handleInputChange={handleInputChange}
                    onOpenSettings={toggleSettingsPanel}
                    isSettingsActive={isSettingsActive}
                    connectorSummary={connectorSummary}
                    connectorCount={activeSmitheryServers.length}
                    connectorSyncing={isSmitheryLoading}
                    data-highlight="search-input"
                  />
                </div>

                <ScrollArea className={cn(hasScrollableContent ? 'flex-1' : '')}>
                  <div className="flex flex-col gap-6 px-6 pb-6">
                    {showResults && (
                      <SearchResults
                        searchResults={searchResults}
                        selectedIndex={selectedIndex}
                        rankedChunks={rankedChunks}
                        createStickyNote={createStickyNote}
                        data-highlight="search-results"
                      />
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {shouldShowResponsePanel && (
              <Suspense fallback={<div>Loading Response Panel...</div>}>
                <Card className={cn(PANEL_BASE_CLASS, 'w-full')} data-highlight="response-panel">
                  <CardContent className="flex h-[600px] flex-col p-6">
                    <ResponsePanel
                      conversations={conversations}
                      addAIResponseToContext={() => {}}
                      askAIQuestion={askAIQuestion}
                      isLoading={isLoading}
                      onNewChat={clearChat}
                      createStickyNote={createStickyNote}
                      dispatch={dispatch}
                      setSearchResults={setSearchResults}
                      setShowResults={setShowResults}
                      filterOutStickyNotes={filterOutStickyNotes}
                    />
                  </CardContent>
                </Card>
              </Suspense>
            )}

            {isSettingsActive && (
              <Suspense fallback={<div>Loading Settings...</div>}>
                <Card className={cn(PANEL_BASE_CLASS, 'w-full')}>
                  <CardContent className="flex h-[600px] flex-col p-6">
                    <SettingsPanel
                      isPrivate={isPrivate}
                      setIsPrivate={setIsPrivate}
                      privateSettings={privateSettings}
                      publicSettings={publicSettings}
                      setPrivateSettings={setPrivateSettings}
                      setPublicSettings={setPublicSettings}
                      setActivePanel={setActivePanel}
                      smitheryApiKey={smitheryApiKey}
                      setSmitheryApiKey={setSmitheryApiKey}
                      smitheryServers={smitheryServers}
                      setSmitheryServers={setSmitheryServers}
                    />
                  </CardContent>
                </Card>
              </Suspense>
            )}

            <div className="w-full">
              <KeyboardShortcuts
                showDocument={activePanel === 'document'}
                activePanel={activePanel}
                data-highlight="keyboard-shortcuts"
              />
            </div>
          </div>
        </div>

        <AnimatePresence>
          {stickyNotes.map((note) => (
            <StickyNoteComponent
              key={note.id}
              note={note}
              onClose={(id) => {
                setStickyNotes((prev) => prev.filter((n) => n.id !== id))
              }}
              onDrag={(id, position) => {
                setStickyNotes((prev) =>
                  prev.map((n) =>
                    n.id === id
                      ? {
                          ...n,
                          position: {
                            x: Math.max(0, Math.min(window.innerWidth - 384, position.x)),
                            y: Math.max(0, Math.min(window.innerHeight - 400, position.y))
                          }
                        }
                      : n
                  )
                )
              }}
              onEdit={(id, newText) => {
                setStickyNotes((prev) =>
                  prev.map((n) =>
                    n.id === id
                      ? {
                          ...n,
                          text: newText,
                          metadata: {
                            ...n.metadata,
                            modified_at: Date.now() / 1000
                          }
                        }
                      : n
                  )
                )
              }}
            />
          ))}
        </AnimatePresence>
      </DropArea>
    </DndProvider>
  )
}

export default App
