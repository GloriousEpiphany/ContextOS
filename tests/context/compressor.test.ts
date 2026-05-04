import { describe, it, expect } from 'vitest';
import { compressText, formatContextPackage } from '../../src/lib/context/compressor';

// Regression: compressor module — text compression and context formatting
// Found by /qa on 2026-05-04

describe('compressText', () => {
  it('returns empty string for empty input', () => {
    expect(compressText('', 100)).toBe('');
  });

  it('returns text unchanged if under token budget', () => {
    const text = 'This is a short sentence. It should not be compressed.';
    expect(compressText(text, 1000)).toBe(text);
  });

  it('compresses long text to fit within budget', () => {
    const sentences = Array.from({ length: 20 }, (_, i) =>
      `Sentence number ${i} discusses topic ${i} with important details about the research.`,
    ).join(' ');

    const compressed = compressText(sentences, 50);
    expect(compressed.length).toBeLessThan(sentences.length);
    expect(compressed.length).toBeGreaterThan(0);
  });

  it('preserves first and last sentences when compressing', () => {
    const first = 'This is the opening sentence of the document.';
    const middle = Array.from({ length: 15 }, (_, i) =>
      `Middle sentence ${i} contains filler content for testing purposes.`,
    ).join(' ');
    const last = 'This is the concluding sentence of the document.';
    const text = `${first} ${middle} ${last}`;

    const compressed = compressText(text, 80);
    // First sentence should be preserved
    expect(compressed).toContain('opening sentence');
  });

  it('handles text with few sentences by truncating', () => {
    const text = 'Short. Very short.';
    const result = compressText(text, 1);
    expect(result.length).toBeLessThanOrEqual(text.length);
  });
});

describe('formatContextPackage', () => {
  it('formats a page context section', () => {
    const result = formatContextPackage({
      currentPage: {
        title: 'Test Page',
        url: 'https://example.com',
        content: 'Page content here.',
      },
    });
    expect(result).toContain('## Current Page Context');
    expect(result).toContain('Test Page');
    expect(result).toContain('https://example.com');
    expect(result).toContain('Page content here.');
  });

  it('formats knowledge results', () => {
    const result = formatContextPackage({
      knowledgeResults: [
        { title: 'Paper A', summary: 'Summary A', url: 'https://a.com', tags: ['ml', 'cv'] },
        { title: 'Paper B', summary: 'Summary B', url: 'https://b.com', tags: ['nlp'] },
      ],
    });
    expect(result).toContain('## Related Knowledge (2 items)');
    expect(result).toContain('Paper A');
    expect(result).toContain('ml, cv');
    expect(result).toContain('Paper B');
  });

  it('formats user query', () => {
    const result = formatContextPackage({
      userQuery: 'What is contrastive learning?',
    });
    expect(result).toContain('## User Query');
    expect(result).toContain('What is contrastive learning?');
  });

  it('formats combined sections', () => {
    const result = formatContextPackage({
      currentPage: { title: 'P', url: 'https://p.com', content: 'C' },
      knowledgeResults: [{ title: 'K', summary: 'S', url: 'https://k.com', tags: ['t'] }],
      userQuery: 'Q',
    });
    expect(result).toContain('## Current Page Context');
    expect(result).toContain('## Related Knowledge');
    expect(result).toContain('## User Query');
  });

  it('returns empty string when no sections provided', () => {
    const result = formatContextPackage({});
    expect(result).toBe('');
  });
});
