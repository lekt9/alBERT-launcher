# API Documentation

## Core APIs

### Search API

```typescript
interface SearchResult {
  text: string;
  metadata: {
    path: string;
    created_at: number;
    modified_at: number;
    filetype: string;
    languages: string[];
    links: string[];
    owner: string | null;
    seen_at: number;
  }
}

// Search endpoints
search.quick(query: string): Promise<SearchResult[]>
search.semantic(query: string, options?: SearchOptions): Promise<SearchResult[]>
search.hybrid(query: string, options?: HybridOptions): Promise<SearchResult[]>
```

### Document API

```typescript
// Document operations
document.fetch(path: string): Promise<string>
document.open(path: string): Promise<boolean>
document.getMetadata(path: string): Promise<DocumentMetadata>
```

### Embeddings API

```typescript
// Generate embeddings
embeddings.embed(text: string | string[]): Promise<number[] | number[][]>

// Rerank results
embeddings.rerank(params: {
  query: string,
  documents: string[],
  options?: {
    top_k?: number,
    return_documents?: boolean
  }
}): Promise<RankResult[]>
```

## Configuration

### Settings Interface

```typescript
interface Settings {
  indexing: {
    batchSize: number;
    maxFileSize: number;
    excludedPaths: string[];
    fileTypes: string[];
  };
  search: {
    maxResults: number;
    minScore: number;
    useHybrid: boolean;
  };
  privacy: {
    useLocalModel: boolean;
    modelName: string;
    apiEndpoint?: string;
  };
}
```

### Local LLM Settings

```typescript
interface LLMConfig {
  baseUrl: string;  // Default: http://localhost:11434
  model: string;    // Default: llama2
  options: {
    temperature: number;
    top_p: number;
    max_tokens: number;
  };
}
```

## Events

### File System Events

```typescript
interface FileEvent {
  type: 'create' | 'modify' | 'delete' | 'move';
  path: string;
  newPath?: string;  // For move events
}

// Event handlers
onFileChange(callback: (event: FileEvent) => void): void
onIndexComplete(callback: (stats: IndexStats) => void): void
```

### Search Events

```typescript
interface SearchEvent {
  query: string;
  results: SearchResult[];
  timing: {
    total: number;
    embedding: number;
    search: number;
    rerank: number;
  };
}

onSearch(callback: (event: SearchEvent) => void): void
```

## Error Handling

```typescript
interface SearchError {
  code: string;
  message: string;
  details?: any;
}

// Error types
const ErrorCodes = {
  EMBEDDING_FAILED: 'EMBEDDING_FAILED',
  SEARCH_FAILED: 'SEARCH_FAILED',
  INDEX_FAILED: 'INDEX_FAILED',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  MODEL_LOAD_FAILED: 'MODEL_LOAD_FAILED'
} as const;
```

## IPC Communication

```typescript
// Main to Renderer
interface MainToRenderer {
  'search-results': SearchResult[];
  'indexing-progress': IndexProgress;
  'error': SearchError;
}

// Renderer to Main
interface RendererToMain {
  'search': string;
  'open-file': string;
  'update-settings': Settings;
}
```

## Database Schema

```typescript
// Weaviate schema
const schema = {
  class: 'File',
  properties: [
    { name: 'path', dataType: ['string'] },
    { name: 'content', dataType: ['text'] },
    { name: 'filename', dataType: ['string'] },
    { name: 'extension', dataType: ['string'] },
    { name: 'lastModified', dataType: ['number'] },
    { name: 'hash', dataType: ['string'] }
  ],
  vectorizer: 'none'
};
