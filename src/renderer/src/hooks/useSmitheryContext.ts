import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SmitheryContextResult, SmitheryMCPServer } from '../types';
import { fetchSmitheryContext } from '../lib/smithery';

interface UseSmitheryContextOptions {
  query: string;
  servers: SmitheryMCPServer[];
  apiKey?: string;
  enabled?: boolean;
  debounceMs?: number;
}

interface UseSmitheryContextResult {
  results: SmitheryContextResult[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches Smithery MCP context for an active query while guarding against
 * duplicate requests, stale responses, and expensive recomputations.
 */
export function useSmitheryContext({
  query,
  servers,
  apiKey,
  enabled = true,
  debounceMs = 150,
}: UseSmitheryContextOptions): UseSmitheryContextResult {
  const [results, setResults] = useState<SmitheryContextResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const latestRequest = useRef(0);

  const activeServers = useMemo(
    () => servers.filter((server) => server.enabled !== false),
    [servers]
  );

  const runFetch = useCallback(async () => {
    if (!enabled || !query.trim() || activeServers.length === 0) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = Date.now();
    latestRequest.current = requestId;

    setIsLoading(true);
    setError(null);

    try {
      const aggregated: SmitheryContextResult[] = [];

      for (const server of activeServers) {
        try {
          const items = await fetchSmitheryContext({
            query,
            server,
            apiKey,
            signal: controller.signal,
          });
          aggregated.push(
            ...items.map((item) => ({
              ...item,
              serverId: item.serverId ?? server.id,
              serverName: item.serverName ?? server.name ?? server.slug,
            }))
          );
        } catch (innerError) {
          if (controller.signal.aborted) {
            return;
          }

          console.error(
            'Smithery context fetch failed',
            server.slug ?? server.id,
            innerError
          );

          setError((prev) =>
            prev ?? `Unable to sync ${server.name ?? server.slug ?? server.id}.`
          );
        }
      }

      if (controller.signal.aborted || latestRequest.current !== requestId) {
        return;
      }

      setResults(aggregated);
    } catch (outerError) {
      if (controller.signal.aborted || latestRequest.current !== requestId) {
        return;
      }
      console.error('Smithery context pipeline failed', outerError);
      setResults([]);
      setError('Smithery connectors are temporarily unavailable.');
    } finally {
      if (!controller.signal.aborted && latestRequest.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [activeServers, apiKey, enabled, query]);

  const scheduleFetch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      runFetch().catch((error) => {
        console.error('Smithery context refresh failed', error);
      });
    }, debounceMs);
  }, [debounceMs, runFetch]);

  useEffect(() => {
    scheduleFetch();
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [scheduleFetch]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    await runFetch();
  }, [runFetch]);

  return {
    results,
    isLoading,
    error,
    refresh,
  };
}
