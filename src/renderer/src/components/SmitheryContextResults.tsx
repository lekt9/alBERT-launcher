import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, PlugZap, RadioTower, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SmitheryContextResult, SmitheryMCPServer } from '@/types';

interface SmitheryContextResultsProps extends React.HTMLAttributes<HTMLDivElement> {
  items: SmitheryContextResult[];
  servers: SmitheryMCPServer[];
  isLoading?: boolean;
  error?: string | null;
  onOpenSettings?: () => void;
  onRefreshServer?: (server: SmitheryMCPServer) => Promise<void> | void;
}

const SmitheryContextResults: React.FC<SmitheryContextResultsProps> = ({
  items,
  servers,
  isLoading = false,
  error,
  onOpenSettings,
  onRefreshServer,
  className,
  ...rest
}) => {
  const serverMap = React.useMemo(() => {
    return servers.reduce<Record<string, SmitheryMCPServer>>((acc, server) => {
      acc[server.id] = server;
      return acc;
    }, {});
  }, [servers]);

  const activeServers = React.useMemo(
    () => servers.filter((server) => server.enabled !== false),
    [servers]
  );

  const renderEmptyState = () => {
    if (activeServers.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-10 text-center text-sm text-slate-300/80">
          <RadioTower className="h-6 w-6 text-sky-200" aria-hidden />
          <p className="max-w-sm text-xs text-slate-300/70">
            Link Smithery MCP servers to stream live knowledge packs directly into search. Add a slug or manifest URL from smithery.ai in settings to get started.
          </p>
          <Button size="sm" variant="outline" onClick={onOpenSettings} className="pointer-events-auto">
            Connect MCPs
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300/80">
        <div className="flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-sky-200" aria-hidden />
          <span>No Smithery context returned yet—try refining your query or run a deeper search.</span>
        </div>
        <Button size="sm" variant="ghost" onClick={onOpenSettings} className="pointer-events-auto">
          Manage connectors
        </Button>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl',
        className
      )}
      {...rest}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-slate-300/70">
            Smithery MCP context
          </p>
          <h3 className="text-lg font-semibold text-white">Ambient knowledge feeds</h3>
          <p className="text-xs text-slate-400/80">
            Results stream from your linked Smithery servers in real-time to complement semantic search.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="flex items-center gap-1 rounded-full border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-200"
          >
            <RadioTower className="h-3.5 w-3.5" aria-hidden />
            {activeServers.length}{' '}
            {activeServers.length === 1 ? 'connector' : 'connectors'}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="gap-2 text-xs text-slate-200/80"
            onClick={onOpenSettings}
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
            Configure
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {isLoading && (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={`skeleton-${index}`} className="border-white/10 bg-slate-900/40">
                <CardContent className="space-y-3 p-5">
                  <Skeleton className="h-4 w-1/3 bg-white/10" />
                  <Skeleton className="h-6 w-3/4 bg-white/10" />
                  <Skeleton className="h-14 w-full bg-white/10" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && items.length === 0 && renderEmptyState()}

        {!isLoading && items.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => {
              const server = serverMap[item.serverId];
              const serverLabel = server?.name ?? item.serverName ?? item.serverId;
              return (
                <Card
                  key={item.id}
                  className="group relative overflow-hidden border-white/10 bg-slate-950/70"
                >
                  <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100"
                    style={{
                      background:
                        'radial-gradient(circle at top, rgba(56,189,248,0.25), transparent 65%)',
                    }}
                  />
                  <CardContent className="relative flex h-full flex-col gap-4 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-300/70">
                        <RadioTower className="h-3.5 w-3.5 text-sky-200" aria-hidden />
                        {serverLabel}
                      </div>
                      {onRefreshServer && server && (
                        <button
                          type="button"
                          onClick={() => onRefreshServer(server)}
                          className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-200/80 transition hover:border-white/20 hover:bg-white/10"
                        >
                          <RefreshCcw className="h-3 w-3" aria-hidden />
                          Sync
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-base font-semibold text-white">{item.title}</h4>
                      <p className="line-clamp-4 text-sm text-slate-300/85">{item.snippet}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300/70">
                      {item.tags?.slice(0, 4).map((tag) => (
                        <Badge
                          key={`${item.id}-${tag}`}
                          variant="outline"
                          className="border-white/15 bg-white/5 text-[10px] uppercase tracking-[0.28em] text-slate-200"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {typeof item.score === 'number' && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.28em] text-slate-200">
                          Score {(item.score * 100).toFixed(0)}
                        </span>
                      )}
                    </div>
                    {item.url && (
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="mt-auto w-fit gap-2 text-xs text-sky-200"
                      >
                        <a href={item.url} target="_blank" rel="noreferrer">
                          Open source
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

SmitheryContextResults.displayName = 'SmitheryContextResults';

export default React.memo(SmitheryContextResults);
