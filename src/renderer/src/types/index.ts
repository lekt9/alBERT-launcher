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