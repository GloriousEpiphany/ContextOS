/**
 * ExternalApiClient — shared base for OpenReview / GitHub / Semantic Scholar / CVPR.
 *
 * Shape locked by eng review 2026-05-01:
 * - rate limit per-host (token bucket)
 * - LRU cache with TTL (chrome.storage.local persistent layer)
 * - exponential backoff retry (3x for network/5xx)
 * - unified ApiError union (rate_limit / auth / network / parse / not_found)
 *
 * Subclasses implement endpoint shapes; the base handles transport concerns.
 */

export type ApiErrorKind =
  | 'rate_limit'
  | 'auth'
  | 'network'
  | 'parse'
  | 'not_found';

export class ApiError extends Error {
  kind: ApiErrorKind;
  upstream?: { status?: number; body?: string };
  retryAfterMs?: number;

  constructor(
    kind: ApiErrorKind,
    message: string,
    opts: { upstream?: ApiError['upstream']; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.upstream = opts.upstream;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

interface RateLimit {
  /** Max requests per window. */
  limit: number;
  /** Window in ms. */
  windowMs: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface ClientOptions {
  /** Logical name; used for cache key prefix and rate limiter scope. */
  name: string;
  /** Base URL prepended to relative paths. */
  baseUrl: string;
  /** Rate limit, e.g. { limit: 100, windowMs: 5 * 60 * 1000 } for Semantic Scholar. */
  rateLimit?: RateLimit;
  /** Default cache TTL. Override per-call via getJson opts.cacheTtlMs. */
  defaultCacheTtlMs?: number;
  /** Headers to send on every request. */
  defaultHeaders?: Record<string, string>;
  /** Max retries for retryable errors (network / 5xx / 429). */
  maxRetries?: number;
}

export interface RequestOptions {
  /** Override cache TTL for this call. 0 = disable cache. */
  cacheTtlMs?: number;
  /** Skip cache read (still writes). */
  bypassCache?: boolean;
  /** Extra headers. */
  headers?: Record<string, string>;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/** Per-host token bucket. Simple, no external deps. */
class RateLimiter {
  private timestamps: number[] = [];
  constructor(private limit: number, private windowMs: number) {}

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.limit) {
      const wait = this.windowMs - (now - this.timestamps[0]);
      await sleep(wait);
      return this.waitIfNeeded();
    }
    this.timestamps.push(now);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export abstract class ExternalApiClient {
  protected readonly name: string;
  protected readonly baseUrl: string;
  protected readonly defaultHeaders: Record<string, string>;
  protected readonly defaultCacheTtlMs: number;
  protected readonly maxRetries: number;
  private readonly limiter?: RateLimiter;

  constructor(opts: ClientOptions) {
    this.name = opts.name;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.defaultHeaders = opts.defaultHeaders ?? {};
    this.defaultCacheTtlMs = opts.defaultCacheTtlMs ?? 0;
    this.maxRetries = opts.maxRetries ?? 3;
    if (opts.rateLimit) {
      this.limiter = new RateLimiter(opts.rateLimit.limit, opts.rateLimit.windowMs);
    }
  }

  /**
   * GET helper with cache + rate limit + retry.
   * Returns parsed JSON. Throws ApiError on any failure.
   */
  protected async getJson<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.resolveUrl(path);
    const cacheKey = `apicache:${this.name}:${url}`;
    const ttl = opts.cacheTtlMs ?? this.defaultCacheTtlMs;

    if (ttl > 0 && !opts.bypassCache) {
      const hit = await this.cacheRead<T>(cacheKey);
      if (hit !== undefined) return hit;
    }

    if (this.limiter) await this.limiter.waitIfNeeded();

    const value = await this.fetchWithRetry<T>(url, opts);

    if (ttl > 0) {
      await this.cacheWrite(cacheKey, value, ttl);
    }

    return value;
  }

  private resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }

  private async fetchWithRetry<T>(url: string, opts: RequestOptions): Promise<T> {
    let lastErr: ApiError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.fetchOnce<T>(url, opts);
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        lastErr = err;
        if (!this.isRetryable(err) || attempt === this.maxRetries) throw err;
        const delay = err.retryAfterMs ?? this.backoffDelay(attempt);
        await sleep(delay);
      }
    }
    throw lastErr ?? new ApiError('network', 'unknown failure');
  }

  private async fetchOnce<T>(url: string, opts: RequestOptions): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { ...this.defaultHeaders, ...opts.headers },
        signal: opts.signal,
      });
    } catch (err) {
      throw new ApiError('network', `fetch failed: ${(err as Error).message}`);
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const ms = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
      throw new ApiError('rate_limit', `${this.name} rate limited`, { retryAfterMs: ms });
    }
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '');
      throw new ApiError('auth', `${this.name} auth failure (${res.status})`, {
        upstream: { status: res.status, body: body.slice(0, 200) },
      });
    }
    if (res.status === 404) {
      throw new ApiError('not_found', `${this.name}: ${url} not found`, {
        upstream: { status: 404 },
      });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ApiError('network', `${this.name} ${res.status}`, {
        upstream: { status: res.status, body: body.slice(0, 200) },
      });
    }

    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new ApiError('parse', `${this.name} response not JSON: ${(err as Error).message}`);
    }
  }

  private isRetryable(err: ApiError): boolean {
    if (err.kind === 'rate_limit') return true;
    if (err.kind === 'network' && err.upstream?.status && err.upstream.status >= 500) return true;
    return false;
  }

  private backoffDelay(attempt: number): number {
    return Math.min(1000 * 2 ** attempt + Math.random() * 250, 8000);
  }

  // ── Cache: chrome.storage.local with LRU eviction ─────────────────────
  private static readonly LRU_CAP = 200;
  private static readonly LRU_INDEX_KEY = 'apicache:_lru_index';

  private async cacheRead<T>(key: string): Promise<T | undefined> {
    const result = await chrome.storage.local.get(key);
    const entry = result[key] as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      await chrome.storage.local.remove(key);
      return undefined;
    }
    await this.touchLru(key);
    return entry.value;
  }

  private async cacheWrite<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
    await chrome.storage.local.set({ [key]: entry });
    await this.touchLru(key);
  }

  private async touchLru(key: string): Promise<void> {
    const result = await chrome.storage.local.get(ExternalApiClient.LRU_INDEX_KEY);
    const index = (result[ExternalApiClient.LRU_INDEX_KEY] as string[] | undefined) ?? [];
    const next = [key, ...index.filter((k) => k !== key)];
    if (next.length > ExternalApiClient.LRU_CAP) {
      const evict = next.slice(ExternalApiClient.LRU_CAP);
      await chrome.storage.local.remove(evict);
    }
    await chrome.storage.local.set({
      [ExternalApiClient.LRU_INDEX_KEY]: next.slice(0, ExternalApiClient.LRU_CAP),
    });
  }
}

export const __TEST_ONLY__ = { sleep };
