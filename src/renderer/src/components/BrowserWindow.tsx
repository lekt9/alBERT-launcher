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

interface NetworkPair {
  url: string
  method: string
  request_headers: Record<string, string>
  request_body: any
  response_headers: Record<string, string>
  response_body: any
  status_code: number
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

    // Add function to send network pair to local API
    const sendNetworkPair = async (pair: NetworkPair) => {
      try {
        const result = await trpcClient.network.addPair.mutate(pair)
        if (!result.success) {
          throw new Error(result.error)
        }
        console.log('Successfully sent network pair to API')
      } catch (error) {
        console.error('Error sending network pair to API:', error)
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

            // Track request bodies and headers
            const requestBodies = new Map<string, any>()

            // Monitor network responses
            const responseHandler = async (data: NetworkResponseEvent) => {
              console.log('Network response captured:', data)
              // Process headers to ensure they're all strings
              const processHeaders = (
                headers: Record<string, string | string[]>
              ): Record<string, string> => {
                const processed: Record<string, string> = {}
                Object.entries(headers || {}).forEach(([key, value]) => {
                  processed[key] = Array.isArray(value) ? value.join(', ') : String(value)
                })
                return processed
              }

              // Use headers from the response event
              const requestHeaders = data.request.headers
              console.log('Request headers:', requestHeaders)
              // Create network pair object with processed headers
              const networkPair: NetworkPair = {
                url: data.request.url,
                method: data.request.method,
                request_headers: requestHeaders,
                request_body: requestBodies.get(data.request.url) || null,
                response_headers: processHeaders(data.response.headers || {}),
                response_body: data.response.body || null,
                status_code: data.response.status
              }

              console.log('Sending network pair:', networkPair)

              // Send to local API
              await sendNetworkPair(networkPair)

              // Process HTML content if needed
              if (data.response.headers['content-type']?.includes('text/html')) {
                try {
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
                    await processContent(content.content, data.request.url, content.title)
                  }
                } catch (error) {
                  console.error('Error processing network content:', error)
                }
              }

              // Cleanup
              requestMap.current.delete(data.requestId)
              requestBodies.delete(data.request.url)
              requestHeaders.delete(data.request.url)
            }

            // Remove existing listeners first
            window.electronIpc.removeListener('network-request-complete', responseHandler)

            // Add new listeners
            window.electronIpc.on('network-request-complete', responseHandler)
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
          webview.current
            ?.executeJavaScript(
              `
            new Promise((resolve) => {
              const content = {
                title: document.title,
                content: document.documentElement.outerHTML,
                text: document.body.innerText
              };
              resolve(content);
            })
          `
            )
            .then((content) => {
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
          <webview ref={ref} src={url || 'about:blank'} className="w-full h-full" />
        </CardContent>
      </Card>
    )
  }
)

BrowserWindow.displayName = 'BrowserWindow'

export default BrowserWindow
