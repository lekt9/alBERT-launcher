import { SearchResult as BraveSearchResult } from 'brave-search/dist/types'

export interface CommonSearchResult {
  text: string;
  metadata: {
    path: string;
    title?: string;
    created_at: number;
    modified_at: number;
    filetype: string;
    languages: string[];
    links: string[];
    owner: null;
    seen_at: number;
    sourceType?: string;
    description?: string;
  };
}

export type SearchResult = CommonSearchResult | BraveSearchResult; 