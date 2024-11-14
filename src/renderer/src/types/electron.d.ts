interface Window {
  electron: {
    getWebContents: (id: number) => {
      debugger: {
        attach: (protocolVersion: string) => Promise<void>;
        detach: () => Promise<void>;
        isAttached: () => Promise<boolean>;
        sendCommand: (method: string, params?: unknown) => Promise<unknown>;
        on: (event: string, callback: (event: unknown) => void) => () => void;
      };
    } | null;
    onNavigationStateUpdate: (callback: (state: {
      canGoBack: boolean;
      canGoForward: boolean;
      currentUrl: string;
      title: string;
    }) => void) => () => void;
  };
} 