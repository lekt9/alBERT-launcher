import React, { useEffect, useState, forwardRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { NetworkRequest, NetworkResponseEvent } from '../../../preload/index.d.ts'
import { trpcClient } from '../util/trpc-client'

interface BrowserWindowProps {
  url: string
  onNavigate: (url: string, title?: string) => void
  onNetworkContent?: (networkContent: {
    url: string
    title: string
    text: string
    timestamp: string
  }) => void
}

const BrowserWindow = forwardRef<Electron.WebviewTag, BrowserWindowProps>(
  ({ url, onNavigate, onNetworkContent }, ref) => {
    const [isReady, setIsReady] = useState(false)
    const requestMap = React.useRef(new Map<string, NetworkRequest>())
    const lastNavigationUrl = React.useRef<string>('')
    const lastNavigationTime = React.useRef<number>(0)

    const processContent = async (html: string, url: string, title: string) => {
      try {
        // Extract content using the markdown service
        const result = await trpcClient.markdown.extractContent.query({
          html,
          url
        })

        console.log('BrowserWindow: Extracted content:', result)

        if (result.success && result.content) {
          // Send to parent for search results
          onNetworkContent?.({
            url,
            title,
            text: result.content.markdown,
            timestamp: new Date().toISOString()
          })

          // Index the content
          await trpcClient.indexing.indexUrl.mutate({
            url,
            content: result.content.markdown,
            title,
            depth: 0,
            maxDepth: 2
          })
        }
      } catch (error) {
        console.error('Error processing content:', error)
      }
    }

    const indexPageContent = async (url: string) => {
      const webview = (ref as React.RefObject<Electron.WebviewTag>).current
      if (!webview) return

      try {
        // Get page content
        const content = await webview.executeJavaScript(`
          new Promise((resolve) => {
            const content = {
              title: document.title,
              content: document.documentElement.outerHTML,
              text: document.body.innerText
            };
            resolve(content);
          })
        `)

        await processContent(content.content, url, content.title)
      } catch (error) {
        console.error('Error indexing page content:', error)
      }
    }

    useEffect(() => {
      const webview = ref as React.RefObject<Electron.WebviewTag>
      if (!webview.current) return

      const handleDomReady = (): void => {
        setIsReady(true)

        if (webview.current) {
          const webContentsId = (webview.current as Electron.WebviewTag).getWebContentsId()
          if (webContentsId) {
            window.electronIpc.send('setup-web-request-monitoring', webContentsId)

            // Monitor network requests
            window.electronIpc.on('network-request-captured', (request: NetworkRequest) => {
              requestMap.current.set(request.url, request)
            })

            // Monitor network responses
            window.electronIpc.on(
              'network-response-captured',
              async (data: NetworkResponseEvent) => {
                const request = requestMap.current.get(data.requestId)
                if (request) {
                  // Only process HTML content
                  if (data.response.headers['content-type']?.includes('text/html')) {
                    try {
                      // Get content from the URL
                      const content = await webview.current?.executeJavaScript(`
                        new Promise((resolve) => {
                          const content = {
                            title: document.title,
                            content: document.documentElement.outerHTML,
                            text: document.body.innerText
                          };
                          resolve(content);
                        })
                      `)

                      await processContent(content.content, request.url, content.title)
                    } catch (error) {
                      console.error('Error processing network content:', error)
                    }
                  }
                  requestMap.current.delete(data.requestId)
                }
              }
            )
          }
        }

        webview.current?.insertCSS(`
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
        `)
      }

      const shouldHandleNavigation = (newUrl: string): boolean => {
        const now = Date.now()
        if (newUrl === lastNavigationUrl.current && now - lastNavigationTime.current < 1000) {
          return false
        }
        lastNavigationUrl.current = newUrl
        lastNavigationTime.current = now
        return true
      }

      const handleNavigation = (e: Electron.DidNavigateEvent): void => {
        if (shouldHandleNavigation(e.url)) {
          onNavigate(e.url, webview.current?.getTitle())
          // Index content after navigation
          indexPageContent(e.url)
        }
      }

      const handleTitleUpdate = (e: Electron.PageTitleUpdatedEvent): void => {
        const currentUrl = webview.current?.getURL() || ''
        if (shouldHandleNavigation(currentUrl)) {
          onNavigate(currentUrl, e.title)
        }
      }

      webview.current.addEventListener('dom-ready', handleDomReady)
      webview.current.addEventListener('did-navigate', handleNavigation)
      webview.current.addEventListener('page-title-updated', handleTitleUpdate)

      return () => {
        if (webview.current) {
          webview.current.removeEventListener('dom-ready', handleDomReady)
          webview.current.removeEventListener('did-navigate', handleNavigation)
          webview.current.removeEventListener('page-title-updated', handleTitleUpdate)
        }
      }
    }, [ref, onNavigate, onNetworkContent])

    useEffect(() => {
      const webview = ref as React.RefObject<Electron.WebviewTag>
      if (webview.current && isReady && url) {
        try {
          const processedUrl = url.startsWith('http') ? url : `https://${url}`
          if (shouldHandleNavigation(processedUrl)) {
            console.log('BrowserWindow: Loading URL:', processedUrl)
            webview.current.loadURL(processedUrl).catch((error) => {
              console.error('BrowserWindow: Error loading URL:', error)
              if (!url.includes('duckduckgo.com')) {
                webview.current?.loadURL(`https://duckduckgo.com/?q=${encodeURIComponent(url)}`)
              }
            })
          }
        } catch (error) {
          console.error('BrowserWindow: Error loading URL:', error)
        }
      }
    }, [url, isReady, ref])

    const shouldHandleNavigation = (newUrl: string): boolean => {
      const now = Date.now()
      if (newUrl === lastNavigationUrl.current && now - lastNavigationTime.current < 1000) {
        return false
      }
      lastNavigationUrl.current = newUrl
      lastNavigationTime.current = now
      return true
    }

    return (
      <Card className="flex-1 bg-background/95 shadow-lg flex flex-col h-full">
        <CardContent className="p-0 flex-1">
          <webview 
            ref={ref} 
            src={url || "https://www.duckduckgo.com"} 
            className="w-full h-full" 
          />
        </CardContent>
      </Card>
    )
  }
)

BrowserWindow.displayName = 'BrowserWindow'

export default BrowserWindow
