# Development Guide

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- pnpm package manager
- Ollama (for local AI)

### Setup
```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Project Structure

```
alBERT-launcher/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── api.ts           # tRPC API endpoints
│   │   ├── db.ts            # Vector database
│   │   ├── embeddings.ts    # Embeddings service
│   │   └── utils/           # Utilities
│   ├── renderer/            # React frontend
│   │   ├── components/      # UI components
│   │   ├── lib/            # Frontend utilities
│   │   └── App.tsx         # Main component
│   └── preload/            # Electron preload
└── electron-builder.json5  # Build config
```

## Core Components

### 1. Vector Database (db.ts)

The `SearchDB` class manages document indexing and search:

```typescript
class SearchDB {
  // Initialize database
  static async getInstance(userDataPath: string): Promise<SearchDB>
  
  // Index operations
  async indexFile(filePath: string): Promise<void>
  async indexDirectory(dirPath: string): Promise<string[]>
  
  // Search
  async search(searchTerm: string): Promise<SearchResult[]>
}
```

Key methods:
- `getInstance`: Singleton instance with database initialization
- `indexFile`: Process and store individual files
- `indexDirectory`: Recursively index directories
- `search`: Semantic search with hybrid retrieval

### 2. Embeddings Service (embeddings.ts)

Handles text vectorization:

```typescript
// Generate embeddings
async function embed(
  text: string | string[],
  batch_size: number = 15
): Promise<number[] | number[][]>

// Rerank results
async function rerank(
  query: string,
  documents: string[],
  options: { top_k?: number }
): Promise<RankResult[]>
```

### 3. API Layer (api.ts)

tRPC router setup:

```typescript
export function getRouter(window: BrowserWindow) {
  return router({
    search: publicProcedure
      .input(z.string())
      .query(({ input }) => searchDB.search(input)),
    
    indexDirectory: publicProcedure
      .input(z.string())
      .mutation(({ input }) => searchDB.indexDirectory(input))
  })
}
```

## Adding Features

### 1. New File Type Support

1. Update `utils/reader.ts`:
```typescript
export async function getContent(filePath: string): Promise<string> {
  const ext = path.extname(filePath)
  switch (ext) {
    case '.your_ext':
      return yourParser(filePath)
    default:
      return defaultParser(filePath)
  }
}
```

2. Add content parser in `utils/`

### 2. Custom Search Features

1. Modify `db.ts` search method:
```typescript
async search(searchTerm: string, options: SearchOptions): Promise<SearchResult[]> {
  // Add your custom search logic
  const vector = await embed(searchTerm)
  return this.client.graphql
    .get()
    .withClassName('File')
    .withHybrid({
      query: searchTerm,
      vector,
      // Add custom parameters
    })
}
```

### 3. UI Components

1. Create component in `renderer/src/components/`
2. Add to main UI in `App.tsx`
3. Add styles in `renderer/src/styles/`

## Testing

```bash
# Run tests
pnpm test

# Run specific test
pnpm test path/to/test
```

## Building

```bash
# Build for production
pnpm build

# Build for specific platform
pnpm build:mac
pnpm build:win
pnpm build:linux
```

## Performance Tips

1. **Batch Processing**
   - Use `embed()` with arrays for batch processing
   - Implement pagination for large result sets

2. **Caching**
   - Cache embeddings for frequently accessed files
   - Use file hashes to detect changes

3. **Worker Management**
   - Reuse worker pools
   - Implement proper cleanup
   - Monitor memory usage

## Troubleshooting

Common issues and solutions:

1. **Indexing Performance**
   - Check file size limits
   - Monitor memory usage
   - Use appropriate batch sizes

2. **Search Quality**
   - Adjust vector similarity thresholds
   - Fine-tune reranking parameters
   - Check text preprocessing

3. **Memory Usage**
   - Monitor worker pool size
   - Implement cleanup handlers
   - Check for memory leaks
