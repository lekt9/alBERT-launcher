import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, FileText, MessageSquare, Loader2, Lock, LockOpen, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, splitContent } from '@/lib/utils'

import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import ReactMarkdown from 'react-markdown'
import { Switch } from '@/components/ui/switch'
import { motion, AnimatePresence } from 'framer-motion';
import { trpcClient } from './util/trpc-client'

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

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatHistory {
  messages: Message[];
}

interface LLMSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  modelType: 'openai' | 'ollama';
}

// Add these new interfaces
interface ProcessedDocument {
  path: string;
  content: string;
  chunks: string[];
  relevanceScore: number;
}

// Add this new interface
interface AIResponse {
  question: string;
  answer: string;
  timestamp: number;
}

function App() {
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const resultsRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [globalChatHistory, setGlobalChatHistory] = useState<ChatHistory>({
    messages: []
  })
  const [currentSystemMessage, setCurrentSystemMessage] = useState<string>('')
  const [showDocument, setShowDocument] = useState(false)
  const [activePanel, setActivePanel] = useState<'none' | 'chat' | 'document' | 'settings'>('none')
  const [showSettings, setShowSettings] = useState(false)
  const [isPrivate, setIsPrivate] = useState<boolean>(() => {
    const savedPrivacy = localStorage.getItem('llm-privacy')
    return savedPrivacy ? JSON.parse(savedPrivacy) : true
  })
  const [privateSettings, setPrivateSettings] = useState<LLMSettings>(() => {
    const saved = localStorage.getItem('llm-settings-private')
    return saved ? JSON.parse(saved) : {
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
      model: 'llama3.2:3b',
      modelType: 'ollama'
    }
  })
  const [publicSettings, setPublicSettings] = useState<LLMSettings>(() => {
    const saved = localStorage.getItem('llm-settings-public')
    return saved ? JSON.parse(saved) : {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      modelType: 'openai'
    }
  })

  const currentSettings = isPrivate ? privateSettings : publicSettings

  // Add a new state for the current conversation
  const [currentConversation, setCurrentConversation] = useState<AIResponse | null>(null);

  // Add new state for context documents
  const [contextDocuments, setContextDocuments] = useState<{
    path: string;
    content: string;
  }[]>([]);

  // Add these new states to your App component
  const [processedDocuments, setProcessedDocuments] = useState<ProcessedDocument[]>([]);
  const [combinedContext, setCombinedContext] = useState<string>('');

  // Add this new state to track the hovered card
  const [hoveredCardPath, setHoveredCardPath] = useState<string | null>(null);

  function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => func(...args), wait)
    }
  }

  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setShowResults(false)
        return
      }
      setIsLoading(true)
      try {
        // Get screen context
        // const captureScreen = await window.ipcRenderer.invoke('capture-screen')
        
        // Get file search results only
        const fileResults = await trpcClient.search.files.query(searchQuery)
        
        // Set results directly without AI option
        setSearchResults(fileResults)
        setShowResults(true)
      } catch (error) {
        console.error('Search failed:', error)
        setSearchResults([])
        setShowResults(false)
      } finally {
        setIsLoading(false)
      }
    }, 1000),
    [currentSettings]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value
    setQuery(newQuery)
    setSelectedIndex(-1)
    debouncedSearch(newQuery)
  }

  // Modify the copyToClipboard function
  const copyToClipboard = async (text: string, hideAfter: boolean = true, includeContext: boolean = false) => {
    try {
      let contentToCopy = text;
      
      if (includeContext) {
        if (activePanel === 'document' && contextDocuments.length > 0) {
          // If we're in document panel, copy the context documents
          contentToCopy = contextDocuments
            .map(doc => `From ${doc.path}:\n${doc.content}`)
            .join('\n\n');
        } else if (showResults && selectedIndex >= 0) {
          // If we're in search results with a selection
          const selectedResult = searchResults[selectedIndex];
          const processedDoc = processedDocuments.find(doc => doc.path === selectedResult.metadata.path);
          
          if (processedDoc) {
            contentToCopy = `Selected content from ${selectedResult.metadata.path}:\n${selectedResult.text}\n\nRelevant context:\n${processedDoc.chunks.join('\n\n')}`;
          } else {
            contentToCopy = selectedResult.text;
          }
        } else {
          // If nothing is selected, use the search query and results
          contentToCopy = `Query: ${query}\n\nResults:\n${searchResults
            .map(result => `${result.metadata.path}:\n${result.text}`)
            .join('\n\n')}`;
        }
      }
      
      await navigator.clipboard.writeText(contentToCopy);
      if (hideAfter) {
        trpcClient.window.hide.mutate();
      }
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Add this new utility function
  const processDocumentContent = (content: string, query: string): ProcessedDocument[] => {
    const MAX_CONTEXT_LENGTH = 10000;
    const chunks = splitContent(content, 1000, 100);
    
    // Calculate similarity scores for each chunk
    // This is a simple implementation - you may want to use a more sophisticated similarity metric
    const scoredChunks = chunks.map(chunk => ({
      content: chunk,
      score: calculateSimilarity(chunk, query)
    }));

    // Sort chunks by relevance
    scoredChunks.sort((a, b) => b.score - a.score);

    // Select chunks up to MAX_CONTEXT_LENGTH
    let totalLength = 0;
    const selectedChunks = scoredChunks.filter(chunk => {
      if (totalLength + chunk.content.length <= MAX_CONTEXT_LENGTH) {
        totalLength += chunk.content.length;
        return true;
      }
      return false;
    });

    return selectedChunks.map(chunk => ({
      content: chunk.content,
      relevanceScore: chunk.score
    }));
  };

  // Add this similarity calculation function
  const calculateSimilarity = (text: string, query: string): number => {
    // Simple word overlap similarity - you might want to use a more sophisticated method
    const textWords = new Set(text.toLowerCase().split(/\s+/));
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const intersection = new Set([...textWords].filter(x => queryWords.has(x)));
    return intersection.size / Math.max(textWords.size, queryWords.size);
  };

  // Modify your fetchDocumentContent function
  const fetchDocumentContent = async (filePath: string) => {
    if (!filePath) {
      console.error('No file path provided');
      return;
    }

    try {
      const content = await trpcClient.document.fetch.query(filePath);
      if (content) {
        // Process the document content
        const processedContent = processDocumentContent(content, query);
        
        // Update processed documents
        setProcessedDocuments(prev => {
          const newDocs = [...prev];
          const existingIndex = newDocs.findIndex(doc => doc.path === filePath);
          
          if (existingIndex >= 0) {
            newDocs[existingIndex] = {
              path: filePath,
              content: content,
              chunks: processedContent.map(pc => pc.content),
              relevanceScore: Math.max(...processedContent.map(pc => pc.relevanceScore))
            };
          } else {
            newDocs.push({
              path: filePath,
              content: content,
              chunks: processedContent.map(pc => pc.content),
              relevanceScore: Math.max(...processedContent.map(pc => pc.relevanceScore))
            });
          }
          
          return newDocs;
        });

        // Add to context documents as well
        setContextDocuments(prev => {
          const exists = prev.some(doc => doc.path === filePath);
          if (!exists) {
            return [...prev, { path: filePath, content }];
          }
          return prev;
        });

        // Update the combined context
        updateCombinedContext();
        
        setShowDocument(true);
      }
    } catch (error) {
      console.error('Error fetching document:', error);
    }
  };

  // Add this new function to update the combined context
  const updateCombinedContext = useCallback(() => {
    const MAX_CONTEXT_LENGTH = 30000;
    
    // Sort documents by relevance score
    const sortedDocs = [...processedDocuments].sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    let context = '';
    let totalLength = 0;
    
    // Build context from most relevant chunks across all documents
    for (const doc of sortedDocs) {
      for (const chunk of doc.chunks) {
        if (totalLength + chunk.length <= MAX_CONTEXT_LENGTH) {
          context += `\n\nFrom ${doc.path}:\n${chunk}`;
          totalLength += chunk.length;
        } else {
          break;
        }
      }
      if (totalLength >= MAX_CONTEXT_LENGTH) break;
    }
    
    setCombinedContext(context.trim());
  }, [processedDocuments]);

  // Add this function to handle adding AI response to context
  const addAIResponseToContext = () => {
    if (currentConversation) {
      const aiResponseContent = `Q: ${currentConversation.question}\n\nA: ${currentConversation.answer}`;
      setContextDocuments(prev => {
        const exists = prev.some(doc => doc.content === aiResponseContent);
        if (!exists) {
          return [...prev, {
            path: `AI Response (${new Date(currentConversation.timestamp).toLocaleTimeString()})`,
            content: aiResponseContent
          }];
        }
        return prev;
      });
      setShowDocument(true);
      setActivePanel('document');
    }
  };

  // Modify the askAIQuestion function to include timestamp
  const askAIQuestion = async (prompt: string) => {
    setIsLoading(true);
    try {
      // const captureScreen = await window.ipcRenderer.invoke('capture-screen');
      
      const fullPrompt = `
${currentConversation ? `Previous question: ${currentConversation.question}
Previous answer: ${currentConversation.answer}

` : ''}Context from documents:
${combinedContext}

Question: ${prompt}

Please provide a thorough but concise answer based on the provided context.`;

      const model = getConfiguredModel();
      const textStream = await streamText({
        model,
        messages: [
          { role: 'user', content: fullPrompt }
        ],
      });

      // Initialize empty response with timestamp
      setCurrentConversation({
        question: prompt,
        answer: '',
        timestamp: Date.now()
      });

      // Stream the response
      let fullResponse = '';
      for await (const textPart of textStream.textStream) {
        fullResponse += textPart;
        setCurrentConversation(prev => ({
          question: prev?.question || prompt,
          answer: fullResponse,
          timestamp: prev?.timestamp || Date.now()
        }));
      }

    } catch (error) {
      console.error('AI answer failed:', error);
      setCurrentConversation({
        question: prompt,
        answer: "Sorry, I encountered an error while generating the response.",
        timestamp: Date.now()
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showDocument) {
          setShowDocument(false)
          setContextDocuments([]) // Clear all context documents
        } else if (activePanel === 'settings') {
          setActivePanel('none')
          setShowSettings(false)
        } else {
          trpcClient.window.hide.mutate();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (activePanel === 'settings') {
          setActivePanel('none')
          setShowSettings(false)
        } else if (selectedIndex === -1 && currentConversation) {
          addAIResponseToContext();
        } else if (showResults && selectedIndex >= 0) {
          const selectedResult = searchResults[selectedIndex]
          if (selectedResult && 
              selectedResult.metadata.filetype !== 'ai_prompt' && 
              selectedResult.metadata.filetype !== 'ai_response') {
            setShowDocument(true)
            setActivePanel('document')
            if (!contextDocuments.some(doc => doc.path === selectedResult.metadata.path)) {
              fetchDocumentContent(selectedResult.metadata.path)
            }
          }
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (showDocument) {
          setContextDocuments(prev => {
            const newDocs = [...prev.slice(0, -1)]
            if (newDocs.length === 0) {
              setShowDocument(false)
            }
            return newDocs
          })
        } else if (activePanel === 'settings') {
          setActivePanel('none')
          setShowSettings(false)
        } else {
          setActivePanel('settings')
          setShowSettings(true)
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (query.trim()) {
          askAIQuestion(query)
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (currentConversation || showResults) {
          const maxIndex = searchResults.length - 1
          setSelectedIndex((prev) => {
            // If at AI response (-1), move to first search result
            if (prev === -1) return 0
            // Otherwise move down through search results
            return Math.min(prev + 1, maxIndex)
          })
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (currentConversation || showResults) {
          setSelectedIndex((prev) => {
            // If at first search result, move to AI response
            if (prev === 0) return -1
            // If in search results, move up
            if (prev > 0) return prev - 1
            // If at AI response, stay there
            return prev
          })
        }
      } else if ((e.key === 'c' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        if (activePanel === 'document') {
          // Copy context documents when in document panel
          copyToClipboard('', true, true);
        } else if (showResults && searchResults.length > 0) {
          if (selectedIndex >= 0) {
            // Copy selected result with context
            copyToClipboard(searchResults[selectedIndex].text, true, true);
          } else {
            // Copy search results when nothing selected
            copyToClipboard('', true, true);
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, showResults, searchResults, processedDocuments, contextDocuments, activePanel, query, showDocument, currentConversation, addAIResponseToContext, fetchDocumentContent, askAIQuestion, copyToClipboard]);

  useEffect(() => {
    if (resultsRef.current) {
      const cards = resultsRef.current.querySelectorAll('.card-item')
      const selectedCard = cards[selectedIndex]
      
      if (selectedCard) {
        selectedCard.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        })
      }
    }
  }, [selectedIndex])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Add this effect to refocus input when panels change
  useEffect(() => {
    inputRef.current?.focus()
  }, [activePanel, showDocument, showResults])

  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      e.preventDefault() // Prevent losing focus
      inputRef.current?.focus()
      trpcClient.window.hide.mutate();
    }
  }

  const handleResultClick = (result: SearchResult) => {
    if (result && 
        result.metadata.filetype !== 'ai_prompt' && 
        result.metadata.filetype !== 'ai_response') {
      setShowDocument(true)
      setActivePanel('document')
      if (!contextDocuments.some(doc => doc.path === result.metadata.path)) {
        fetchDocumentContent(result.metadata.path)
      }
      inputRef.current?.focus() // Refocus after clicking
    }
  }

  // Update getPanelWidth to handle multiple panels
  const getPanelWidth = () => {
    let totalPanels = 1; // Start with search panel
    if (activePanel === 'settings') totalPanels++;
    if (showDocument) totalPanels++;
    
    // Base width calculations on total panels
    const baseWidth = Math.min(600, window.innerWidth / totalPanels - 16); // 16px for gap
    return baseWidth;
  }

  // Create a Settings component similar to ChatView
  const SettingsView = () => {
    const [localSettings, setLocalSettings] = useState<LLMSettings>(currentSettings)

    const handlePrivacyToggle = (checked: boolean) => {
      setIsPrivate(checked)
      localStorage.setItem('llm-privacy', JSON.stringify(checked))
    }

    const handleSaveSettings = (settings: LLMSettings) => {
      if (isPrivate) {
        setPrivateSettings(settings)
        localStorage.setItem('llm-settings-private', JSON.stringify(settings))
      } else {
        setPublicSettings(settings)
        localStorage.setItem('llm-settings-public', JSON.stringify(settings))
      }
    }

    return (
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button 
            onClick={() => {
              setActivePanel('none')
              setShowSettings(false)
            }} 
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between">
            <div className="grid gap-1">
              <label htmlFor="privacy" className="text-sm font-medium">
                Private Mode
              </label>
              <span className="text-xs text-muted-foreground">
                {isPrivate ? 
                  "Using Ollama locally" : 
                  "Using OpenAI API"}
              </span>
            </div>
            <Switch
              id="privacy"
              checked={isPrivate}
              onCheckedChange={handlePrivacyToggle}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="baseUrl" className="text-sm font-medium">
              Base URL
            </label>
            <Input
              id="baseUrl"
              value={localSettings.baseUrl}
              onChange={(e) => setLocalSettings(prev => ({
                ...prev,
                baseUrl: e.target.value
              }))}
              placeholder={isPrivate ? 
                "http://localhost:11434/v1" : 
                "https://api.openai.com/v1"}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="apiKey" className="text-sm font-medium">
              API Key {isPrivate && "(Optional)"}
            </label>
            <Input
              id="apiKey"
              type="password"
              value={localSettings.apiKey}
              onChange={(e) => setLocalSettings(prev => ({
                ...prev,
                apiKey: e.target.value
              }))}
              placeholder={isPrivate ? "" : "sk-..."}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="model" className="text-sm font-medium">
              Model
            </label>
            <Input
              id="model"
              value={localSettings.model}
              onChange={(e) => setLocalSettings(prev => ({
                ...prev,
                model: e.target.value
              }))}
              placeholder={isPrivate ? 
                "llama3.2:3b" : 
                "gpt-4o-mini"}
            />
          </div>
        </div>
        <div className="mt-auto pt-4 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            onClick={() => {
              setActivePanel('none')
              setShowSettings(false)
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
            onClick={() => {
              handleSaveSettings(localSettings)
              setActivePanel('none')
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    )
  }

  // Create a helper function to get the configured model
  const getConfiguredModel = () => {
    if (currentSettings.modelType === 'openai') {
      const provider = createOpenAI({
        apiKey: currentSettings.apiKey,
        baseUrl: currentSettings.baseUrl,
      })
      return provider(currentSettings.model)
    } else {
      const provider = createOpenAI({
        apiKey: currentSettings.apiKey,
        baseUrl: 'http://localhost:11434/v1',
      })
      return provider(currentSettings.model)
    }
  };

  const handlePrivacyToggle = (checked: boolean) => {
    setIsPrivate(checked)
    localStorage.setItem('llm-privacy', JSON.stringify(checked))

    // Load settings based on the new privacy mode
    if (checked) {
      const savedPrivate = localStorage.getItem('llm-settings-private')
      setPrivateSettings(savedPrivate ? JSON.parse(savedPrivate) : {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        model: 'llama3.2:3b',
        modelType: 'ollama'
      })
    } else {
      const savedPublic = localStorage.getItem('llm-settings-public')
      setPublicSettings(savedPublic ? JSON.parse(savedPublic) : {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-3.5-turbo',
        modelType: 'openai'
      })
    }
  }

  // Add function to remove document from context
  const removeFromContext = (path: string) => {
    setContextDocuments(prev => prev.filter(doc => doc.path !== path));
    if (contextDocuments.length <= 1) {
      setShowDocument(false);
    }
  };

  // Add animation variants
  const cardVariants = {
    initial: {
      x: 0,
      opacity: 0,
      scale: 0.8,
    },
    animate: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.05,
      },
    },
    exit: {
      x: -20,
      opacity: 0,
      scale: 0.8,
      transition: {
        duration: 0.05,
      },
    },
    moveToContext: {
      x: '100%',
      opacity: 1,
      scale: 0.9,
      transition: {
        duration: 0.05,
        ease: 'easeInOut',
      },
    },
  };

  // Modify the calculateCardPositions function to include the index parameter
  const calculateCardPositions = (
    totalCards: number, 
    containerHeight: number, 
    hoveredPath: string | null,
    currentPath: string,
    index: number,
    cardHeight: number = 200
  ) => {
    const minSpacing = 40;
    const availableSpace = containerHeight - cardHeight;
    const spacing = totalCards > 1 ? Math.max(minSpacing, availableSpace / (totalCards - 1)) : 0;
    
    return {
      bottom: index * spacing,
      zIndex: hoveredPath === currentPath ? 999 : index
    };
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showResults || searchResults.length === 0) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(searchResults.length - 1, prev + 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          const selectedResult = searchResults[selectedIndex];
          if (selectedResult) {
            addToContext(selectedResult);
          }
          break;
        case 'Enter':
          e.preventDefault();
          // ... existing Enter key handling
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResults, searchResults, selectedIndex]);

  const addToContext = async (result: SearchResult) => {
    try {
      const content = await trpcClient.document.fetch.query(result.metadata.path);
      setContextDocuments(prev => {
        if (prev.some(doc => doc.path === result.metadata.path)) {
          return prev;
        }
        return [...prev, {
          path: result.metadata.path,
          content: content
        }];
      });
      setShowDocument(true);
    } catch (error) {
      console.error('Error fetching document:', error);
    }
  };

  return (
    <div 
      className="h-screen w-screen flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={handleBackgroundClick}
      onMouseDown={(e) => e.preventDefault()} // Prevent focus loss on container click
    >
      <div className="flex flex-col">
        <div className="flex gap-4 transition-all duration-200">
          {/* Settings Panel */}
          {activePanel === 'settings' && (
            <Card 
              className="bg-white/95 shadow-2xl flex flex-col transition-all duration-200"
              style={{ width: getPanelWidth() }}
              onMouseDown={(e) => e.preventDefault()} // Prevent focus loss on card click
            >
              <CardContent className="p-4 flex flex-col h-full max-h-[600px]">
                <SettingsView />
              </CardContent>
            </Card>
          )}

          {/* Main Search Card */}
          <Card 
            className="bg-white/95 shadow-2xl flex flex-col transition-all duration-200"
            style={{ width: getPanelWidth() }}
            onMouseDown={(e) => e.preventDefault()} // Prevent focus loss on card click
          >
            <CardContent className="p-0 flex-1 flex flex-col h-[600px]">
              <div className="flex flex-col h-full">
                {/* Top Section for AI Response - only shown when there's a response */}
                {currentConversation && (
                  <div className="h-[300px] overflow-hidden">
                    <div 
                      className={cn(
                        "h-full border-b cursor-pointer transition-all duration-200 overflow-y-auto",
                        selectedIndex === -1 
                          ? "bg-accent border-primary"
                          : "hover:bg-accent/50"
                      )}
                      onClick={addAIResponseToContext}
                    >
                      <div className="m-2">
                        <Card 
                          className={cn(
                            "transition-all duration-200",
                            selectedIndex === -1 ? "bg-accent border-primary" : ""
                          )}
                        >
                          <CardContent className="p-3 flex items-start space-x-3">
                            <div className="flex gap-2">
                              <div className="bg-secondary/20 rounded-full p-2 mt-1">
                                <MessageSquare className="h-4 w-4 text-secondary-foreground" />
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-muted-foreground mb-2">
                                {currentConversation.question}
                              </div>
                              <div className="prose prose-sm max-w-none">
                                <ReactMarkdown>{currentConversation.answer}</ReactMarkdown>
                              </div>
                              <div className="flex items-center mt-2 space-x-2">
                                <Badge variant="secondary">AI Response</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(currentConversation.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <div className="flex items-center mt-2 text-xs text-muted-foreground">
                                <span>
                                  {selectedIndex === -1 
                                    ? "Press → to add to context" 
                                    : "Press ↑ to select"}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </div>
                )}

                {/* Center Section for Search */}
                <div className="flex-none">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
                    <Input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={handleInputChange}
                      placeholder={currentConversation ? "Ask a follow-up question..." : "Search..."}
                      className="w-full pl-12 pr-24 py-4 text-xl border-none focus-visible:ring-0 rounded-none"
                      autoFocus
                      onBlur={(e) => {
                        if (!e.relatedTarget?.matches('input, textarea')) {
                          e.target.focus()
                        }
                      }}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {isPrivate ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <LockOpen className="h-4 w-4" />
                          )}
                        </span>
                        <Switch
                          checked={isPrivate}
                          onCheckedChange={(checked) => {
                            handlePrivacyToggle(checked)
                          }}
                          className="data-[state=checked]:bg-green-500"
                        />
                      </div>
                      {isLoading && (
                        <Loader2 className="h-5 w-5 animate-spin ml-2" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Section for Results - takes full remaining space when no AI response */}
                {showResults && searchResults.length > 0 && (
                  <div className={cn(
                    "overflow-hidden",
                    currentConversation ? "h-[250px]" : "h-[550px]"
                  )}>
                    <ScrollArea 
                      className="h-full" 
                      ref={resultsRef}
                    >
                      {searchResults
                        .filter(result => result.metadata.filetype !== 'ai_response')
                        .map((result, index) => (
                          <motion.div
                            key={index}
                            variants={cardVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            layoutId={`card-${result.metadata.path}`}
                            className={cn(
                              "card-item m-2 cursor-pointer",
                              index === selectedIndex ? "z-10" : "z-0"
                            )}
                          >
                            <Card 
                              className={cn(
                                "hover:bg-accent transition-all duration-200",
                                index === selectedIndex ? "bg-accent border-primary" : ""
                              )}
                              onClick={() => handleResultClick(result)}
                            >
                              <CardContent className="p-3 flex items-start space-x-3">
                                <div className="flex gap-2">
                                  <div className="bg-secondary/20 rounded-full p-2 mt-1">
                                    {result.metadata.filetype === 'ai_prompt' ? (
                                      <MessageSquare className="h-4 w-4 text-secondary-foreground" />
                                    ) : (
                                      <FileText className="h-4 w-4 text-secondary-foreground" />
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <h3 className="text-sm font-semibold">
                                    {result.metadata.path.split('/').pop()}
                                  </h3>
                                  <div className="text-xs text-muted-foreground mt-1 prose prose-sm max-w-none">
                                    <ReactMarkdown>{result.text}</ReactMarkdown>
                                  </div>
                                  <div className="flex items-center mt-2 space-x-2">
                                    <span className="text-xs text-muted-foreground">
                                      Modified: {new Date(result.metadata.modified_at * 1000).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                    </ScrollArea>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Document Viewer - For reference, height should match AI response section */}
          {showDocument && (
            <div 
              className="relative"
              style={{ 
                width: getPanelWidth(),
                height: '600px'
              }}
            >
              <div className="absolute top-0 right-0 p-4 z-[1000]">
                <button 
                  onClick={() => {
                    setShowDocument(false);
                    setContextDocuments([]);
                  }} 
                  className="text-white/70 hover:text-white bg-black/20 rounded-full p-2 backdrop-blur-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <AnimatePresence>
                {contextDocuments.map((doc, index) => {
                  const positions = calculateCardPositions(
                    contextDocuments.length, 
                    600, 
                    hoveredCardPath, 
                    doc.path,
                    index
                  );
                  return (
                    <motion.div
                      key={doc.path}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      variants={cardVariants}
                      className="absolute left-0 right-0"
                      style={{
                        bottom: positions.bottom,
                        zIndex: positions.zIndex,
                      }}
                    >
                      <Card 
                        className="bg-white/95 shadow-lg backdrop-blur-sm hover:shadow-xl transition-all duration-200 hover:translate-y-2"
                        onMouseEnter={() => setHoveredCardPath(doc.path)}
                        onMouseLeave={() => setHoveredCardPath(null)}
                      >
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-sm font-semibold">
                              {doc.path.split('/').pop()}
                            </h3>
                            <button
                              onClick={() => removeFromContext(doc.path)}
                              className="text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 p-1"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="prose prose-sm max-w-none max-h-[200px] overflow-y-auto">
                            <ReactMarkdown>{doc.content}</ReactMarkdown>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Navigation hints */}
        <div className="flex justify-center mt-4 text-white/50 text-sm space-x-6">
          <div className="flex items-center space-x-1">
            <kbd className="px-2 py-1 bg-black/20 rounded">↑↓</kbd>
            <span>Navigate</span>
          </div>
          <div className="flex items-center space-x-1">
            <kbd className="px-2 py-1 bg-black/20 rounded">←</kbd>
            <span>
              {showDocument 
                ? 'Remove Last Document' 
                : activePanel === 'settings'
                ? 'Close Settings'
                : 'Open Settings'}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <kbd className="px-2 py-1 bg-black/20 rounded">→</kbd>
            <span>
              {activePanel === 'settings' 
                ? 'Close Settings' 
                : 'Add to Context'}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <kbd className="px-2 py-1 bg-black/20 rounded">Enter</kbd>
            <span>Ask Question</span>
          </div>
          <div className="flex items-center space-x-1">
            <kbd className="px-2 py-1 bg-black/20 rounded">⌘/Ctrl + C</kbd>
            <span>Copy</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
