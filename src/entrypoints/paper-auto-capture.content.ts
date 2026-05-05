/**
 * Research paper auto-capture.
 *
 * Product rule: a supported paper page becomes knowledge only after the user
 * keeps it open for 30 seconds. Badge rendering stays separate from capture so
 * disabling hover UI does not disable the core researcher workflow.
 */

import { detectPaper, type PaperMeta } from '@/lib/api/paper-detector';

const AUTO_CAPTURE_DELAY_MS = 30_000;

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

  main() {
    const meta = detectPaper(window.location.href, document);
    if (!meta) return;

    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') return;
      storePaper(meta).catch(() => {
        // Capture failure should not break the host page.
      });
    }, AUTO_CAPTURE_DELAY_MS);

    window.addEventListener('pagehide', () => window.clearTimeout(timer), { once: true });
  },
});

async function storePaper(meta: PaperMeta): Promise<void> {
  await chrome.runtime.sendMessage({
    action: 'storePaper',
    data: {
      id: meta.id,
      source: meta.source,
      arxivId: meta.arxivId,
      title: meta.title,
      authors: meta.authors,
      abstract: meta.abstract,
      pdfUrl: meta.pdfUrl,
      score: meta.score,
      confidence: meta.confidence,
      metaReview: meta.metaReview,
      capturedAt: Date.now(),
    },
  });
}
