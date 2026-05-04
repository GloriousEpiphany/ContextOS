/**
 * GitHub repo ↔ paper matching utilities.
 *
 * Extracts arXiv IDs from GitHub README content and provides
 * repo URL parsing for the knowledge graph.
 */

/**
 * Extract owner/repo from GitHub URL.
 * Returns "owner/repo" or null if not a repo page.
 */
export function parseRepoFromUrl(url: string): string | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/|$|\?)/);
  if (!m) return null;
  const [, owner, repo] = m;
  const skip = ['settings', 'notifications', 'explore', 'sponsors', 'about', 'login', 'signup', 'features'];
  if (skip.includes(owner)) return null;
  return `${owner}/${repo}`;
}

/**
 * Extract arXiv IDs from text. Handles 3 formats:
 * 1. arxiv.org/abs/XXXX.XXXXX (with optional version)
 * 2. arXiv:XXXX.XXXXX
 * 3. arxiv:XXXX.XXXXX
 */
export function extractArxivIds(text: string): string[] {
  const ids = new Set<string>();

  // Pattern 1: arxiv.org URLs
  const urlRe = /arxiv\.org\/(?:abs|pdf|html)\/(\d{4,5}\.\d{4,5})(?:v\d+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    ids.add(m[1]);
  }

  // Pattern 2: arXiv:XXXX.XXXXX or arxiv:XXXX.XXXXX
  const citeRe = /arxiv:\s*(\d{4,5}\.\d{4,5})(?:v\d+)?/gi;
  while ((m = citeRe.exec(text)) !== null) {
    ids.add(m[1]);
  }

  return Array.from(ids);
}
