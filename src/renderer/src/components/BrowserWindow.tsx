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
          // Enable required webview features through JavaScript instead of attributes
          webview.current.executeJavaScript(`
            document.body.style.userSelect = 'none';
            document.body.style.webkitUserSelect = 'none';
          `)
          
          const webContentsId = webview.current.getWebContentsId()
          if (webContentsId) {
            window.electronIpc.send('setup-web-request-monitoring', webContentsId)
          }
        }
      }

      const handleDidFailLoad = (e: Electron.DidFailLoadEvent): void => {
        console.error('Failed to load:', e.errorDescription)
        // Optionally implement error handling UI here
      }

      const handleNavigation = (e: Electron.DidNavigateEvent): void => {
        console.log('Navigation event:', e.url)
        if (shouldHandleNavigation(e.url)) {
          onNavigate(e.url, webview.current?.getTitle())
        }
      }

      webview.current.addEventListener('dom-ready', handleDomReady)
      webview.current.addEventListener('did-fail-load', handleDidFailLoad)
      webview.current.addEventListener('did-navigate', handleNavigation)
      webview.current.addEventListener('will-navigate', (e) => {
        console.log('Will navigate to:', e.url)
      })

      return () => {
        if (webview.current) {
          webview.current.removeEventListener('dom-ready', handleDomReady)
          webview.current.removeEventListener('did-fail-load', handleDidFailLoad)
          webview.current.removeEventListener('did-navigate', handleNavigation)
        }
      }
    }, [ref, onNavigate])

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
            src={url || 'about:blank'} 
            className="w-full h-full"
            partition="persist:main"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          />
        </CardContent>
      </Card>
    )
  }
)

BrowserWindow.displayName = 'BrowserWindow'

export default BrowserWindow
