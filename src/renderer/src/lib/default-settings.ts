import type { LLMSettings } from '../types';

export const DEFAULT_PRIVATE_SETTINGS: Readonly<LLMSettings> = Object.freeze({
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'llama3.2:3b',
  modelType: 'ollama',
});

export const DEFAULT_PUBLIC_SETTINGS: Readonly<LLMSettings> = Object.freeze({
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: 'openai/gpt-4o-mini',
  modelType: 'openai',
});

export const createDefaultPrivateSettings = (): LLMSettings => ({
  ...DEFAULT_PRIVATE_SETTINGS,
});

export const createDefaultPublicSettings = (): LLMSettings => ({
  ...DEFAULT_PUBLIC_SETTINGS,
});
