import SearchDB from '../db';
import { WebScraperService } from './webScraper';

export class SearchService {
  private db: SearchDB;
  
  constructor(db: SearchDB) {
    this.db = db;
  }

  public async searchDuckDuckGo(searchTerm: string): Promise<void> {
    const scraper = new WebScraperService(this.db);
    
    try {
      await scraper.scrapeDuckDuckGo(searchTerm);
    } catch (error) {
      console.error('DuckDuckGo search error:', error);
      throw error;
    } finally {
      await scraper.cleanup();
    }
  }
} 