import type {
  SmitheryContextResult,
  SmitheryDirectoryEntry,
  SmitheryManifest,
  SmitheryMCPServer
} from '@/types'

const DIRECTORY_ENDPOINTS = [
  'https://smithery.ai/api/public/mcps',
  'https://smithery.ai/api/mcps',
  'https://smithery.ai/.well-known/mcps.json'
]

const DEFAULT_CONTEXT_LIMIT = 5

interface FetchManifestOptions {
  identifier: string
  apiKey?: string
  signal?: AbortSignal
}

interface FetchDirectoryOptions {
  apiKey?: string
  signal?: AbortSignal
}

interface FetchContextOptions {
  query: string
  server: SmitheryMCPServer
  apiKey?: string
  limit?: number
  signal?: AbortSignal
}

const createSmitheryHeaders = (apiKey?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

const stripJsonExtension = (value: string): string => value.replace(/\.json$/i, '')

export const normaliseSmitheryIdentifier = (raw: string): string => {
  const input = raw.trim()
  if (!input) {
    return ''
  }

  if (/^smithery:/i.test(input)) {
    return stripJsonExtension(input.split(':')[1] ?? '')
  }

  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input)
      const segments = url.pathname.split('/').filter(Boolean)
      const slug = segments.pop()
      if (slug) {
        return stripJsonExtension(slug)
      }
    } catch (error) {
      console.warn('Failed to parse Smithery identifier from URL', error)
    }
  }

  return stripJsonExtension(input)
}

const ensureIdentifier = (value: string, fallback: string): string => {
  const identifier = normaliseSmitheryIdentifier(value || fallback)
  if (!identifier) {
    throw new Error('Unable to derive Smithery identifier from the provided input.')
  }
  return identifier
}

export const buildSmitheryManifestUrl = (identifier: string): string => {
  if (/^https?:\/\//i.test(identifier)) {
    return identifier
  }
  const slug = ensureIdentifier(identifier, identifier)
  return `https://smithery.ai/api/mcps/${slug}/manifest.json`
}

export const buildSmitheryInvokeUrl = (identifier: string): string => {
  if (/^https?:\/\//i.test(identifier)) {
    return identifier
  }
  const slug = ensureIdentifier(identifier, identifier)
  return `https://smithery.ai/api/mcps/${slug}/invoke`
}

export const fetchSmitheryManifest = async ({
  identifier,
  apiKey,
  signal
}: FetchManifestOptions): Promise<SmitheryManifest> => {
  const manifestUrl = buildSmitheryManifestUrl(identifier)
  const response = await fetch(manifestUrl, {
    headers: createSmitheryHeaders(apiKey),
    signal
  })

  if (!response.ok) {
    throw new Error(`Failed to load Smithery manifest (${response.status} ${response.statusText}).`)
  }

  const payload = await response.json()
  const manifestPayload =
    (payload && payload.manifest) || (payload && payload.data && payload.data.manifest) || payload

  if (!manifestPayload || typeof manifestPayload !== 'object') {
    throw new Error('Received an invalid Smithery manifest payload.')
  }

  return {
    identifier: normaliseSmitheryIdentifier(identifier),
    manifestUrl,
    payload: manifestPayload as Record<string, unknown>
  }
}

const normaliseTags = (raw: unknown): string[] | undefined => {
  if (Array.isArray(raw)) {
    return raw
      .map((tag) => (typeof tag === 'string' ? tag : undefined))
      .filter((tag): tag is string => Boolean(tag))
  }
  return undefined
}

const normaliseDirectoryEntry = (raw: any): SmitheryDirectoryEntry => {
  const slug = ensureIdentifier(
    raw?.slug ?? raw?.id ?? raw?.handle ?? raw?.name ?? raw?.identifier ?? '',
    raw?.manifest_url ?? raw?.manifestUrl ?? ''
  )

  return {
    id: raw?.id ?? slug,
    slug,
    title: raw?.title ?? raw?.name ?? raw?.displayName ?? slug,
    description: raw?.description ?? raw?.summary ?? raw?.notes ?? undefined,
    manifestUrl:
      raw?.manifest_url ??
      raw?.manifestUrl ??
      raw?.manifest ??
      raw?.links?.manifest ??
      buildSmitheryManifestUrl(slug),
    queryUrl:
      raw?.query_url ??
      raw?.queryUrl ??
      raw?.invoke_url ??
      raw?.invokeUrl ??
      raw?.links?.invoke ??
      buildSmitheryInvokeUrl(slug),
    tags: normaliseTags(raw?.tags ?? raw?.categories ?? raw?.capabilities),
    verified: Boolean(raw?.verified ?? raw?.is_verified ?? raw?.trusted ?? false),
    icon: raw?.icon ?? raw?.logo ?? raw?.thumbnail ?? raw?.image ?? undefined
  }
}

