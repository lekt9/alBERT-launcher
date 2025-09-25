export interface LLMSettings {
  baseUrl: string
  apiKey: string
  model: string
  modelType: 'openai' | 'ollama'
}

export interface ContextTab {
  path: string
  content: string
  isExpanded: boolean
  metadata?: {
    type: string
    lastModified?: number
    size?: number
    language?: string
    matchScore?: number
  }
}

export interface Document {
  path: string
  content: string
}

export interface Source {
  path: string
  description?: string
  relevance?: number
  preview?: string
  citations?: string[]
}

export interface AIResponse {
  question: string
  answer: string
  timestamp: number
  sources?: Source[]
}

export interface ChatHistory {
  conversations: AIResponse[]
}

export interface SmitheryMCPServer {
  id: string
  slug: string
  name: string
  description?: string
  manifestUrl: string
  queryUrl?: string
  tags?: string[]
  icon?: string
  verified?: boolean
  enabled: boolean
  lastSyncedAt?: string
}

export interface SmitheryContextResult {
  id: string
  serverId: string
  serverName?: string
  title: string
  snippet: string
  url?: string
  score?: number
  tags?: string[]
}

export interface SmitheryDirectoryEntry {
  id: string
  slug: string
  title: string
  description?: string
  manifestUrl?: string
  queryUrl?: string
  tags?: string[]
  verified?: boolean
  icon?: string
}

export interface SmitheryManifest {
  identifier: string
  manifestUrl: string
  payload: Record<string, unknown>
}
