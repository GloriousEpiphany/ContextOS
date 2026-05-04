import { describe, it, expect } from 'vitest';
import { parseRepoFromUrl, extractArxivIds } from '../../src/lib/api/github-repo';

describe('parseRepoFromUrl', () => {
  it('extracts owner/repo from standard GitHub URL', () => {
    expect(parseRepoFromUrl('https://github.com/google-research/simclr')).toBe('google-research/simclr');
    expect(parseRepoFromUrl('https://github.com/facebook/react')).toBe('facebook/react');
  });

  it('handles URL with trailing path segments', () => {
    expect(parseRepoFromUrl('https://github.com/user/repo/tree/main/src')).toBe('user/repo');
    expect(parseRepoFromUrl('https://github.com/user/repo/issues/123')).toBe('user/repo');
  });

  it('handles URL with query params', () => {
    expect(parseRepoFromUrl('https://github.com/user/repo?tab=readme')).toBe('user/repo');
  });

  it('returns null for non-repo paths', () => {
    expect(parseRepoFromUrl('https://github.com/settings/profile')).toBeNull();
    expect(parseRepoFromUrl('https://github.com/notifications')).toBeNull();
    expect(parseRepoFromUrl('https://github.com/explore')).toBeNull();
    expect(parseRepoFromUrl('https://github.com/login')).toBeNull();
  });

  it('returns null for non-GitHub URLs', () => {
    expect(parseRepoFromUrl('https://example.com/user/repo')).toBeNull();
    expect(parseRepoFromUrl('https://arxiv.org/abs/2403.05525')).toBeNull();
  });
});

describe('extractArxivIds', () => {
  it('extracts IDs from arxiv.org URLs', () => {
    const text = 'See https://arxiv.org/abs/2403.05525 for details.';
    expect(extractArxivIds(text)).toEqual(['2403.05525']);
  });

  it('extracts IDs from arxiv.org PDF URLs', () => {
    const text = 'Paper: https://arxiv.org/pdf/2002.05709v2';
    expect(extractArxivIds(text)).toEqual(['2002.05709']);
  });

  it('extracts IDs from arXiv: citation format', () => {
    const text = 'Based on arXiv:2403.05525, we propose...';
    expect(extractArxivIds(text)).toEqual(['2403.05525']);
  });

  it('extracts IDs from arxiv: lowercase format', () => {
    const text = 'See arxiv:2002.05709v1 for the original paper.';
    expect(extractArxivIds(text)).toEqual(['2002.05709']);
  });

  it('extracts multiple unique IDs', () => {
    const text = `
      We build on arxiv.org/abs/2403.05525 and arXiv:2002.05709.
      Also see https://arxiv.org/abs/2301.13379.
    `;
    const ids = extractArxivIds(text);
    expect(ids).toHaveLength(3);
    expect(ids).toContain('2403.05525');
    expect(ids).toContain('2002.05709');
    expect(ids).toContain('2301.13379');
  });

  it('deduplicates IDs', () => {
    const text = 'arxiv.org/abs/2403.05525 and arXiv:2403.05525';
    const ids = extractArxivIds(text);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe('2403.05525');
  });

  it('strips version suffixes', () => {
    const text = 'arxiv.org/abs/2403.05525v3 and arXiv:2002.05709v1';
    const ids = extractArxivIds(text);
    expect(ids).toEqual(['2403.05525', '2002.05709']);
  });

  it('handles 5-digit arXiv IDs', () => {
    const text = 'arxiv.org/abs/24030.05525';
    expect(extractArxivIds(text)).toEqual(['24030.05525']);
  });

  it('returns empty array when no IDs found', () => {
    expect(extractArxivIds('No papers here, just regular text.')).toEqual([]);
    expect(extractArxivIds('')).toEqual([]);
  });

  it('handles realistic README content', () => {
    const readme = `
# SimCLR v2

This repository implements the method described in:
- **SimCLR v1**: [arXiv:2002.05709](https://arxiv.org/abs/2002.05709)
- **SimCLR v2**: [arXiv:2006.10029](https://arxiv.org/abs/2006.10029)

## Citation
If you use this code, please cite arXiv:2002.05709.
    `;
    const ids = extractArxivIds(readme);
    expect(ids).toContain('2002.05709');
    expect(ids).toContain('2006.10029');
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });
});
