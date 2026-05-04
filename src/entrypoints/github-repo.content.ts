/**
 * GitHub Repo Content Script
 *
 * Runs on GitHub repository pages. Scans the README for arXiv IDs
 * and creates paper↔repo edges in the knowledge graph (Dexie).
 *
 * Gated by feature flag: github_repo_link
 */

import { isEnabled } from '@/lib/feature-flags';
import { parseRepoFromUrl, extractArxivIds } from '@/lib/api/github-repo';

export default defineContentScript({
  matches: ['*://github.com/*'],
  runAt: 'document_idle',

  async main() {
    const enabled = await isEnabled('github_repo_link').catch(() => false);
    if (!enabled) return;

    // Only run on repo pages (not user profiles, settings, etc.)
    const repoInfo = parseRepoFromUrl(window.location.href);
    if (!repoInfo) return;

    // Wait for README to load (GitHub uses Turbo/pjax)
    const readmeEl = await waitForReadme();
    if (!readmeEl) return;

    const readmeText = readmeEl.textContent ?? '';
    const arxivIds = extractArxivIds(readmeText);

    if (arxivIds.length === 0) return;

    // Send to background for Dexie storage
    try {
      await chrome.runtime.sendMessage({
        action: 'linkPaperRepo',
        data: {
          repoFullName: repoInfo,
          arxivIds,
          source: 'readme_arxiv_id',
          capturedAt: Date.now(),
        },
      });
    } catch {
      // Background script may not be ready — non-fatal
    }
  },
});

// ── Helpers ──

/**
 * Wait for GitHub README element to appear (handles Turbo/pjax navigation).
 */
async function waitForReadme(): Promise<Element | null> {
  const existing = document.querySelector('#readme .markdown-body');
  if (existing) return existing;

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector('#readme .markdown-body');
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector('#readme .markdown-body'));
    }, 5000);
  });
}
