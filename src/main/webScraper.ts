import { BrowserWindow } from 'electron';
import html2md from 'html-to-md';
import { ScrapingQueue } from './queueService';
import SearchDB from '../db';

export interface ScrapedPage {
  url: string;
  content: string;
  title: string;
}

let browserWindow: BrowserWindow | null = null;

export class WebScraperService {
  private queue: ScrapingQueue;
  private maxRetries = 2;
  private blockedDomains = new Set([
    'duckduckgo.com', // Known problematic domains
  ]);
  private db: SearchDB;

  constructor(db: SearchDB) {
    if (!browserWindow) {
      browserWindow = new BrowserWindow({
        width: 540,
        height: 240,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          autoplayPolicy: 'document-user-activation-required'
        },
      });

      // Handle window closed event
      browserWindow.on('closed', () => {
        browserWindow = null;
      });
    }

    this.queue = new ScrapingQueue();
    this.db = db;
  }

  public async cleanup() {
    this.queue.clear();
  }

  private isBlockedDomain(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.blockedDomains.has(hostname) || 
             Array.from(this.blockedDomains).some(domain => hostname.includes(domain));
    } catch {
      return true; // If URL is invalid, consider it blocked
    }
  }

  public async scrapeDuckDuckGo(searchTerm: string): Promise<void> {
    if (!browserWindow) {
      throw new Error('Browser window not initialized');
    }

    try {
      await this.queue.setCurrentQuery(searchTerm);
      
      // First scrape the DuckDuckGo results page
      const mainPage = await this.scrapePage(`https://duckduckgo.com/?q=${encodeURIComponent(searchTerm)}`);

      // Extract and queue links
      const links = mainPage?.content.match(/\[([^\]]+)\]\(([^)]+)\)/g)
        ?.map(link => {
          const match = link.match(/\[([^\]]+)\]\(([^)]+)\)/);
          return match ? { url: match[2], title: match[1] } : null;
        })
        .filter(link => {
          if (!link || !link.url.startsWith('http')) return false;
          if (this.isBlockedDomain(link.url)) {
            console.log(`Skipping blocked domain: ${link.url}`);
            return false;
          }
          return true;
        })
        ?? [];

      // Add links to queue with initial preview content
      for (const link of links) {
        if (link) {
          await this.queue.addToQueue(link.url, link.title, mainPage?.content || '', searchTerm);
        }
      }

      // Process queue
      while (this.queue.hasMore()) {
        const nextItem = this.queue.getNext();
        if (nextItem) {
          try {
            const page = await this.scrapePage(nextItem.url);
            if (page) {
              await this.db.indexUrl(page.url, page.content, page.title);
            }
          } catch (error) {
            console.error(`Failed to scrape ${nextItem.url} after retries:`, error);
          } finally {
            this.queue.markComplete(nextItem.url);
          }
        }
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      await this.cleanup();
    }
  }

  public async scrapePage(url: string, depth: number = 0, maxDepth: number = 2): Promise<ScrapedPage | null> {
    if (!browserWindow) {
      throw new Error('Browser window not initialized');
    }

    if (depth > maxDepth) {
      console.log(`Max depth reached for ${url}, skipping further recursion`);
      return null;
    }

    try {
      await browserWindow.loadURL(url, {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      const html = await browserWindow.webContents.executeJavaScript(`
        document.body.outerHTML;
      `);

      if (!html || html.trim().length === 0) {
        console.log(`Empty content for ${url}, skipping`);
        return null;
      }

      const content = html2md(html, {renderCustomTags: 'SKIP'});
      if (!content || content.trim().length === 0) {
        console.log(`Failed to convert HTML to markdown for ${url}, skipping`);
        return null;
      }

      // Extract links from the markdown content
      const links = content.match(/\[([^\]]+)\]\(([^)]+)\)/g)
        ?.map(link => {
          const match = link.match(/\[([^\]]+)\]\(([^)]+)\)/);
          return match ? { url: match[2], title: match[1] } : null;
        })
        .filter(link => {
          if (!link || !link.url.startsWith('http')) return false;
          if (this.isBlockedDomain(link.url)) {
            console.log(`Skipping blocked domain: ${link.url}`);
            return false;
          }
          return true;
        }) ?? [];

      // Add discovered links to the queue
      for (const link of links) {
        if (link) {
          await this.queue.addToQueue(link.url, link.title, content);
        }
      }

      const title = new URL(url).pathname.split('/').pop() || 'index';

      return {
        url,
        content,
        title
      };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return null;
    }
  }

  // Static method to cleanup browser window on app quit
  public static cleanup() {
    if (browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.close();
      browserWindow = null;
    }
  }
} 