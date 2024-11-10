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
import { getContextSimilarityScores, trpcClient } from './util/trpc-client'
import { cn } from '@/lib/utils'
import SearchBar from '@/components/SearchBar'
import SearchResults from '@/components/SearchResults'
const SettingsPanel = React.lazy(() => import('@/components/SettingsPanel'))
import { KeyboardShortcuts } from '@/components/navigation/KeyboardShortcuts'
import { generateText, streamText, experimental_wrapLanguageModel as wrapLanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createContextMiddleware } from './lib/context-middleware'
import { LLMSettings, ContextTab } from './types'
import type { SearchBarRef } from '@/components/SearchBar'
import { getRankedChunks, RankedChunk } from '@/lib/context-utils'
const ResponsePanel = React.lazy(() => import('@/components/ResponsePanel'))
import SearchBadges, { SearchStep } from '@/components/SearchBadges'
import { v4 as uuidv4 } from 'uuid'
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { Globe, FileText, X, Pencil, Save } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'

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
  queryContext?: {
    query: string
    subQueries?: Array<{
      query: string
      answer: string
    }>
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

// Add this utility function near the top of the file
const truncateText = (text: string, maxLength: number = 150): string => {
  if (!text) return ''
  if (text.length <= maxLength) return text

  // Find the last space before maxLength
  const lastSpace = text.lastIndexOf(' ', maxLength)
  if (lastSpace === -1) return text.slice(0, maxLength) + '...'

  return text.slice(0, lastSpace) + '...'
}

// First, move combinedSearchContext before the functions that use it
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

  const [conversations, setConversations] = useState<AIResponse[]>([])

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

    if (query && searchResults.length > 0) {
      updateRankedChunks()
    } else {
      setRankedChunks([])
    }
  }, [query, searchResults])

  // Add these new states in the App component
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Update combinedSearchContext to be synchronous
  const combinedSearchContext = useMemo(() => {
    const MAX_CONTEXT_LENGTH = 50000
    let context = ''

    // Get all documents for scoring
    const documents = [
      ...searchResults.map((result) => ({
        content: result.text,
        path: result.metadata.path,
        type: result.metadata.sourceType === 'web' ? 'web' : 'document'
      })),
      ...stickyNotes.map((note) => ({
        content: note.text,
        path: note.metadata.path,
        type: 'pinned'
      }))
    ]

    if (documents.length === 0) return ''

    try {
      // Calculate total content length and select documents up to MAX_CONTEXT_LENGTH
      let currentLength = 0
      const selectedDocuments = documents
        .sort((a, b) => {
          // Prioritize pinned documents
          if (a.type === 'pinned' && b.type !== 'pinned') return -1
          if (a.type !== 'pinned' && b.type === 'pinned') return 1
          return 0
        })
        .filter((doc) => {
          const length = doc.content.length
          if (currentLength + length <= MAX_CONTEXT_LENGTH) {
            currentLength += length
            return true
          }
          return false
        })

      // Build context from selected documents
      context = selectedDocuments
        .map((doc) => {
          const relevanceNote = doc.type === 'pinned' ? ' (pinned)' : ''
          return `\n\nFrom ${doc.path}${relevanceNote}:\n${doc.content}`
        })
        .join('')

      return context.trim()
    } catch (error) {
      console.error('Error building context:', error)
      return ''
    }
  }, [query, searchResults, stickyNotes])

  // Add a separate effect to update similarity scores
  const [documentScores, setDocumentScores] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    const updateSimilarityScores = async () => {
      const documents = [
        ...searchResults.map((result) => ({
          content: result.text,
          path: result.metadata.path,
          type: result.metadata.sourceType === 'web' ? 'web' : 'document'
        }))
      ]

      if (documents.length === 0) return

      try {
        const similarityScores = await getContextSimilarityScores([query], documents)

        const scoreMap = new Map<string, number>()
        similarityScores.forEach((doc) => {
          const score = doc.scores[0]
          scoreMap.set(doc.path, score)
        })

        setDocumentScores(scoreMap)
      } catch (error) {
        console.error('Error calculating similarity scores:', error)
      }
    }

    if (query) {
      updateSimilarityScores()
    }
  }, [query, searchResults])

  // Then update generateChatResponse to use the synchronous context
  const generateChatResponse = useCallback(
    async (
      model: any,
      originalQuery: string,
      subQueryContext: string = ''
    ): Promise<{ textStream: AsyncIterable<string> }> => {
      return streamText({
        model,
        prompt: `Use the following context to answer the question. Use markdown formatting to create a well formatted response using visual aids such as headings and images and tables from the context to answer the question as well and informative as possible. If the context doesn't contain relevant information, say so.

When citing sources, use markdown links in your response like this: [relevant text](path/to/source). Make sure to cite your sources inline, using markdown links as you use them. Instead of using the source name as the link text, use the words within the source that are relevant to quote it inside the [].

Context (sorted by relevance):
${combinedSearchContext}

${subQueryContext ? `\nReasoning steps:\n${subQueryContext}` : ''}

${
  conversations.length > 0
    ? `Previous conversations:\n${conversations
        .map((conv) => `Q: ${conv.question}\nA: ${conv.answer}`)
        .join('\n\n')}\n\n`
    : ''
}
Question: ${originalQuery}

Answer with inline citations:`
      })
    },
    [combinedSearchContext, conversations]
  )

  // Add to your state definitions
  const [searchSteps, setSearchSteps] = useState<SearchStep[]>([])

  // Update the breakDownQuery function to use only necessary context
  const breakDownQuery = async (query: string, existingContext: string = ''): Promise<string[]> => {
    // Use only the chain of reasoning from previous sub-queries (existingContext)
    // and the ranked/truncated combinedSearchContext
    const fullContext = [existingContext, combinedSearchContext].filter(Boolean).join('\n\n')

    const contextMiddleware = createContextMiddleware({
      getContext: () => fullContext
    })

    const model = wrapLanguageModel({
      model: provider(currentSettings.model),
      middleware: contextMiddleware
    })

    const text = await generateText({
      model,
      prompt: `Based on the available context and the main query, determine the next most important search query needed to gather comprehensive information.

Main Query: ${query}

${fullContext ? `Current Context:\n${fullContext}\n\n` : ''}

Chain of Reasoning:
${existingContext ? `Previous findings:\n${existingContext}\n\n` : ''}

Instructions:
1. Analyze the main query and all available context
2. Consider what information is already available from the context and previous findings
3. Identify the most important missing information needed
4. If the current context is sufficient to answer the main query, return exactly: "CONTEXT_SUFFICIENT"
5. Otherwise, provide ONE specific search query that would help gather the most relevant missing information

Response (either a specific search query or CONTEXT_SUFFICIENT):`
    })

    const response = text.text.trim()
    console.log('Generated sub-query or response:', response) // Debug log

    if (response === 'CONTEXT_SUFFICIENT') {
      return []
    }

    return [response]
  }

  // Update the evaluateSearchResults function to better handle JSON parsing
  const evaluateSearchResults = async (
    originalQuery: string,
    subQuery: string,
    results: SearchResult[]
  ): Promise<{ hasAnswer: boolean; answer?: string; suggestions?: string[] }> => {
    try {
      const documents = results.map((result) => ({
        content: result.text || '',
        path: result.metadata?.path || '',
        type: result.metadata?.sourceType === 'web' ? 'web' : 'document'
      }))

      // Get similarity scores for both original query and subquery
      const similarityScores = await getContextSimilarityScores(
        [originalQuery, subQuery],
        documents
      )

      // Combine scores with documents and sort by relevance
      const scoredDocuments = documents
        .map((doc, index) => ({
          ...doc,
          combinedScore:
            similarityScores[index].scores[0] * 0.4 + similarityScores[index].scores[1] * 0.6
        }))
        .sort((a, b) => b.combinedScore - a.combinedScore)

      // Calculate total content length and select documents up to MAX_CONTEXT_LENGTH
      const MAX_CONTEXT_LENGTH = 8000
      let currentLength = 0
      const selectedDocuments = scoredDocuments.filter((doc) => {
        if (currentLength + doc.content.length <= MAX_CONTEXT_LENGTH) {
          currentLength += doc.content.length
          return true
        }
        return false
      })

      const rankedChunks = await getRankedChunks({
        query: subQuery,
        documents: selectedDocuments,
        chunkSize: 500
      })

      if (!rankedChunks.length) {
        console.log('No ranked chunks found')
        // Generate suggestions when no chunks are found
        const suggestionResponse = await generateText({
          model: wrapLanguageModel({
            model: provider(currentSettings.model),
            middleware: createContextMiddleware({ getContext: () => '' })
          }),
          prompt: `Given the original query "${originalQuery}" and the sub-query "${subQuery}", suggest 2-3 specific aspects or pieces of information that would be most helpful to find. Format each suggestion as a search query.

Format your response as a JSON array of strings, like this:
["suggestion 1", "suggestion 2", "suggestion 3"]

Response:`
        })

        try {
          const suggestions = JSON.parse(suggestionResponse.text.trim())
          return { hasAnswer: false, suggestions: suggestions }
        } catch (error) {
          console.error('Error parsing suggestions:', error)
          return { hasAnswer: false }
        }
      }

      // Build context from ranked chunks, including similarity scores
      const context = rankedChunks
        .map((chunk) => {
          const docScore = scoredDocuments.find((d) => d.path === chunk.path)?.combinedScore || 0
          return `From ${chunk.path} (relevance: ${docScore.toFixed(2)}):\n${chunk.text}`
        })
        .join('\n\n')

      if (!context.trim()) {
        console.log('Empty context after ranking')
        return { hasAnswer: false }
      }

      const contextMiddleware = createContextMiddleware({
        getContext: () => context
      })

      const model = wrapLanguageModel({
        model: provider(currentSettings.model),
        middleware: contextMiddleware
      })

      const text = await generateText({
        model,
        prompt: `Given these ranked and similarity-scored search results, evaluate if they contain enough relevant information to answer the sub-query "${subQuery}" (which is part of answering the main query "${originalQuery}").

Consider both the content and the relevance scores when determining if the information is sufficient and reliable.

If there is NOT enough relevant information, analyze what specific information is missing and return a JSON object like this:
{
  "status": "INSUFFICIENT_CONTEXT",
  "missing": ["specific piece of info needed 1", "specific piece of info needed 2"]
}

If there IS enough information, provide a very concise answer under 500 characters that captures the key information from the most relevant sources, and return a JSON object like this:
{
  "status": "SUFFICIENT",
  "answer": "your answer here"
}

Be EXTREMELY lenient about this. If you find ANY relevant information that helps answer the query, consider it SUFFICIENT.

Search Results:
${context}

Response (must be valid JSON):`
      })

      try {
        // Clean up the response text to handle various JSON formats
        const cleanedText = text.text
          .trim()
          .replace(/```json\s*|\s*```/g, '') // Remove code blocks
          .replace(/^[^{]*({.*})[^}]*$/, '$1') // Extract JSON object
          .trim()

        const response = JSON.parse(cleanedText)

        if (response.status === 'INSUFFICIENT_CONTEXT') {
          return {
            hasAnswer: false,
            suggestions: response.missing.map((info: string) => `${subQuery} ${info.toLowerCase()}`)
          }
        }

        if (response.status === 'SUFFICIENT' && response.answer) {
          return {
            hasAnswer: true,
            answer: JSON.stringify({ status: 'SUFFICIENT', answer: response.answer })
          }
        }

        // Fallback for any other valid JSON response
        return {
          hasAnswer: true,
          answer: JSON.stringify({ status: 'SUFFICIENT', answer: cleanedText })
        }
      } catch (error) {
        console.error('Error parsing JSON response:', error)
        // If JSON parsing fails but we have a text response, consider it an answer
        if (text.text.length > 0) {
          return {
            hasAnswer: true,
            answer: JSON.stringify({
              status: 'SUFFICIENT',
              answer: text.text.slice(0, 1000).trim()
            })
          }
        }
        return { hasAnswer: false }
      }
    } catch (error) {
      console.error('Error in evaluateSearchResults:', error)
      return { hasAnswer: false }
    }
  }

  // Add this function near other utility functions
  const fetchSources = async (results: SearchResult[]): Promise<Source[]> => {
    try {
      // Get unique paths from search results
      const paths = [...new Set(results.map((r) => r.metadata.path))]

      // Fetch source contents
      const sources = await trpcClient.sources.fetch.query(paths)

      return sources.map((source) => ({
        path: source.path,
        preview: truncateText(source.content, 200),
        citations: [],
        description: source.content
      }))
    } catch (error) {
      console.error('Error fetching sources:', error)
      return []
    }
  }

  // Update the askAIQuestion function to handle errors better
  const askAIQuestion = useCallback(
    async (originalQuery: string) => {
      setSearchSteps([])
      let allResults: SearchResult[] = []
      const subQueryAnswers: { query: string; answer: string }[] = []
      let currentContext = ''
      let allSources: Source[] = []

      try {
        let keepSearching = true
        let searchAttempts = 0
        const MAX_SEARCH_ATTEMPTS = 3

        while (keepSearching && searchAttempts < MAX_SEARCH_ATTEMPTS) {
          searchAttempts++
          // Add thinking step
          const thinkingStepId = uuidv4()
          setSearchSteps((prev) => [
            ...prev,
            {
              id: thinkingStepId,
              query: 'Breaking down query...',
              status: 'thinking'
            }
          ])

          // Get next search query based on current context
          const nextQueries = await breakDownQuery(originalQuery, currentContext)

          if (nextQueries.length === 0) {
            // Update thinking step to complete
            setSearchSteps((prev) =>
              prev.map((step) =>
                step.id === thinkingStepId
                  ? {
                      ...step,
                      status: 'complete',
                      query: 'Context is sufficient',
                      answer: 'Found all needed information'
                    }
                  : step
              )
            )
            keepSearching = false
            continue
          }

          const subQuery = nextQueries[0]

          // Update thinking step with the generated query
          setSearchSteps((prev) =>
            prev.map((step) =>
              step.id === thinkingStepId
                ? {
                    ...step,
                    status: 'complete',
                    query: `Thinking: ${subQuery}`
                  }
                : step
            )
          )

          // Add search step
          const searchStepId = uuidv4()
          setSearchSteps((prev) => [
            ...prev,
            {
              id: searchStepId,
              query: subQuery,
              status: 'searching'
            }
          ])

          try {
            // Use quick search for each subquery
            const results = await trpcClient.search.quick.query(subQuery)
            console.log('Search results for subquery:', subQuery, results)

            if (!results || !Array.isArray(results) || results.length === 0) {
              console.log('No results found for subquery:', subQuery)
              setSearchSteps((prev) =>
                prev.map((step) =>
                  step.id === searchStepId
                    ? {
                        ...step,
                        status: 'failed',
                        answer: 'No results found'
                      }
                    : step
                )
              )
              continue
            }

            // Add query context to results
            const resultsWithContext = results.map((result) => ({
              ...result,
              queryContext: {
                query: originalQuery,
                subQueries: [
                  ...subQueryAnswers,
                  {
                    query: subQuery,
                    answer: '' // Will be filled after evaluation
                  }
                ]
              }
            }))

            // Add new results to collection and update state
            const newResults = resultsWithContext.filter((r) => r && r.text) as SearchResult[]
            const filteredNewResults = filterOutStickyNotes(newResults)

            // Fetch full content for each result
            const fullResults = await Promise.all(
              filteredNewResults.map(async (result) => {
                try {
                  // Skip loading for results that already have full content
                  if (result.metadata.sourceType === 'web' && result.text.length > 500) {
                    return result
                  }

                  const response = await trpcClient.content.fetch.query(result.metadata.path)
                  if (response.content) {
                    return {
                      ...result,
                      text: response.content
                    }
                  }
                  return result
                } catch (error) {
                  console.error('Error loading full content:', error)
                  return result
                }
              })
            )

            allResults = [...allResults, ...fullResults]

            // Fetch sources for new results
            const newSources = await fetchSources(fullResults)
            allSources = [...allSources, ...newSources]

            // Update the searchResults state with accumulated results
            setSearchResults((prev) => {
              const combined = [...prev, ...fullResults]
              // Remove duplicates based on path
              const unique = combined.filter(
                (result, index, self) =>
                  index === self.findIndex((r) => r.metadata.path === result.metadata.path)
              )
              return filterOutStickyNotes(unique)
            })

            // Update search step with results
            setSearchSteps((prev) =>
              prev.map((step) =>
                step.id === searchStepId
                  ? {
                      ...step,
                      status: 'complete',
                      results: newResults
                    }
                  : step
              )
            )

            // Add thinking step for evaluation
            const evalStepId = uuidv4()
            setSearchSteps((prev) => [
              ...prev,
              {
                id: evalStepId,
                query: 'Evaluating results...',
                status: 'thinking'
              }
            ])

            // Evaluate and get answer with suggestions
            const evaluation = await evaluateSearchResults(originalQuery, subQuery, allResults)

            if (evaluation.hasAnswer && evaluation.answer) {
              try {
                const parsedAnswer = JSON.parse(evaluation.answer)

                // Update search steps with the actual answer
                setSearchSteps((prev) =>
                  prev.map((step) => {
                    if (step.id === searchStepId) {
                      return {
                        ...step,
                        status: 'complete',
                        results: results as SearchResult[]
                      }
                    }
                    if (step.id === evalStepId) {
                      return {
                        ...step,
                        status: 'complete',
                        query: 'Found relevant information',
                        answer:
                          parsedAnswer.answer.slice(0, 50) +
                          (parsedAnswer.answer.length > 50 ? '...' : '')
                      }
                    }
                    return step
                  })
                )

                subQueryAnswers.push({
                  query: subQuery,
                  answer: parsedAnswer.answer
                })

                // Update current context
                currentContext = subQueryAnswers
                  .map((sqa) => `Q: ${sqa.query}\nA: ${sqa.answer}`)
                  .join('\n\n')

                // If we have an answer and this isn't our first attempt,
                // or if the answer seems comprehensive, stop searching
                if (searchAttempts > 1 || parsedAnswer.answer.length > 200) {
                  keepSearching = false
                  continue
                }
              } catch (error) {
                console.error('Error parsing evaluation answer:', error)
                // If we can't parse the JSON but have an answer, consider it sufficient
                keepSearching = false
                continue
              }
            } else if (evaluation.suggestions && evaluation.suggestions.length > 0) {
              // Only continue searching if we haven't hit the maximum attempts
              if (searchAttempts < MAX_SEARCH_ATTEMPTS) {
                nextQueries.push(...evaluation.suggestions)
              } else {
                keepSearching = false
              }
            } else {
              // If we have no answer and no suggestions, stop searching
              keepSearching = false
            }
          } catch (error) {
            console.error('Search error:', error)
            keepSearching = false
          }
        }

        // Create the subQueryContext from the accumulated answers
        const subQueryContext = subQueryAnswers
          .map((sqa) => `Sub-query: ${sqa.query}\nAnswer: ${sqa.answer}`)
          .join('\n\n')

        const baseModel = provider(currentSettings.model)
        const contextMiddleware = createContextMiddleware({
          getContext: () => '' // Context will be provided in the prompt
        })

        const model = wrapLanguageModel({
          model: baseModel,
          middleware: contextMiddleware
        })

        const textStream = await generateChatResponse(model, originalQuery, subQueryContext)

        // Create conversation before streaming to avoid duplicate entries
        const newConversation: AIResponse = {
          question: originalQuery,
          answer: '',
          timestamp: Date.now(),
          sources: allSources
        }

        // Add conversation only once
        setConversations((prev) => [...prev, newConversation])

        let fullResponse = ''
        for await (const textPart of textStream.textStream) {
          fullResponse += textPart

          // Extract markdown links and update sources
          const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
          const links = Array.from(fullResponse.matchAll(markdownLinkRegex))
          const sources = new Map<string, Source>()

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

          // Update the conversation with the current response
          setConversations((prev) =>
            prev.map((conv, i) =>
              i === prev.length - 1
                ? {
                    ...conv,
                    answer: fullResponse,
                    sources: Array.from(sources.values())
                  }
              : conv
            )
          )
        }
      } catch (error) {
        console.error('AI answer failed:', error)
        // Only add error conversation if we haven't already added a conversation
        setConversations((prev) => {
          const hasCurrentConversation = prev.some(
            (conv) => conv.question === originalQuery && conv.timestamp === Date.now()
          )
          if (!hasCurrentConversation) {
            return [
              ...prev,
              {
                question: originalQuery,
                answer: 'Sorry, I encountered an error while generating the response.',
                timestamp: Date.now(),
                sources: []
              }
            ]
          }
          return prev
        })
      } finally {
        setIsLoading(false)
      }
    },
    [currentSettings, combinedSearchContext, conversations, stickyNotes]
  )

  // Add state machine
  const [searchState, dispatch] = useReducer(searchReducer, { status: 'idle' })

  // Update handleKeyDown to handle Enter key press
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
          setSearchCache((prev) => {
            const newCache = [
              { query, results: filteredResults, timestamp: Date.now() },
              ...prev.filter((item) => item.query !== query)
            ].slice(0, 5)
            return newCache
          })

          // Start background fetch of full content
          filteredResults.forEach(async (result) => {
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

          // Start chat
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

      // ... rest of the keyboard handlers
    },
    [query, searchState, activePanel, selectedIndex, searchResults, conversations, askAIQuestion, showResults, stickyNotes, isLoading]
  )

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
            { query: searchQuery, results: filteredQuickResults, timestamp: Date.now() },
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
  const openAlBERTFolder = useCallback(async () => {
    try {
      await trpcClient.folder.openAlBERT.mutate()
    } catch (error) {
      console.error('Failed to open alBERT folder:', error)
    }
  }, [])

  // Keyboard Event Handler
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

  // Add new interfaces
  interface StickyNote extends SearchResult {
    id: string
    position: { x: number; y: number }
    isDragging?: boolean
  }

  // Add this new function to handle creating sticky notes
  const createStickyNote = (
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
      setSearchResults((prev) => prev.filter((item) => item.metadata.path !== result.metadata.path))
    }
  }

  // Add drag handling functions
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, result: SearchResult) => {
    e.dataTransfer.setData('application/json', JSON.stringify(result))
    setIsDragging(true)
  }

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragging(false)

    try {
      const result = JSON.parse(e.dataTransfer.getData('application/json'))
      const position = {
        x: e.clientX,
        y: e.clientY
      }
      createStickyNote(result, position)

      // If searchResults is empty after removing the item, hide the results panel
      if (searchResults.length === 1) {
        // Will become 0 after createStickyNote
        setShowResults(false)
      }
    } catch (error) {
      console.error('Error creating sticky note:', error)
    }
  }

  // Add this component within App.tsx
  const StickyNoteComponent: React.FC<{
    note: StickyNote
    onClose: (id: string) => void
    onDrag: (id: string, position: { x: number; y: number }) => void
    onEdit: (id: string, newText: string) => void
  }> = ({ note, onClose, onDrag, onEdit }) => {
    const noteRef = useRef<HTMLDivElement>(null)
    const [editText, setEditText] = useState(note.text)

    // Auto-save when text changes
    useEffect(() => {
      const timeoutId = setTimeout(() => {
        if (editText !== note.text) {
          onEdit(note.id, editText)
        }
      }, 500) // Debounce auto-save by 500ms

      return () => clearTimeout(timeoutId)
    }, [editText, note.id, note.text, onEdit])

    return (
      <motion.div
        ref={noteRef}
        drag
        dragMomentum={false}
        style={{
          position: 'fixed',
          left: note.position.x,
          top: note.position.y,
          zIndex: 50
        }}
        onDragEnd={(_, info) => {
          const newPos = {
            x: note.position.x + info.offset.x,
            y: note.position.y + info.offset.y
          }
          onDrag(note.id, newPos)
        }}
        className="group"
      >
        <Card className="w-96 shadow-lg bg-background/95 backdrop-blur-sm border-muted">
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {note.metadata.sourceType === 'web' ? (
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <h3 className="text-sm font-medium leading-none truncate">
                  {note.metadata.title || note.metadata.path.split('/').pop()}
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
              onClick={() => handlePathClick(note.metadata.path, new MouseEvent('click'))}
              title={note.metadata.path}
            >
              {truncateText(note.metadata.path, 60)}
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <ScrollArea className="h-[300px] w-full rounded-md pr-4">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-[280px] font-mono text-sm resize-none bg-transparent border-0 focus-visible:ring-0 p-0"
                placeholder="Start typing..."
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const start = e.currentTarget.selectionStart
                    const end = e.currentTarget.selectionEnd
                    setEditText(
                      editText.substring(0, start) + '  ' + editText.substring(end)
                    )
                    // Set cursor position after the inserted tabs
                    setTimeout(() => {
                      e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2
                    }, 0)
                  }
                }}
              />
            </ScrollArea>
          </CardContent>
          <CardFooter className="p-3 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
              <span>
                Modified: {new Date(note.metadata.modified_at * 1000).toLocaleDateString()}
              </span>
              <span className="text-xs opacity-50 select-none">
                Changes auto-save • Drag to move
              </span>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    )
  }

  // Modify the SearchResults component props to include drag handlers
  interface SearchResultsProps {
    searchResults: SearchResult[]
    selectedIndex: number
    rankedChunks: RankedChunk[]
    onDragStart: (e: React.DragEvent<HTMLDivElement>, result: SearchResult) => void
    onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  }

  // Update the setSearchResults calls to filter out sticky notes
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

  // Update the return statement in App component to include the drag area and sticky notes
  return (
    <div
      className="h-screen w-screen flex items-center justify-center bg-background/0 backdrop-blur-sm"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
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
                {searchSteps.length > 0 && (
                  <div className="px-4 pt-4">
                    <SearchBadges steps={searchSteps} />
                  </div>
                )}
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
                    rankedChunks={rankedChunks}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
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
                    addAIResponseToContext={() => {}}
                    askAIQuestion={askAIQuestion}
                    isLoading={isLoading}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                </CardContent>
              </Card>
            </Suspense>
          )}
        </div>

        <KeyboardShortcuts showDocument={activePanel === 'document'} activePanel={activePanel} />
      </div>

      {/* Sticky Notes Layer */}
      <AnimatePresence>
        {stickyNotes.map((note) => (
          <StickyNoteComponent
            key={note.id}
            note={note}
            onClose={(id) => {
              setStickyNotes((prev) => prev.filter((n) => n.id !== id))
            }}
            onDrag={(id, position) => {
              setStickyNotes((prev) => prev.map((n) => (n.id === id ? { ...n, position } : n)))
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
    </div>
  )
}

export default App
