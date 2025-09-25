export interface SearchResult {
  text: string;
  dist: {
    corpus_id: number;
    score: number;
    text: string;
  };
  metadata: {
    path: string;
    title?: string;
    created_at: number;
    modified_at: number;
    filetype: string;
    languages: string[];
    links: string[];
    owner: string | null;
    seen_at: number;
    sourceType?: 'document' | 'web';
  };
  queryContext?: {
    query: string;
    subQueries?: Array<{
      query: string;
      answer: string;
    }>;
  };
}

export interface CachedSearch {
  query: string;
  results: SearchResult[];
  timestamp: number;
}

export type PanelState = 'none' | 'settings' | 'response' | 'document' | 'chat';

export type SearchState =
  | { status: 'idle' }
  | { status: 'searching'; query: string; shouldChat?: boolean }
  | { status: 'searched'; query: string; results: SearchResult[] }
  | { status: 'chatting'; query: string; results: SearchResult[] }
  | { status: 'error'; error: string };

export interface StickyNote extends SearchResult {
  id: string;
  position: { x: number; y: number };
  isDragging?: boolean;
}
