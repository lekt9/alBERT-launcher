import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface BrowserWindowProps {
  url: string;
  onNavigate: (url: string, title?: string) => void;
}

const BrowserWindow: React.FC<BrowserWindowProps> = ({ url, onNavigate }) => {
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // Prevent auto-scrolling behavior
    const preventAutoScroll = (e: Event) => {
      e.preventDefault();
    };

    webview.addEventListener('scroll', preventAutoScroll);

    const handleDomReady = () => {
      setIsReady(true);
      
      // Disable focus ring and add smooth scrolling
      webview.insertCSS(`
        * {
          outline: none !important;
          scroll-behavior: smooth;
        }
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
        }
      `);
    };

    // Handle navigation events
    const handleNavigation = (e: Electron.DidNavigateEvent) => {
      onNavigate(e.url, webview.getTitle());
    };

    // Handle title updates
    const handleTitleUpdate = (e: Electron.PageTitleUpdatedEvent) => {
      onNavigate(webview.getURL(), e.title);
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-navigate', handleNavigation);
    webview.addEventListener('did-navigate-in-page', handleNavigation);
    webview.addEventListener('page-title-updated', handleTitleUpdate);

    return () => {
      webview.removeEventListener('scroll', preventAutoScroll);
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-navigate', handleNavigation);
      webview.removeEventListener('did-navigate-in-page', handleNavigation);
      webview.removeEventListener('page-title-updated', handleTitleUpdate);
    };
  }, [onNavigate]);

  // Handle URL changes after initial load
  useEffect(() => {
    const webview = webviewRef.current;
    if (webview && isReady && url && url !== 'about:blank') {
      try {
        const processedUrl = url.startsWith('http') ? url : `https://${url}`;
        webview.loadURL(processedUrl).catch(() => {
          // If loading fails, try DuckDuckGo search
          if (!url.includes('duckduckgo.com')) {
            webview.loadURL(`https://duckduckgo.com/?q=${encodeURIComponent(url)}`);
          }
        });
      } catch (error) {
        console.error('Error loading URL:', error);
      }
    }
  }, [url, isReady]);

  return (
    <Card className="flex-1 bg-background/95 shadow-lg flex flex-col h-full">
      <CardContent className="p-0 flex-1">
        <webview
          ref={webviewRef}
          src="https://duckduckgo.com"
          className="w-full h-full"
        />
      </CardContent>
    </Card>
  );
};

export default BrowserWindow; 