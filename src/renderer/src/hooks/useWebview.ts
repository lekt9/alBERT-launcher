import { useRef, useState, useCallback } from 'react';

export function useWebview() {
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [pageTitle, setPageTitle] = useState('');
  const [currentUrl, setCurrentUrl] = useState('https://duckduckgo.com');

  const handleNavigate = useCallback((url: string, title?: string) => {
    setCurrentUrl(url);
    if (title) setPageTitle(title);
  }, []);

  const handleUrlChange = useCallback((url: string) => {
    setCurrentUrl(url);
    if (webviewRef.current) {
      webviewRef.current.loadURL(url).catch((error) => {
        console.error('Error loading URL:', error);
        if (!url.includes('duckduckgo.com')) {
          webviewRef.current?.loadURL(`https://duckduckgo.com/?q=${encodeURIComponent(url)}`);
        }
      });
    }
  }, []);

  const handleNavigation = useCallback((direction: 'back' | 'forward' | 'reload') => {
    const webview = webviewRef.current;
    if (!webview) return;

    switch (direction) {
      case 'back':
        webview.goBack();
        break;
      case 'forward':
        webview.goForward();
        break;
      case 'reload':
        webview.reload();
        break;
    }
  }, []);

  return {
    webviewRef,
    canGoBack,
    canGoForward,
    pageTitle,
    currentUrl,
    handleNavigate,
    handleUrlChange,
    handleNavigation,
  };
} 