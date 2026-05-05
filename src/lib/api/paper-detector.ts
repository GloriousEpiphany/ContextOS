/**
 * Site-specific paper page detectors for academic conferences and preprint servers.
 *
 * Each detector knows how to:
 * 1. Identify whether the current page is a paper page
 * 2. Extract structured metadata from the DOM
 *
 * Supported sites: arXiv, OpenReview (NeurIPS/ICML/ICLR), CVPR (openaccess.thecvf.com)
 */

export interface PaperMeta {
  /** Stable ID like "arxiv:2403.05525" or "openreview:abc123". */
  id: string;
  source: 'arxiv' | 'openreview' | 'cvpr' | 'neurips' | 'icml' | 'iclr' | 'other';
  arxivId?: string;
  title: string;
  authors: string[];
  abstract?: string;
  pdfUrl?: string;
  /** Average review score (OpenReview only). */
  score?: number;
  /** Review confidence (OpenReview only). */
  confidence?: number;
  /** Area chair / meta-review summary (OpenReview only, when visible). */
  metaReview?: string;
}

// ── arXiv ──

const ARXIV_ID_RE = /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?/;

export function isArxivPage(url: string): boolean {
  return /arxiv\.org\/(abs|pdf|html)\//.test(url);
}

export function parseArxivId(url: string): string | null {
  const m = url.match(ARXIV_ID_RE);
  return m?.[1] ?? null;
}

export function extractArxivMeta(doc: Document, url: string): PaperMeta | null {
  const arxivId = parseArxivId(url);
  if (!arxivId) return null;

  // Title: <h1 class="title mathjax"> inside abs block
  const titleEl = doc.querySelector('.title.mathjax') ?? doc.querySelector('h1.title');
  const title = titleEl?.textContent?.replace(/^Title:\s*/i, '').trim() ?? '';

  // Authors: <div class="authors"> contains <a> tags
  const authorsEl = doc.querySelector('.authors');
  const authorLinks = authorsEl?.querySelectorAll('a');
  const authors = authorLinks
    ? Array.from(authorLinks).map((a) => a.textContent?.trim() ?? '').filter(Boolean)
    : [];

  // Abstract: <blockquote class="abstract mathjax">
  const abstractEl = doc.querySelector('.abstract.mathjax') ?? doc.querySelector('blockquote.abstract');
  const abstract = abstractEl?.textContent?.replace(/^Abstract:\s*/i, '').trim() ?? undefined;

  // PDF link
  const pdfLink = doc.querySelector('a.download-pdf') as HTMLAnchorElement | null;
  const pdfUrl = pdfLink?.href ?? `https://arxiv.org/pdf/${arxivId}`;

  if (!title && /arxiv\.org\/pdf\//.test(url)) {
    return {
      id: `arxiv:${arxivId}`,
      source: 'arxiv',
      arxivId,
      title: `arXiv:${arxivId}`,
      authors: [],
      pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
    };
  }

  if (!title) return null;

  return {
    id: `arxiv:${arxivId}`,
    source: 'arxiv',
    arxivId,
    title,
    authors,
    abstract,
    pdfUrl,
  };
}

// ── OpenReview (NeurIPS, ICML, ICLR) ──

const OPENREVIEW_ID_RE = /openreview\.net\/forum\?id=([A-Za-z0-9_-]+)/;

export function isOpenReviewPage(url: string): boolean {
  return /openreview\.net\/forum/.test(url);
}

export function parseOpenReviewId(url: string): string | null {
  const m = url.match(OPENREVIEW_ID_RE);
  return m?.[1] ?? null;
}

/**
 * Extract average rating and confidence from OpenReview review DOM.
 *
 * OpenReview renders reviews as panels. Each review has labeled fields like
 * "Rating: 6", "Confidence: 4". We parse all numeric ratings and return the mean.
 */
function extractOpenReviewScores(doc: Document): { score?: number; confidence?: number } {
  const ratings: number[] = [];
  const confidences: number[] = [];

  // Pattern 1: <strong>Rating:</strong> followed by a number
  const strongEls = doc.querySelectorAll('strong');
  for (const el of strongEls) {
    const text = el.textContent?.trim() ?? '';
    const next = el.nextSibling?.textContent?.trim() ?? '';
    const parent = el.parentElement?.textContent?.trim() ?? '';

    if (/^rating[:\s]*$/i.test(text)) {
      // Number might be in next sibling or in parent text after "Rating:"
      const match = next.match(/^[:\s]*(\d+(?:\.\d+)?)/) ?? parent.match(/rating[:\s]*(\d+(?:\.\d+)?)/i);
      if (match) ratings.push(parseFloat(match[1]));
    }
    if (/^confidence[:\s]*$/i.test(text)) {
      const match = next.match(/^[:\s]*(\d+(?:\.\d+)?)/) ?? parent.match(/confidence[:\s]*(\d+(?:\.\d+)?)/i);
      if (match) confidences.push(parseFloat(match[1]));
    }
  }

  // Pattern 2: Elements with class containing "rating" or "score"
  const ratingEls = doc.querySelectorAll('[class*="rating"], [class*="score"]');
  for (const el of ratingEls) {
    const text = el.textContent?.trim() ?? '';
    const match = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*\d+$/) ?? text.match(/^(\d+(?:\.\d+)?)$/);
    if (match) {
      const val = parseFloat(match[1]);
      // Only add if not already captured from strong pattern
      if (!ratings.includes(val)) ratings.push(val);
    }
  }

  const score = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : undefined;
  const confidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined;

  return { score, confidence };
}

