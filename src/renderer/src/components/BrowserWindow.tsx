import React, { useEffect, useState, forwardRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface BrowserWindowProps {
  url: string
  onNavigate: (url: string, title?: string) => void
}

const BrowserWindow = forwardRef<Electron.WebviewTag, BrowserWindowProps>(
  ({ url, onNavigate }, ref) => {
    const [isReady, setIsReady] = useState(false)
    const requestMap = React.useRef(new Map<string, NetworkRequest>())

    useEffect(() => {
      const webview = ref as React.RefObject<Electron.WebviewTag>
      if (!webview.current) return

      const handleDomReady = (): void => {
        setIsReady(true)

        if (webview.current) {
          const webContentsId = (webview.current as Electron.WebviewTag).getWebContentsId()
          if (webContentsId) {
            window.electronIpc.send('setup-web-request-monitoring', webContentsId)
            
            window.electronIpc.on('network-request-captured', (request: NetworkRequest) => {
              requestMap.current.set(request.url, request)
              console.log('Network request:', {
                ...request,
                timestamp: new Date().toISOString()
              })
            })

            window.electronIpc.on('network-response-captured', (data: NetworkResponseEvent) => {
              const request = requestMap.current.get(data.requestId)
              if (request) {
                console.log('Network request-response pair:', {
                  request,
                  response: data.response,
                  timestamp: new Date().toISOString()
                })
                requestMap.current.delete(data.requestId)
              }
            })
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

      const handleNavigation = (e: Electron.DidNavigateEvent): void => {
        onNavigate(e.url, webview.current?.getTitle())
      }

      const handleTitleUpdate = (e: Electron.PageTitleUpdatedEvent): void => {
        onNavigate(webview.current?.getURL() || '', e.title)
      }

      webview.current.addEventListener('dom-ready', handleDomReady)
      webview.current.addEventListener('did-navigate', handleNavigation)
      webview.current.addEventListener('did-navigate-in-page', handleNavigation)
      webview.current.addEventListener('page-title-updated', handleTitleUpdate)

      return () => {
        if (webview.current) {
          webview.current.removeEventListener('dom-ready', handleDomReady)
          webview.current.removeEventListener('did-navigate', handleNavigation)
          webview.current.removeEventListener('did-navigate-in-page', handleNavigation)
          webview.current.removeEventListener('page-title-updated', handleTitleUpdate)
        }
      }
    }, [ref, onNavigate])

    useEffect(() => {
      const webview = ref as React.RefObject<Electron.WebviewTag>
      console.log('BrowserWindow: URL changed:', url)
      console.log('BrowserWindow: webview ref:', webview.current)

      if (webview.current && isReady && url && url !== 'about:blank') {
        try {
          const processedUrl = url.startsWith('http') ? url : `https://${url}`
          console.log('BrowserWindow: Loading URL:', processedUrl)
          webview.current.loadURL(processedUrl).catch((error) => {
            console.error('BrowserWindow: Error loading URL:', error)
            if (!url.includes('duckduckgo.com')) {
              console.log('BrowserWindow: Falling back to DuckDuckGo search')
              webview.current?.loadURL(`https://duckduckgo.com/?q=${encodeURIComponent(url)}`)
            }
          })
        } catch (error) {
          console.error('BrowserWindow: Error loading URL:', error)
        }
      } else {
        console.log('BrowserWindow: Conditions not met:', {
          hasWebview: !!webview.current,
          isReady,
          url,
          isNotAboutBlank: url !== 'about:blank'
        })
      }
    }, [url, isReady, ref])

    return (
      <Card className="flex-1 bg-background/95 shadow-lg flex flex-col h-full">
        <CardContent className="p-0 flex-1">
          <webview ref={ref} src="https://duckduckgo.com" className="w-full h-full" />
        </CardContent>
      </Card>
    )
  }
)

BrowserWindow.displayName = 'BrowserWindow'

export default BrowserWindow
