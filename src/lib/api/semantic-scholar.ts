/**
 * Semantic Scholar API client.
 *
 * Public API, no key required. Rate limit: 100 req / 5 min (free tier).
 * Used to enrich arXiv papers with citation counts, h-index, and references.
 *
 * Docs: https://api.semanticscholar.org/api-docs/
 */

import { ExternalApiClient, ApiError } from './client';
import type { PaperRecord } from '@/lib/storage/db';

// ── Response types ──

export interface S2Paper {
  paperId: string;
  externalIds?: { ArXiv?: string; DOI?: string };
  title: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  influentialCitationCount?: number;
  authors?: Array<{
    authorId: string;
    name: string;
    hIndex?: number;
    citationCount?: number;
  }>;
  references?: Array<{ paperId: string; title: string }>;
  citations?: Array<{ paperId: string; title: string }>;
  openAccessPdf?: { url: string };
}

export interface S2Author {
  authorId: string;
  name: string;
  hIndex?: number;
  citationCount?: number;
  paperCount?: number;
}

// ── Fields to request (minimize payload) ──

const PAPER_FIELDS = 'paperId,externalIds,title,abstract,year,citationCount,influentialCitationCount,authors.authorId,authors.name,authors.hIndex,authors.citationCount,openAccessPdf';
const AUTHOR_FIELDS = 'authorId,name,hIndex,citationCount,paperCount';

// ── Client ──

export class SemanticScholarClient extends ExternalApiClient {
  constructor() {
    super({
      name: 'semantic-scholar',
      baseUrl: 'https://api.semanticscholar.org',
      rateLimit: { limit: 95, windowMs: 5 * 60 * 1000 }, // 95 to stay under 100/5min
      defaultCacheTtlMs: 24 * 60 * 60 * 1000, // 24h — paper metadata rarely changes
      maxRetries: 2,
    });
  }

  /**
   * Look up a paper by arXiv ID (e.g. "2403.05525").
   * Returns null if not found (no throw).
   */
  async getPaperByArxivId(arxivId: string): Promise<S2Paper | null> {
    const cleanId = arxivId.replace(/^arxiv:/i, '').replace(/v\d+$/, '');
    try {
      return await this.getJson<S2Paper>(
        `/graph/v1/paper/ARXIV:${cleanId}?fields=${PAPER_FIELDS}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'not_found') return null;
      throw err;
    }
  }

  /**
   * Look up a paper by DOI.
   */
  async getPaperByDoi(doi: string): Promise<S2Paper | null> {
    try {
      return await this.getJson<S2Paper>(
        `/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${PAPER_FIELDS}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'not_found') return null;
      throw err;
    }
  }

  /**
   * Search papers by title (fuzzy). Returns top 5 matches.
   */
  async searchByTitle(title: string): Promise<S2Paper[]> {
    const results = await this.getJson<{ data: S2Paper[] }>(
      `/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=5&fields=${PAPER_FIELDS}`,
    );
    return results.data ?? [];
  }

  /**
   * Get author details including h-index.
   */
  async getAuthor(authorId: string): Promise<S2Author | null> {
    try {
      return await this.getJson<S2Author>(
        `/graph/v1/author/${authorId}?fields=${AUTHOR_FIELDS}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'not_found') return null;
      throw err;
    }
  }

  /**
   * Convenience: look up paper and extract the fields we store in PaperRecord.
   * Returns null if S2 doesn't know the paper.
   */
  async enrichPaper(arxivId: string): Promise<Partial<PaperRecord> | null> {
    const paper = await this.getPaperByArxivId(arxivId);
    if (!paper) return null;

    const firstAuthor = paper.authors?.[0];
    let firstAuthorHIndex: number | undefined;

    if (firstAuthor?.authorId) {
      const author = await this.getAuthor(firstAuthor.authorId);
      firstAuthorHIndex = author?.hIndex;
    }

    return {
      title: paper.title,
      authors: (paper.authors ?? []).map((a) => a.name),
      abstract: paper.abstract ?? undefined,
      publishedAt: paper.year ? `${paper.year}` : undefined,
      citedBy: paper.citationCount ?? undefined,
      firstAuthorHIndex,
    };
  }
}

export const semanticScholar = new SemanticScholarClient();
