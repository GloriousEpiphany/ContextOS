import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mock chrome.storage.local (needed by ExternalApiClient cache) ──

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

// ── Mock fetch ──

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { SemanticScholarClient, type S2Paper } from '../../src/lib/api/semantic-scholar';
import { ApiError } from '../../src/lib/api/client';

// ── Fixtures ──

const FIXTURE_S2_PAPER: S2Paper = {
  paperId: 'abc123',
  externalIds: { ArXiv: '2403.05525' },
  title: 'Test Paper: A Study',
  abstract: 'This is the abstract.',
  year: 2024,
  citationCount: 42,
  influentialCitationCount: 10,
  authors: [
    { authorId: 'auth1', name: 'Alice Author', hIndex: 25, citationCount: 5000 },
    { authorId: 'auth2', name: 'Bob Builder' },
  ],
  openAccessPdf: { url: 'https://arxiv.org/pdf/2403.05525' },
};

const FIXTURE_S2_AUTHOR = {
  authorId: 'auth1',
  name: 'Alice Author',
  hIndex: 25,
  citationCount: 5000,
  paperCount: 80,
};

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function errorResponse(status: number, body = 'error') {
  return {
    ok: false,
    status,
    text: async () => body,
    headers: { get: (name: string) => (name === 'Retry-After' ? '1' : null) },
  };
}

// ── Tests ──

describe('SemanticScholarClient', () => {
  let client: SemanticScholarClient;

  beforeEach(() => {
    for (const k of Object.keys(storage)) delete storage[k];
    mockFetch.mockReset();
    client = new SemanticScholarClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── getPaperByArxivId ──

  it('getPaperByArxivId returns paper on success', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(FIXTURE_S2_PAPER));

    const paper = await client.getPaperByArxivId('2403.05525');
    expect(paper).not.toBeNull();
    expect(paper!.title).toBe('Test Paper: A Study');
    expect(paper!.citationCount).toBe(42);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('ARXIV:2403.05525');
    expect(calledUrl).toContain('fields=');
  });

  it('getPaperByArxivId strips arxiv: prefix and version suffix', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(FIXTURE_S2_PAPER));

    await client.getPaperByArxivId('arxiv:2403.05525v2');
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('ARXIV:2403.05525');
    expect(calledUrl).not.toContain('v2');
  });

  it('getPaperByArxivId returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404));

    const paper = await client.getPaperByArxivId('9999.99999');
    expect(paper).toBeNull();
  });

  it('getPaperByArxivId throws on server error after retries', async () => {
    // maxRetries=2 means 3 total attempts, all fail with 500
    mockFetch
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(500));

    await expect(client.getPaperByArxivId('2403.05525')).rejects.toThrow(ApiError);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  // ── getAuthor ──

  it('getAuthor returns author details', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(FIXTURE_S2_AUTHOR));

    const author = await client.getAuthor('auth1');
    expect(author).not.toBeNull();
    expect(author!.hIndex).toBe(25);
    expect(author!.name).toBe('Alice Author');
  });

  it('getAuthor returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404));

    const author = await client.getAuthor('nonexistent');
    expect(author).toBeNull();
  });

  // ── enrichPaper ──

  it('enrichPaper combines paper + author data', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(FIXTURE_S2_PAPER));
    mockFetch.mockResolvedValueOnce(okResponse(FIXTURE_S2_AUTHOR));

    const enriched = await client.enrichPaper('2403.05525');
    expect(enriched).not.toBeNull();
    expect(enriched!.title).toBe('Test Paper: A Study');
    expect(enriched!.authors).toEqual(['Alice Author', 'Bob Builder']);
    expect(enriched!.citedBy).toBe(42);
    expect(enriched!.firstAuthorHIndex).toBe(25);
    expect(enriched!.publishedAt).toBe('2024');
  });

  it('enrichPaper returns null when paper not found', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404));

    const enriched = await client.enrichPaper('9999.99999');
    expect(enriched).toBeNull();
  });

  it('enrichPaper handles missing first author gracefully', async () => {
    const paperNoAuthors = { ...FIXTURE_S2_PAPER, authors: [] };
    mockFetch.mockResolvedValueOnce(okResponse(paperNoAuthors));

    const enriched = await client.enrichPaper('2403.05525');
    expect(enriched).not.toBeNull();
    expect(enriched!.firstAuthorHIndex).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ── Caching ──

  it('returns cached result on second call (no second fetch)', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(FIXTURE_S2_PAPER));

    const first = await client.getPaperByArxivId('2403.05525');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const second = await client.getPaperByArxivId('2403.05525');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(second!.title).toBe(first!.title);
  });

  // ── Rate limiting ──

  it('retries on 429 rate limit', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(okResponse(FIXTURE_S2_PAPER));

    const paper = await client.getPaperByArxivId('2403.05525');
    expect(paper!.title).toBe('Test Paper: A Study');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
