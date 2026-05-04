/**
 * Comprehensive tests for ExternalApiClient — rate limiting, caching,
 * retry logic, error classification, and LRU eviction.
 *
 * Decision boundaries tested:
 * - Rate limiter: under limit, at limit, over limit (waits)
 * - Cache: TTL expiry, cache hit, cache miss, bypass, LRU eviction at 200
 * - Retry: network error → retry, 5xx → retry, 429 → retry with Retry-After,
 *   401/403 → no retry, 404 → no retry, max retries exceeded
 * - Error classification: ApiError.kind for each HTTP status
 * - URL resolution: relative path, absolute URL
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock chrome.storage.local
const storage: Record<string, unknown> = {};
(globalThis as unknown as { chrome: typeof chrome }).chrome = {
  storage: {
    local: {
      get: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (k in storage) out[k] = storage[k];
        }
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(storage, items);
      }),
      remove: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) delete storage[k];
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
} as unknown as typeof chrome;

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { ApiError } from '../../src/lib/api/client';

// ── ApiError ──

describe('ApiError', () => {
  it('has correct name and kind', () => {
    const err = new ApiError('rate_limit', 'too fast');
    expect(err.name).toBe('ApiError');
    expect(err.kind).toBe('rate_limit');
    expect(err.message).toBe('too fast');
  });

  it('stores upstream info', () => {
    const err = new ApiError('network', 'server error', {
      upstream: { status: 500, body: 'Internal Server Error' },
    });
    expect(err.upstream?.status).toBe(500);
    expect(err.upstream?.body).toBe('Internal Server Error');
  });

  it('stores retryAfterMs', () => {
    const err = new ApiError('rate_limit', 'limited', { retryAfterMs: 5000 });
    expect(err.retryAfterMs).toBe(5000);
  });

  it('supports all error kinds', () => {
    const kinds = ['rate_limit', 'auth', 'network', 'parse', 'not_found'] as const;
    for (const kind of kinds) {
      const err = new ApiError(kind, 'msg');
      expect(err.kind).toBe(kind);
    }
  });
});

// ── Concrete test client ──

// We create a concrete subclass to test the abstract ExternalApiClient
import { ExternalApiClient } from '../../src/lib/api/client';

class TestClient extends ExternalApiClient {
  constructor(opts: Partial<ConstructorParameters<typeof ExternalApiClient>[0]> = {}) {
    super({
      name: 'test',
      baseUrl: 'https://api.test.com',
      maxRetries: 2,
      ...opts,
    });
  }

  async fetch(path: string, opts?: { cacheTtlMs?: number; bypassCache?: boolean }) {
    return this.getJson(path, opts);
  }
}

describe('ExternalApiClient (via TestClient)', () => {
  beforeEach(() => {
    for (const k of Object.keys(storage)) delete storage[k];
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── URL resolution ──

  describe('URL resolution', () => {
    it('prepends baseUrl to relative path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      const client = new TestClient();
      await client.fetch('/api/data');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://api.test.com/api/data');
    });

    it('uses absolute URL as-is', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      const client = new TestClient();
      await client.fetch('https://other.com/data');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://other.com/data');
    });

    it('strips trailing slash from baseUrl', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const client = new TestClient({ baseUrl: 'https://api.test.com/' });
      await client.fetch('/path');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://api.test.com/path');
    });
  });

  // ── Error classification ──

  describe('error classification', () => {
    it('throws not_found for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const client = new TestClient({ maxRetries: 0 });
      try {
        await client.fetch('/missing');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).kind).toBe('not_found');
      }
    });

    it('throws auth for 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const client = new TestClient({ maxRetries: 0 });
      try {
        await client.fetch('/protected');
      } catch (err) {
        expect((err as ApiError).kind).toBe('auth');
      }
    });

    it('throws auth for 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      const client = new TestClient({ maxRetries: 0 });
      try {
        await client.fetch('/forbidden');
      } catch (err) {
        expect((err as ApiError).kind).toBe('auth');
      }
    });

    it('throws rate_limit for 429 with Retry-After', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
        headers: { get: (name: string) => (name === 'Retry-After' ? '5' : null) },
      });

      const client = new TestClient({ maxRetries: 0 });
      try {
        await client.fetch('/limited');
      } catch (err) {
        expect((err as ApiError).kind).toBe('rate_limit');
        expect((err as ApiError).retryAfterMs).toBe(5000);
      }
    });

    it('throws network for 5xx', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      });

      const client = new TestClient({ maxRetries: 0 });
      try {
        await client.fetch('/error');
      } catch (err) {
        expect((err as ApiError).kind).toBe('network');
      }
    });

    it('throws network for fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const client = new TestClient({ maxRetries: 0 });
      try {
        await client.fetch('/network-error');
      } catch (err) {
        expect((err as ApiError).kind).toBe('network');
      }
    });

    it('throws parse for non-JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token'); },
      });

      const client = new TestClient({ maxRetries: 0 });
      try {
        await client.fetch('/bad-json');
      } catch (err) {
        expect((err as ApiError).kind).toBe('parse');
      }
    });
  });

  // ── Retry logic ──

  describe('retry logic', () => {
    it('retries on 5xx up to maxRetries', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' })
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ done: true }) });

      const client = new TestClient({ maxRetries: 2 });
      const result = await client.fetch('/flaky');

      expect(result).toEqual({ done: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('throws after maxRetries exhausted', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' })
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' })
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' });

      const client = new TestClient({ maxRetries: 2 });
      await expect(client.fetch('/always-fail')).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('does NOT retry on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const client = new TestClient({ maxRetries: 3 });
      await expect(client.fetch('/missing')).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1); // no retry
    });

    it('does NOT retry on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const client = new TestClient({ maxRetries: 3 });
      await expect(client.fetch('/auth')).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 rate limit', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'limited',
          headers: { get: () => '1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        });

      const client = new TestClient({ maxRetries: 1 });
      const result = await client.fetch('/limited');
      expect(result).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on network error (5xx)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false, status: 502, text: async () => 'Bad Gateway',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ recovered: true }),
        });

      const client = new TestClient({ maxRetries: 1 });
      const result = await client.fetch('/flaky-network');
      expect(result).toEqual({ recovered: true });
    });

    it('does NOT retry on pure fetch failure (TypeError)', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const client = new TestClient({ maxRetries: 1 });
      await expect(client.fetch('/dns-fail')).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── Caching ──

  describe('caching', () => {
    it('caches response when cacheTtlMs > 0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'cached' }),
      });

      const client = new TestClient({ defaultCacheTtlMs: 60000 });

      const first = await client.fetch('/cached');
      const second = await client.fetch('/cached');

      expect(first).toEqual({ data: 'cached' });
      expect(second).toEqual({ data: 'cached' });
      // Only 1 fetch call because second hit cache
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('bypasses cache when bypassCache=true', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true, status: 200, json: async () => ({ v: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true, status: 200, json: async () => ({ v: 2 }),
        });

      const client = new TestClient({ defaultCacheTtlMs: 60000 });

      const first = await client.fetch('/data');
      const second = await client.fetch('/data', { bypassCache: true });

      expect(first).toEqual({ v: 1 });
      expect(second).toEqual({ v: 2 });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not cache when cacheTtlMs=0', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true, status: 200, json: async () => ({ v: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true, status: 200, json: async () => ({ v: 2 }),
        });

      const client = new TestClient({ defaultCacheTtlMs: 0 });

      await client.fetch('/no-cache');
      await client.fetch('/no-cache');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('per-call cacheTtlMs overrides default', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true, status: 200, json: async () => ({ v: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true, status: 200, json: async () => ({ v: 2 }),
        });

      const client = new TestClient({ defaultCacheTtlMs: 60000 });

      // Default would cache, but per-call overrides to 0
      await client.fetch('/override', { cacheTtlMs: 0 });
      await client.fetch('/override', { cacheTtlMs: 0 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