const extractDirectoryList = (payload: any): any[] => {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  if (Array.isArray(payload?.data?.results)) return payload.data.results
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.servers)) return payload.servers
  return []
}

export const fetchSmitheryDirectory = async ({
  apiKey,
  signal
}: FetchDirectoryOptions = {}): Promise<SmitheryDirectoryEntry[]> => {
  let lastError: Error | null = null

  for (const endpoint of DIRECTORY_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        headers: createSmitheryHeaders(apiKey),
        signal
      })

      if (!response.ok) {
        lastError = new Error(
          `Smithery directory request failed (${response.status} ${response.statusText}).`
        )
        continue
      }

      const payload = await response.json()
      const entries = extractDirectoryList(payload)
      if (!entries.length) {
        continue
      }

      return entries.map(normaliseDirectoryEntry)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }

      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  if (lastError) {
    throw lastError
  }

  return []
}

const resolveManifestString = (manifest: SmitheryManifest['payload']): string | undefined => {
  const candidate =
    typeof manifest?.manifest_url === 'string'
      ? manifest.manifest_url
      : typeof manifest?.manifestUrl === 'string'
        ? manifest.manifestUrl
        : undefined

  return candidate
}

export const createSmitheryServerFromInput = async (
  rawInput: string,
  {
    apiKey,
    signal,
    existing
  }: { apiKey?: string; signal?: AbortSignal; existing?: Partial<SmitheryMCPServer> } = {}
): Promise<SmitheryMCPServer> => {
  const identifier = ensureIdentifier(rawInput, existing?.slug ?? existing?.id ?? '')
  const manifest = await fetchSmitheryManifest({ identifier, apiKey, signal })
  const payload = manifest.payload as Record<string, any>

  const slug = ensureIdentifier(
    payload?.slug ?? payload?.id ?? payload?.handle ?? payload?.name ?? manifest.identifier,
    manifest.manifestUrl
  )

  const name = payload?.name ?? payload?.title ?? payload?.displayName ?? existing?.name ?? slug
  const description =
    payload?.description ?? payload?.summary ?? payload?.notes ?? existing?.description

  const tags =
    normaliseTags(payload?.tags ?? payload?.categories ?? payload?.capabilities) ?? existing?.tags

  const queryUrl =
    payload?.query_url ??
    payload?.queryUrl ??
    payload?.invoke_url ??
    payload?.invokeUrl ??
    payload?.endpoints?.query ??
    payload?.links?.invoke ??
    existing?.queryUrl ??
    buildSmitheryInvokeUrl(slug)

  const icon =
    payload?.icon ??
    payload?.logo ??
    payload?.avatar ??
    payload?.image ??
    payload?.thumbnail ??
    existing?.icon

  const resolvedManifestUrl =
    resolveManifestString(payload) ?? existing?.manifestUrl ?? manifest.manifestUrl

  return {
    id: existing?.id ?? slug,
    slug,
    name,
    description,
    manifestUrl: resolvedManifestUrl,
    queryUrl,
    tags,
    icon,
    verified: Boolean(payload?.verified ?? payload?.is_verified ?? existing?.verified ?? false),
    enabled: existing?.enabled ?? true,
    lastSyncedAt: new Date().toISOString()
  }
}

const extractContextItems = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.results)) return payload.results
  if (Array.isArray(payload?.data?.results)) return payload.data.results
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

export const fetchSmitheryContext = async ({
  query,
  server,
  apiKey,
  limit = DEFAULT_CONTEXT_LIMIT,
  signal
}: FetchContextOptions): Promise<SmitheryContextResult[]> => {
  if (!query.trim() || server.enabled === false) {
    return []
  }

  const endpoint = server.queryUrl ?? buildSmitheryInvokeUrl(server.slug ?? server.id)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: createSmitheryHeaders(apiKey),
    body: JSON.stringify({ query, limit }),
    signal
  })

  if (!response.ok) {
    throw new Error(`Smithery context request failed (${response.status} ${response.statusText}).`)
  }

  const payload = await response.json()
  const items = extractContextItems(payload)

  return items.map((item: any, index: number) => {
    const snippet =
      item?.snippet ?? item?.summary ?? item?.content ?? item?.text ?? item?.body ?? ''

    const title = item?.title ?? item?.name ?? item?.heading ?? server.name

    return {
      id: item?.id ? `${server.id}:${item.id}` : `${server.id}:${index}`,
      serverId: server.id,
      serverName: server.name,
      title,
      snippet,
      url: item?.url ?? item?.href ?? item?.link ?? undefined,
      score: typeof item?.score === 'number' ? item.score : undefined,
      tags: normaliseTags(item?.tags ?? item?.categories)
    }
  })
}
