export interface LLMSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  modelType: 'openai' | 'ollama';
}

export interface ContextTab {
  path: string;
  content: string;
  isExpanded: boolean;
  metadata?: {
    type: string;
    lastModified?: number;
    size?: number;
    language?: string;
    matchScore?: number;
  };
}

export interface Document {
  path: string;
  content: string;
}

export interface Source {
  path: string;
  description?: string;
  relevance?: number;
  preview?: string;
  citations?: string[];
}

export interface AIResponse {
  question: string;
  answer: string;
  timestamp: number;
  sources?: Source[];
}

export interface ChatHistory {
  conversations: AIResponse[]
} 