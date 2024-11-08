import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { trpcClient } from './util/trpc-client'
import {
  splitContent,
  calculateSimilarity,
  cn,
  calculateStandardDeviation,
  highlightMatches
} from '@/lib/utils'
import { debounce } from '@/lib/utils'
import SearchBar from '@/components/SearchBar'
import AIResponseCard from '@/components/AIResponseCard'
import SearchResults from '@/components/SearchResults'
import ContextTabs from '@/components/ContextTabs'
const SettingsPanel = React.lazy(() => import('@/components/SettingsPanel'))
const DocumentViewer = React.lazy(() => import('@/components/DocumentViewer'))
import { KeyboardShortcuts } from '@/components/navigation/KeyboardShortcuts'
import { streamText, experimental_wrapLanguageModel as wrapLanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createContextMiddleware } from './lib/context-middleware'
import { LLMSettings, ContextTab } from './types'
import type { SearchBarRef } from '@/components/SearchBar'

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
  }
}

interface AIResponse {
  question: string
  answer: string
  timestamp: number
}

function App() {
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

  const [currentConversation, setCurrentConversation] = useState<AIResponse | null>(null)
  const [contextDocuments, setContextDocuments] = useState<Document[]>([])
  const [hoveredCardPath, setHoveredCardPath] = useState<string | null>(null)

  const [contextTabs, setContextTabs] = useState<ContextTab[]>([])

  const [activePanel, setActivePanel] = useState<'none' | 'chat' | 'document' | 'settings'>('none')

  const searchBarRef = useRef<SearchBarRef>(null)

  // Add this near your other state definitions
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  // Add this near your other useMemo hooks
  const combinedSearchContext = useMemo(() => {
    const MAX_CONTEXT_LENGTH = 40000
    const CHUNK_SIZE = 500
    const CHUNK_OVERLAP = 20

    // Process search results
    const searchResultDocs = searchResults.map((result) => ({
      content: result.text,
      path: result.metadata.path,
      similarity: 1 - result.dist, // Convert distance to similarity (0-1)
      type: 'search'
    }))

    // Process pinned documents (context tabs)
    const pinnedDocs = contextTabs.map((tab) => ({
      content: tab.content,
      path: tab.path,
      similarity: tab.metadata?.matchScore || 0,
      type: 'pinned'
    }))

    // Combine and sort documents by similarity
    const allDocs = [...pinnedDocs, ...searchResultDocs].sort((a, b) => b.similarity - a.similarity)

    // Process each document into chunks while maintaining document order
    const processedDocs = allDocs.map((doc) => {
      const chunks = splitContent(doc.content, CHUNK_SIZE, CHUNK_OVERLAP)
      return {
        ...doc,
        chunks,
        totalLength: chunks.reduce((acc, chunk) => acc + chunk.length, 0)
      }
    })

    // Build context string while respecting MAX_CONTEXT_LENGTH
    let context = ''
    let remainingLength = MAX_CONTEXT_LENGTH

    // First pass: Add at least one chunk from each document if possible
    processedDocs.forEach((doc) => {
      if (remainingLength > 0 && doc.chunks.length > 0) {
        const firstChunk = doc.chunks[0]
        if (firstChunk.length <= remainingLength) {
          context += `\n\nFrom ${doc.path}${doc.type === 'pinned' ? ' (pinned)' : ''}:\n${firstChunk}`
          remainingLength -= firstChunk.length
        }
      }
    })

    // Second pass: Fill remaining context with additional chunks
    processedDocs.forEach((doc) => {
      // Skip first chunk as it's already been added
      for (let i = 1; i < doc.chunks.length && remainingLength > 0; i++) {
        const chunk = doc.chunks[i]
        if (chunk.length <= remainingLength) {
          context += `\n\nContinued from ${doc.path}:\n${chunk}`
          remainingLength -= chunk.length
        } else {
          break
        }
      }
    })

    return context.trim()
  }, [searchResults, contextTabs])

  // Debounced Search Function
  const debouncedSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setShowResults(false)
        return false
      }
      setIsLoading(true)
      try {
        const fileResults = await trpcClient.search.all.query(searchQuery)

        const processedResults = fileResults.map((result) => {
          const chunks = splitContent(result.text, 500, 20)
          const chunkScores = chunks.map((chunk, index) => ({
            text: chunk,
            score: calculateSimilarity(chunk, searchQuery),
            index
          }))

          const scores = chunkScores.map((c) => c.score)
          const mean = scores.reduce((acc, val) => acc + val, 0) / scores.length
          const stdDev = calculateStandardDeviation(scores)

          const significantChunks = chunkScores
            .filter((chunk) => chunk.score > mean + stdDev)
            .sort((a, b) => b.score - a.score)
            .sort((a, b) => a.index - b.index)
            .map((chunk) => highlightMatches(chunk.text, searchQuery))
            .join('\n\n---\n\n')

          return {
            ...result,
            text: significantChunks || highlightMatches(result.text, searchQuery)
          }
        })

        setSearchResults(processedResults)
        setShowResults(true)
        return true
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
    return () => {
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
          const matchScore = calculateSimilarity(content, query)

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
                    type: 'file',
                    lastModified: Date.now(),
                    matchScore
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
    if (currentConversation) {
      const aiResponseContent = `Q: ${currentConversation.question}\n\nA: ${currentConversation.answer}`
      setContextDocuments((prev) => {
        const exists = prev.some((doc) => doc.content === aiResponseContent)
        if (!exists) {
          return [
            ...prev,
            {
              path: `AI Response (${new Date(currentConversation.timestamp).toLocaleTimeString()})`,
              content: aiResponseContent
            }
          ]
        }
        return prev
      })
      setShowResults(true)
      setActivePanel('document')
    }
  }, [currentConversation])

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

        const contextMiddleware = createContextMiddleware({
          getContext: () => combinedSearchContext
        })

        const model = wrapLanguageModel({
          model: baseModel,
          middleware: contextMiddleware
        })

        const textStream = await streamText({
          model,
          prompt: `Use the following context to answer the question. If the context doesn't contain relevant information, say so. Reply in a punchy manner, using markdown formatting without the codeblocks.

Context:
${combinedSearchContext}

${
  currentConversation
    ? `Previous question: ${currentConversation.question}
Previous answer: ${currentConversation.answer}

`
    : ''
}Question: ${prompt}

Answer:`
        })

        setCurrentConversation({
          question: prompt,
          answer: '',
          timestamp: Date.now()
        })

        let fullResponse = ''
        for await (const textPart of textStream.textStream) {
          fullResponse += textPart
          setCurrentConversation((prev) => ({
            question: prev?.question || prompt,
            answer: fullResponse,
            timestamp: prev?.timestamp || Date.now()
          }))
        }
      } catch (error) {
        console.error('AI answer failed:', error)
        setCurrentConversation({
          question: prompt,
          answer: 'Sorry, I encountered an error while generating the response.',
          timestamp: Date.now()
        })
      } finally {
        setIsLoading(false)
      }
    },
    [
      showResults,
      searchResults,
      contextTabs,
      currentConversation,
      currentSettings,
      combinedSearchContext
    ]
  )

  // Keyboard Event Handler
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (activePanel === 'settings') {
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
          // Toggle settings panel when no tabs are pinned
          setActivePanel((prev) => (prev === 'settings' ? 'none' : 'settings'))
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (selectedIndex !== -1 && searchResults[selectedIndex]) {
          // Pin the selected document to context
          const result = searchResults[selectedIndex]
          if (!contextTabs.some((tab) => tab.path === result.metadata.path)) {
            fetchDocumentContent(result.metadata.path)
          }
        } else if (selectedIndex === -1 && currentConversation) {
          // Pin AI response to context
          const aiResponseContent = `Q: ${currentConversation.question}\n\nA: ${currentConversation.answer}`
          setContextTabs((prev) => {
            const exists = prev.some((tab) => tab.content === aiResponseContent)
            if (!exists) {
              return [
                ...prev,
                {
                  path: `AI Response (${new Date(currentConversation.timestamp).toLocaleTimeString()})`,
                  content: aiResponseContent,
                  isExpanded: false,
                  metadata: {
                    type: 'ai_response',
                    lastModified: currentConversation.timestamp,
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
        if (currentConversation || showResults) {
          const maxIndex = searchResults.length - 1
          setSelectedIndex((prev) => (prev === -1 ? 0 : Math.min(prev + 1, maxIndex)))
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (currentConversation || showResults) {
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
      currentConversation,
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
    return () => window.removeEventListener('keydown', handleKeyDown)
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
    const handleWindowShow = () => {
      searchBarRef.current?.focus()
    }

    window.addEventListener('focus', handleWindowShow)
    return () => window.removeEventListener('focus', handleWindowShow)
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
                <CardContent className="p-4 flex flex-col h-full max-h-[600px]">
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
                    currentConversation || (showResults && searchResults.length > 0)
                      ? 'flex-none'
                      : 'flex-1 justify-center'
                  )}
                >
                  {/* AI Response Section */}
                  {currentConversation && (
                    <AIResponseCard
                      currentConversation={currentConversation}
                      selectedIndex={selectedIndex}
                      addAIResponseToContext={addAIResponseToContext}
                    />
                  )}

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
                      setActivePanel('document')
                      if (!contextDocuments.some((doc) => doc.path === result.metadata.path)) {
                        fetchDocumentContent(result.metadata.path)
                      }
                    }}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Document Viewer */}
          {activePanel === 'document' && (
            <Suspense fallback={<div>Loading Document Viewer...</div>}>
              <DocumentViewer
                contextDocuments={contextDocuments}
                removeFromContext={(path) => {
                  // Logic to remove context
                }}
                hoveredCardPath={hoveredCardPath}
                setHoveredCardPath={setHoveredCardPath}
              />
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
