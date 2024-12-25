# Technical Architecture

## System Overview

alBERT-launcher uses a modern architecture built on Electron with these key components:

```mermaid
graph TD
    A[Electron App] --> B[Main Process]
    A --> C[Renderer Process]
    
    subgraph "Main Process Components"
        B --> D[Vector DB]
        B --> E[Embeddings Engine]
        B --> F[File Watcher]
        B --> G[IPC Bridge]
    end
    
    subgraph "Renderer Components"
        C --> H[React UI]
        C --> I[Search Interface]
        C --> J[Results View]
    end

    subgraph "Local AI"
        K[Ollama]
        E --> K
    end
```

## Core Systems

### 1. Vector Database

Uses Weaviate Embedded for document storage and retrieval:

```mermaid
graph LR
    A[Document] --> B[Text Extraction]
    B --> C[Chunking]
    C --> D[Vectorization]
    D --> E[Storage]
    
    F[Query] --> G[Query Vector]
    G --> H[Vector Search]
    E --> H
    H --> I[Results]
```

Key features:
- Zero-config embedded database
- Local-first architecture
- Automatic schema management
- Efficient vector storage
- Hybrid search capabilities

### 2. Embeddings Engine

Text vectorization system:

```mermaid
graph TD
    A[Text Input] --> B[Preprocessing]
    B --> C[Batching]
    C --> D[Worker Pool]
    D --> E[Local Model]
    E --> F[Vector Output]
```

Features:
- Local model inference
- Parallel processing
- Smart batching
- Memory management
- Automatic cleanup

### 3. File System Integration

Monitors and indexes the file system:

```mermaid
graph TD
    A[File System Events] --> B[Event Filter]
    B --> C{Event Type}
    C -->|Create| D[Index New]
    C -->|Modify| E[Update]
    C -->|Delete| F[Remove]
    
    D --> G[Vector DB]
    E --> G
    F --> G
```

Features:
- Real-time monitoring
- Incremental updates
- Change detection
- Automatic cleanup

## Data Flow

### Search Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Interface
    participant S as Search Engine
    participant V as Vector DB
    participant M as Model
    
    U->>UI: Enter Query
    UI->>S: Process Query
    S->>M: Generate Vector
    S->>V: Search
    V-->>S: Raw Results
    S->>M: Rerank
    M-->>S: Final Results
    S->>UI: Display
```

### Indexing Flow

```mermaid
sequenceDiagram
    participant FS as File System
    participant W as Watcher
    participant P as Processor
    participant M as Model
    participant DB as Vector DB
    
    FS->>W: File Changed
    W->>P: Process File
    P->>M: Generate Vector
    P->>DB: Store
    DB-->>P: Confirm
    P-->>W: Complete
```

## Performance Optimizations

### 1. Search Performance

- Vector quantization
- Result caching
- Parallel processing
- Smart batching
- Hybrid search

### 2. Memory Management

- Worker pool reuse
- Batch processing
- Automatic cleanup
- Resource monitoring
- Memory limits

### 3. Storage Efficiency

- Incremental updates
- Change detection
- Smart caching
- Compression
- Deduplication

## Privacy Features

### 1. Local Processing

All core operations run locally:
- Vector database
- Model inference
- File indexing
- Search processing

### 2. Data Control

- No cloud dependencies
- No external APIs
- Local file access only
- No telemetry

### 3. Security

- File hashing
- Access control
- Sandboxed execution
- Secure IPC
