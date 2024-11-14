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

    useEffect(() => {
      const webview = ref as React.RefObject<Electron.WebviewTag>
      if (!webview.current) return

      const handleDomReady = (): void => {
        setIsReady(true)

        if (webview.current) {
          const webContentsId = webview.current.getWebContentsId()
          if (webContentsId) {
            // Set up network monitoring
            window.electronIpc.send('setup-web-request-monitoring', webContentsId)

            // Clean up existing listeners if any
            const requestHandler = (request: NetworkRequest) => {
              console.log('Network request captured:', request)
              requestMap.current.set(request.url, request)
            }

            const responseHandler = async (data: NetworkResponseEvent) => {
              console.log('Network response captured:', data)
              const request = requestMap.current.get(data.requestId)
              if (request) {
                const contentType = data.response.headers['content-type']
                if (contentType?.includes('text/html')) {
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

                    if (content) {
                      await processContent(content.content, request.url, content.title)
                    }
                  } catch (error) {
                    console.error('Error processing network content:', error)
                  }
                }
                requestMap.current.delete(data.requestId)
              }
            }

            // Remove existing listeners first
            window.electronIpc.removeListener('network-request-captured', requestHandler)
            window.electronIpc.removeListener('network-response-captured', responseHandler)

            // Add new listeners
            window.electronIpc.on('network-request-captured', requestHandler)
            window.electronIpc.on('network-response-captured', responseHandler)
          }
        }

        // Add custom CSS
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

      const handleNavigation = (e: Electron.DidNavigateEvent): void => {
        if (shouldHandleNavigation(e.url)) {
          onNavigate(e.url, webview.current?.getTitle())
          // Process page content after navigation
          webview.current?.executeJavaScript(`
            new Promise((resolve) => {
              const content = {
                title: document.title,
                content: document.documentElement.outerHTML,
                text: document.body.innerText
              };
              resolve(content);
            })
          `).then(content => {
            if (content) {
              processContent(content.content, e.url, content.title)
            }
          })
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
          
          // Remove network listeners
          const requestHandler = (request: NetworkRequest) => {
            requestMap.current.set(request.url, request)
          }
          const responseHandler = async (data: NetworkResponseEvent) => {
            const request = requestMap.current.get(data.requestId)
            if (request) {
              requestMap.current.delete(data.requestId)
            }
          }
          window.electronIpc.removeListener('network-request-captured', requestHandler)
          window.electronIpc.removeListener('network-response-captured', responseHandler)
        }
      }
    }, [ref, onNavigate, onNetworkContent])

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
            src={url || "about:blank"} 
            className="w-full h-full" 
          />
        </CardContent>
      </Card>
    )
  }
)

BrowserWindow.displayName = 'BrowserWindow'

export default BrowserWindow
