import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Lock, LockOpen, PlugZap, RefreshCcw, ShieldCheck, Trash2 } from 'lucide-react';
import type { LLMSettings, SmitheryDirectoryEntry, SmitheryMCPServer } from '@/types';
import {
  buildSmitheryManifestUrl,
  createSmitheryServerFromInput,
  fetchSmitheryDirectory,
} from '@/lib/smithery';

interface SettingsPanelProps {
  isPrivate: boolean;
  setIsPrivate: (checked: boolean) => void;
  privateSettings: LLMSettings;
  publicSettings: LLMSettings;
  setPrivateSettings: (settings: LLMSettings) => void;
  setPublicSettings: (settings: LLMSettings) => void;
  setActivePanel: (panel: 'none' | 'chat' | 'document' | 'settings') => void;
  smitheryApiKey: string;
  setSmitheryApiKey: (apiKey: string) => void;
  smitheryServers: SmitheryMCPServer[];
  setSmitheryServers: React.Dispatch<React.SetStateAction<SmitheryMCPServer[]>>;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isPrivate,
  setIsPrivate,
  privateSettings,
  publicSettings,
  setPrivateSettings,
  setPublicSettings,
  setActivePanel,
  smitheryApiKey,
  setSmitheryApiKey,
  smitheryServers,
  setSmitheryServers,
}) => {
  const [localSettings, setLocalSettings] = useState<LLMSettings>(
    isPrivate ? privateSettings : publicSettings
  );
  const baseUrlRef = useRef<HTMLInputElement>(null);

  const [localSmitheryKey, setLocalSmitheryKey] = useState<string>(smitheryApiKey);
  const [newConnector, setNewConnector] = useState<string>('');
  const [smitheryError, setSmitheryError] = useState<string | null>(null);
  const [directory, setDirectory] = useState<SmitheryDirectoryEntry[]>([]);
  const [isSavingSmithery, setIsSavingSmithery] = useState(false);
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryVersion, setDirectoryVersion] = useState(0);

  useEffect(() => {
    baseUrlRef.current?.focus();
  }, []);

  useEffect(() => {
    setLocalSettings(isPrivate ? privateSettings : publicSettings);
  }, [isPrivate, privateSettings, publicSettings]);

  useEffect(() => {
    setLocalSmitheryKey(smitheryApiKey);
  }, [smitheryApiKey]);

  const effectiveSmitheryKey = useMemo(() => {
    const candidate = (localSmitheryKey || smitheryApiKey || '').trim();
    return candidate.length > 0 ? candidate : undefined;
  }, [localSmitheryKey, smitheryApiKey]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadDirectory = async () => {
      setIsDirectoryLoading(true);
      setDirectoryError(null);
      try {
        const entries = await fetchSmitheryDirectory({
          apiKey: smitheryApiKey || undefined,
          signal: controller.signal,
        });
        if (isMounted) {
          setDirectory(entries);
        }
      } catch (error) {
        if (!isMounted || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        console.warn('Failed to fetch Smithery directory', error);
        setDirectoryError('Unable to reach Smithery directory right now.');
      } finally {
        if (isMounted) {
          setIsDirectoryLoading(false);
        }
      }
    };

    loadDirectory();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [smitheryApiKey, directoryVersion]);

  const handleSaveSettings = () => {
    if (isPrivate) {
      setPrivateSettings(localSettings);
    } else {
      setPublicSettings(localSettings);
    }
    setActivePanel('none');
  };

  const handleSaveSmitheryKey = () => {
    setSmitheryApiKey((localSmitheryKey || '').trim());
    setSmitheryError(null);
  };

  const upsertServer = useCallback(
    (server: SmitheryMCPServer) => {
      setSmitheryServers((prev) => {
        const existing = prev.find((item) => item.id === server.id || item.slug === server.slug);
        const merged = existing
          ? { ...server, enabled: existing.enabled }
          : server;
        const filtered = prev.filter((item) => item.id !== merged.id);
        return [...filtered, merged].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
    [setSmitheryServers]
  );

  const handleAddConnector = async (input?: string) => {
    const target = (input ?? newConnector).trim();
    if (!target) {
      setSmitheryError('Provide a Smithery slug or manifest URL.');
      return;
    }

    setIsSavingSmithery(true);
    setSmitheryError(null);
    try {
      const server = await createSmitheryServerFromInput(target, {
        apiKey: effectiveSmitheryKey,
      });
      upsertServer(server);
      setNewConnector('');
    } catch (error) {
      console.error('Failed to add Smithery connector', error);
      setSmitheryError(
        error instanceof Error ? error.message : 'Unable to add Smithery connector.'
      );
    } finally {
      setIsSavingSmithery(false);
    }
  };

  const handleAddDirectoryEntry = async (entry: SmitheryDirectoryEntry) => {
    const manifest = entry.manifestUrl ?? buildSmitheryManifestUrl(entry.slug);
    await handleAddConnector(manifest);
  };

  const handleRefreshConnector = async (server: SmitheryMCPServer) => {
    setIsSavingSmithery(true);
    setSmitheryError(null);
    try {
      const refreshed = await createSmitheryServerFromInput(server.manifestUrl ?? server.slug, {
        apiKey: effectiveSmitheryKey,
        existing: server,
      });
      upsertServer({ ...refreshed, enabled: server.enabled });
    } catch (error) {
      console.error('Failed to refresh Smithery connector', error);
      setSmitheryError(
        error instanceof Error ? error.message : 'Unable to refresh connector metadata.'
      );
    } finally {
      setIsSavingSmithery(false);
    }
  };

  const handleToggleConnector = (serverId: string, enabled: boolean) => {
    setSmitheryServers((prev) =>
      prev.map((server) => (server.id === serverId ? { ...server, enabled } : server))
    );
  };

  const handleRemoveConnector = (serverId: string) => {
    setSmitheryServers((prev) => prev.filter((server) => server.id !== serverId));
  };

  const activeConnectors = useMemo(
    () => smitheryServers.filter((server) => server.enabled !== false),
    [smitheryServers]
  );

  return (
    <div className="flex h-full flex-col gap-6" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Workspace preferences</h2>
          <p className="text-xs text-slate-300/80">
            Configure language models and connect Smithery MCP servers to enrich search context.
          </p>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Privacy mode</p>
            <p className="text-xs text-slate-300/75">
              {isPrivate ? 'Run prompts against your local Ollama stack.' : 'Use cloud-hosted models via OpenRouter.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5">
              {isPrivate ? <Lock className="h-4 w-4 text-emerald-200" /> : <LockOpen className="h-4 w-4 text-sky-200" />}
            </div>
            <Switch
              id="privacy"
              checked={isPrivate}
              onCheckedChange={(checked) => {
                setIsPrivate(checked);
              }}
              className="data-[state=checked]:bg-sky-400/90"
            />
          </div>
        </div>

        <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="grid gap-2">
            <label htmlFor="baseUrl" className="text-xs uppercase tracking-[0.3em] text-slate-300/70">
              Base URL
            </label>
            <Input
              ref={baseUrlRef}
              id="baseUrl"
              value={localSettings.baseUrl}
              onChange={(event) =>
                setLocalSettings((prev) => ({
                  ...prev,
                  baseUrl: event.target.value,
                }))
              }
              placeholder={isPrivate ? 'http://localhost:11434/v1' : 'https://openrouter.ai/api/v1'}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="apiKey" className="text-xs uppercase tracking-[0.3em] text-slate-300/70">
              API key {isPrivate && '(optional)'}
            </label>
            <Input
              id="apiKey"
              type="password"
              value={localSettings.apiKey}
              onChange={(event) =>
                setLocalSettings((prev) => ({
                  ...prev,
                  apiKey: event.target.value,
                }))
              }
              placeholder={isPrivate ? 'ollama-key (optional)' : 'sk-...'}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="model" className="text-xs uppercase tracking-[0.3em] text-slate-300/70">
              Default model
            </label>
            <Input
              id="model"
              value={localSettings.model}
              onChange={(event) =>
                setLocalSettings((prev) => ({
                  ...prev,
                  model: event.target.value,
                }))
              }
              placeholder={isPrivate ? 'llama3.2:3b' : 'openai/gpt-4o-mini'}
            />
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Smithery Model Context Protocol</p>
            <p className="text-xs text-slate-300/80">
              Link curated knowledge packs from smithery.ai to stream additional context into chat and search.
            </p>
          </div>
          <Badge className="rounded-full border-white/10 bg-white/10 text-[11px] uppercase tracking-[0.3em] text-slate-200">
            Beta
          </Badge>
        </div>

        <div className="mt-4 space-y-5">
          <div className="grid gap-2">
            <label className="text-xs uppercase tracking-[0.3em] text-slate-300/70">
              Smithery API key (optional)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                value={localSmitheryKey}
                onChange={(event) => setLocalSmitheryKey(event.target.value)}
                placeholder="smithery_live_..."
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveSmitheryKey}
                className="whitespace-nowrap"
              >
                Save key
              </Button>
            </div>
            <p className="text-[11px] text-slate-400/80">
              Required for private MCPs. Leave blank for public connectors.
            </p>
          </div>

          <div className="grid gap-2">
            <label className="text-xs uppercase tracking-[0.3em] text-slate-300/70">
              Link a connector
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={newConnector}
                onChange={(event) => setNewConnector(event.target.value)}
                placeholder="notion-notes or https://smithery.ai/mcp/notion-notes/manifest.json"
              />
              <Button
                type="button"
                onClick={() => handleAddConnector()}
                disabled={isSavingSmithery}
                className="whitespace-nowrap"
              >
                {isSavingSmithery ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add connector'}
              </Button>
            </div>
            {smitheryError && (
              <p className="text-xs text-red-300">{smitheryError}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.32em] text-slate-300/70">Active connectors</h3>
              <span className="text-xs text-slate-400/70">{activeConnectors.length} enabled</span>
            </div>
            {smitheryServers.length === 0 ? (
              <div className="flex items-center gap-3 rounded-3xl border border-dashed border-white/15 bg-white/5 px-4 py-4 text-xs text-slate-300/75">
                <PlugZap className="h-4 w-4 text-sky-200" />
                Paste a Smithery manifest URL or pick from the directory below to start streaming MCP context.
              </div>
            ) : (
              <ScrollArea className="max-h-60 pr-3">
                <div className="space-y-3">
                  {smitheryServers.map((server) => (
                    <div
                      key={server.id}
                      className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/60 px-4 py-4 shadow-[0_18px_60px_-40px_rgba(56,189,248,0.45)] md:flex-row md:items-start md:justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-white">{server.name}</p>
                          {server.verified && (
                            <Badge className="flex items-center gap-1 rounded-full border-white/10 bg-emerald-400/15 text-[10px] uppercase tracking-[0.3em] text-emerald-200">
                              <ShieldCheck className="h-3 w-3" />
                              Verified
                            </Badge>
                          )}
                          <Badge className="rounded-full border-white/10 bg-white/10 text-[10px] uppercase tracking-[0.3em] text-slate-200">
                            {server.slug}
                          </Badge>
                        </div>
                        {server.description && (
                          <p className="text-xs text-slate-300/80">{server.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {server.tags?.slice(0, 6).map((tag) => (
                            <Badge
                              key={`${server.id}-${tag}`}
                              variant="outline"
                              className="border-white/15 bg-white/5 text-[10px] uppercase tracking-[0.28em] text-slate-200"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-400/70">
                          Manifest:{' '}
                          <span className="font-mono text-slate-300/90">{server.manifestUrl}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-end md:self-start">
                        <Switch
                          checked={server.enabled !== false}
                          onCheckedChange={(checked) => handleToggleConnector(server.id, checked)}
                          className="data-[state=checked]:bg-sky-400/90"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRefreshConnector(server)}
                          className="gap-1"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveConnector(server.id)}
                          className="gap-1 text-red-300 hover:text-red-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.32em] text-slate-300/70">Smithery directory</h3>
              <Button
                size="sm"
                variant="ghost"
                className="gap-2"
                onClick={() => setDirectoryVersion((version) => version + 1)}
                disabled={isDirectoryLoading}
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
            {directoryError && <p className="text-xs text-red-300">{directoryError}</p>}
            <ScrollArea className="max-h-48 pr-3">
              <div className="space-y-3">
                {isDirectoryLoading && (
                  <div className="text-xs text-slate-300/70">Loading curated connectors…</div>
                )}
                {!isDirectoryLoading && directory.length === 0 && (
                  <div className="text-xs text-slate-300/70">
                    No public directory entries found. Save your API key if you have access to private catalogs.
                  </div>
                )}
                {directory.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/60 px-4 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{entry.title}</p>
                      {entry.description && (
                        <p className="text-xs text-slate-300/80">{entry.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-300/70">
                        {entry.tags?.slice(0, 4).map((tag) => (
                          <span
                            key={`${entry.id}-${tag}`}
                            className="rounded-full border border-white/15 bg-white/5 px-2 py-1"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap"
                      onClick={() => handleAddDirectoryEntry(entry)}
                    >
                      Link connector
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </section>

      <div className="mt-auto flex justify-end gap-3 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            setLocalSettings(isPrivate ? privateSettings : publicSettings);
            setActivePanel('none');
          }}
        >
          Cancel
        </Button>
        <Button onClick={handleSaveSettings}>Save changes</Button>
      </div>
    </div>
  );
};

SettingsPanel.displayName = 'SettingsPanel';

export default React.memo(SettingsPanel);