function cleanOpenReviewText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractOpenReviewMetaReview(doc: Document): string | undefined {
  const candidates = Array.from(doc.querySelectorAll('strong, h4, h5, span, div'));
  const labelRe = /^(meta[-\s]?review|decision|recommendation|summary(?:\s+of\s+reviews)?|area\s+chair\s+review)\s*:?\s*$/i;

  for (const el of candidates) {
    const label = cleanOpenReviewText(el.textContent ?? '');
    if (!labelRe.test(label)) continue;

    const parentText = cleanOpenReviewText(el.parentElement?.textContent ?? '');
    const inline = parentText.replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?\\s*`, 'i'), '').trim();
    if (inline.length >= 20) return inline.slice(0, 4000);

    const nextElement = el.nextElementSibling;
    const nextText = cleanOpenReviewText(nextElement?.textContent ?? '');
    if (nextText.length >= 20) return nextText.slice(0, 4000);
  }

  const text = cleanOpenReviewText(doc.body?.textContent ?? '');
  const match = text.match(/(?:Meta[-\s]?Review|Decision|Recommendation|Area Chair Review)\s*:?\s+(.{20,2000}?)(?:\s+(?:Rating|Confidence|Official Review|Review:)|$)/i);
  return match?.[1]?.trim();
}

export function extractOpenReviewMeta(doc: Document, url: string): PaperMeta | null {
  const forumId = parseOpenReviewId(url);
  if (!forumId) return null;

  // Title: <h2 class="citation_title"> or <span class="forum-title">
  const titleEl =
    doc.querySelector('h2.citation_title') ??
    doc.querySelector('.forum-title') ??
    doc.querySelector('h4');
  const title = titleEl?.textContent?.trim() ?? '';

  // Authors: <span class="forum-authors"> or <div class="authors">
  const authorsContainer =
    doc.querySelector('.forum-authors') ??
    doc.querySelector('.authors');
  const authors = authorsContainer
    ? Array.from(authorsContainer.querySelectorAll('a, span'))
        .map((el) => el.textContent?.trim() ?? '')
        .filter((t) => t.length > 1 && !t.includes(','))
    : [];

  // Abstract: <span class="forum-abstract-text">
  const abstractEl =
    doc.querySelector('.forum-abstract-text') ??
    doc.querySelector('.abstract');
  const abstract = abstractEl?.textContent?.trim() ?? undefined;

  // Extract review scores from OpenReview DOM
  const { score, confidence } = extractOpenReviewScores(doc);
  const metaReview = extractOpenReviewMetaReview(doc);

  // Detect venue from page content to determine source
  const venueText = doc.body?.textContent ?? '';
  let source: PaperMeta['source'] = 'openreview';
  if (/NeurIPS|Neural Information/i.test(venueText)) source = 'neurips';
  else if (/ICML|International Conference on Machine Learning/i.test(venueText)) source = 'icml';
  else if (/ICLR|International Conference on Learning Representations/i.test(venueText)) source = 'iclr';

  if (!title) return null;

  return {
    id: `openreview:${forumId}`,
    source,
    title,
    authors,
    abstract,
    score,
    confidence,
    metaReview,
  };
}

// ── CVPR (openaccess.thecvf.com) ──

export function isCvprPage(url: string): boolean {
  return /openaccess\.thecvf\.com\/(CVPR|ICCV|ECCV)/i.test(url);
}

export function extractCvprMeta(doc: Document, url: string): PaperMeta | null {
  // Title: <div id="papertitle"> or <h2 class="title">
  const titleEl =
    doc.querySelector('#papertitle') ??
    doc.querySelector('h2.title') ??
    doc.querySelector('h3');
  const title = titleEl?.textContent?.trim() ?? '';

  // Authors: <div id="authors">
  const authorsEl = doc.querySelector('#authors') ?? doc.querySelector('.authors');
  const authors = authorsEl
    ? authorsEl.textContent
        ?.replace(/^[^:]*:\s*/, '')
        .split(/,|;| and /i)
        .map((s) => s.trim())
        .filter(Boolean) ?? []
    : [];

  // Abstract: <div id="abstract">
  const abstractEl = doc.querySelector('#abstract') ?? doc.querySelector('.abstract');
  const abstract = abstractEl?.textContent?.replace(/^Abstract[:\s]*/i, '').trim() ?? undefined;

  // PDF
  const pdfLink = doc.querySelector('a[href$=".pdf"]') as HTMLAnchorElement | null;
  const pdfUrl = pdfLink?.href ?? undefined;

  // ID from URL
  const pathMatch = url.match(/\/(CVPR|ICCV|ECCV)\/(\d{4})\/[^/]+\/([^/]+)\.html/i);
  const paperId = pathMatch ? `${pathMatch[1].toLowerCase()}-${pathMatch[2]}-${pathMatch[3]}` : `cvpr-${Date.now()}`;

  if (!title) return null;

  return {
    id: paperId,
    source: 'cvpr',
    title,
    authors,
    abstract,
    pdfUrl,
  };
}

// ── Unified detector ──

export function detectPaper(url: string, doc: Document): PaperMeta | null {
  if (isArxivPage(url)) return extractArxivMeta(doc, url);
  if (isOpenReviewPage(url)) return extractOpenReviewMeta(doc, url);
  if (isCvprPage(url)) return extractCvprMeta(doc, url);
  return null;
}
