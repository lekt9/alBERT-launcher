export class URLHandler {
  private static instance: URLHandler;
  private webviewRef: React.RefObject<Electron.WebviewTag> | null = null;
  private setIsBrowserVisible: ((visible: boolean) => void) | null = null;
  private setCurrentUrl: ((url: string) => void) | null = null;

  private constructor() {}

  public static getInstance(): URLHandler {
    if (!URLHandler.instance) {
      URLHandler.instance = new URLHandler();
    }
    return URLHandler.instance;
  }

  public initialize(
    webviewRef: React.RefObject<Electron.WebviewTag>,
    setIsBrowserVisible: (visible: boolean) => void,
    setCurrentUrl: (url: string) => void
  ) {
    this.webviewRef = webviewRef;
    this.setIsBrowserVisible = setIsBrowserVisible;
    this.setCurrentUrl = setCurrentUrl;
  }

  public isUrl(input: string): boolean {
    const processed = input.trim().toLowerCase();
    return (
      processed.startsWith('http://') ||
      processed.startsWith('https://') ||
      processed.startsWith('localhost') ||
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(processed) || // IP address
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}/.test(processed) // Domain name
    );
  }

  public processUrl(input: string): string {
    let url = input.trim();
    
    // Handle common search engine shortcuts
    if (/^(g|google)\s+/.test(url)) {
      return `https://www.google.com/search?q=${encodeURIComponent(url.replace(/^(g|google)\s+/, ''))}`;
    }
    
    // If it's already a valid URL, ensure it has a protocol
    if (url.includes('.')) {
      // Remove any leading/trailing whitespace and common prefixes
      url = url.replace(/^(?:https?:\/\/)?(?:www\.)?/, '');
      
      // Handle IP addresses
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)) {
        return `http://${url}`;
      }
      
      // Handle localhost
      if (url.startsWith('localhost')) {
        return `http://${url}`;
      }
      
      // Handle valid domains
      if (/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}/.test(url)) {
        return `https://${url}`;
      }
    }
    
    // If it doesn't look like a URL, treat it as a search query
    return `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
  }

  public async handleUrl(url: string): Promise<void> {
    // if (!this.webviewRef?.current || !this.setIsBrowserVisible || !this.setCurrentUrl) {
    //   console.error('URLHandler not properly initialized');
    //   return;
    // }

    const processedUrl = url.startsWith('http') ? url : `https://${url}`;
    
    try {
      // First set the current URL
      this.setCurrentUrl(processedUrl);
      
      // Then load the URL in the webview
      await this.webviewRef.current.loadURL(processedUrl);
      
      // Finally make the browser visible after URL is loaded
      this.setIsBrowserVisible(true);
    } catch (error) {
      console.error('Error loading URL:', error);
      if (!this.isUrl(url)) {
        const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
        await this.webviewRef.current.loadURL(searchUrl);
      }
      // Still show the browser even if there was an error
      this.setIsBrowserVisible(true);
    }
  }
}

export const urlHandler = URLHandler.getInstance(); 