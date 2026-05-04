/**
 * Paper Badge Content Script
 *
 * Runs on arXiv / OpenReview / CVPR pages. Detects paper metadata,
 * fetches Semantic Scholar enrichment, and shows a floating PaperBadge.
 *
 * Gated by feature flag: paper_badge_hover
 */

import { detectPaper, type PaperMeta } from '@/lib/api/paper-detector';
import { isEnabled } from '@/lib/feature-flags';
import { createPaperBadge, removePaperBadge } from '@/lib/components/PaperBadge';

export default defineContentScript({
  matches: [
    '*://arxiv.org/abs/*',
    '*://arxiv.org/pdf/*',
    '*://arxiv.org/html/*',
    '*://openreview.net/forum*',
    '*://openaccess.thecvf.com/CVPR*',
    '*://openaccess.thecvf.com/ICCV*',
    '*://openaccess.thecvf.com/ECCV*',
  ],
  runAt: 'document_idle',

  async main() {
    // Gate: feature flag
    const enabled = await isEnabled('paper_badge_hover').catch(() => false);
    if (!enabled) return;

    // Detect paper
    const meta = detectPaper(window.location.href, document);
    if (!meta) return;

    // Store paper metadata in IndexedDB (for KG integration)
    await storePaper(meta).catch(() => {
      // Non-fatal: badge still shows even if storage fails
    });

    // Fetch enrichment from Semantic Scholar (background, don't block badge)
    const enrichment = await fetchEnrichment(meta).catch(() => null);

    // Show badge
    showBadge(meta, enrichment);
  },
});

// ── Store paper in Dexie via background script ──

async function storePaper(meta: PaperMeta): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      action: 'storePaper',
      data: {
        id: meta.id,
        source: meta.source,
        arxivId: meta.arxivId,
        title: meta.title,
        authors: meta.authors,
        abstract: meta.abstract,
        capturedAt: Date.now(),
      },
    });
  } catch {
    // Background script may not be ready yet — non-fatal
  }
}

// ── Fetch Semantic Scholar enrichment ──

interface Enrichment {
  hIndex?: number;
  citedBy?: number;
}

async function fetchEnrichment(meta: PaperMeta): Promise<Enrichment | null> {
  if (!meta.arxivId) return null;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'fetchSemanticScholar',
      data: { arxivId: meta.arxivId },
    });

    if (response?.success && response.data) {
      return {
        hIndex: response.data.firstAuthorHIndex,
        citedBy: response.data.citedBy,
      };
    }
  } catch {
    // Background script unavailable — non-fatal
  }

  return null;
}

// ── Show badge ──

let badgeHost: HTMLElement | null = null;

async function showBadge(meta: PaperMeta, enrichment: Enrichment | null): Promise<void> {
  removePaperBadge();

  // Check PDF availability (CVPR 503 fallback: hide button if PDF unreachable)
  let pdfUrl: string | undefined = meta.pdfUrl;
  if (pdfUrl && meta.source !== 'arxiv') {
    const available = await checkPdfAvailability(pdfUrl).catch(() => false);
    if (!available) pdfUrl = undefined;
  }

  // Fetch repo count (GitHub repo↔paper matching)
  const repoCount = meta.arxivId
    ? await fetchRepoCount(meta.arxivId).catch(() => undefined)
    : undefined;

  badgeHost = createPaperBadge({
    hIndex: enrichment?.hIndex,
    citedBy: enrichment?.citedBy,
    repoCount,
    arxivId: meta.arxivId,
    pdfUrl,
    score: meta.score,
    confidence: meta.confidence,
  });

  document.body.appendChild(badgeHost);
}

async function checkPdfAvailability(url: string): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkPdfAvailability',
      data: { url },
    });
    return response?.available === true;
  } catch {
    return false;
  }
}

async function fetchRepoCount(arxivId: string): Promise<number | undefined> {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getRepoCount',
      data: { arxivId },
    });
    return response?.count > 0 ? response.count : undefined;
  } catch {
    return undefined;
  }
}
