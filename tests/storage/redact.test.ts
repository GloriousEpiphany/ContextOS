import { describe, it, expect } from 'vitest';
import { redactPII } from '../../src/lib/storage/redact';

describe('redactPII', () => {
  it('redacts email addresses', () => {
    const r = redactPII('Contact me at alice.zhang@university.edu for the dataset.');
    expect(r.text).toBe('Contact me at [email] for the dataset.');
    expect(r.stats.emails).toBe(1);
  });

  it('redacts multiple emails in one string', () => {
    const r = redactPII('a@x.io and b@y.org and c+tag@z.co.uk');
    expect(r.stats.emails).toBe(3);
    expect(r.text).not.toMatch(/@/);
  });

  it('redacts OpenAI tokens', () => {
    const r = redactPII('My key is sk-proj-abc123def456ghi789jkl0mn');
    expect(r.text).toContain('[openai-token]');
    expect(r.stats.tokens).toBe(1);
  });

  it('redacts Anthropic tokens', () => {
    const r = redactPII('use sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 today');
    expect(r.text).toContain('[anthropic-token]');
    expect(r.text).not.toContain('sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
  });

  it('redacts GitHub PATs', () => {
    const r = redactPII('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 grants admin');
    expect(r.text).toContain('[github-pat]');
    expect(r.stats.tokens).toBe(1);
  });

  it('redacts AWS access keys', () => {
    const r = redactPII('AKIAIOSFODNN7EXAMPLE is the access key');
    expect(r.text).toContain('[aws-access-key]');
  });

  it('redacts phone numbers (US format)', () => {
    const r = redactPII('Call me at (415) 555-1234 tomorrow.');
    expect(r.text).toContain('[phone]');
    expect(r.stats.phones).toBeGreaterThanOrEqual(1);
  });

  it('does not redact short numeric strings (e.g. years)', () => {
    const r = redactPII('Published in 2024 by SimCLR authors.');
    expect(r.stats.phones).toBe(0);
    expect(r.text).toContain('2024');
  });

  it('returns empty string and zero stats for empty input', () => {
    const r = redactPII('');
    expect(r.text).toBe('');
    expect(r.stats).toEqual({ emails: 0, tokens: 0, phones: 0 });
  });

  it('handles mixed PII in a realistic chat snippet', () => {
    const chat = `I asked alice@lab.edu about the API. She said use sk-proj-realkeyABCDEFGH1234567890 and call her at +1-555-867-5309 if questions.`;
    const r = redactPII(chat);
    expect(r.text).not.toMatch(/alice@lab\.edu/);
    expect(r.text).not.toMatch(/sk-proj-real/);
    expect(r.stats.emails).toBe(1);
    expect(r.stats.tokens).toBe(1);
    expect(r.stats.phones).toBeGreaterThanOrEqual(1);
  });

  it('preserves arXiv IDs (not phone-like)', () => {
    const r = redactPII('See arXiv:2403.05525 for details.');
    expect(r.text).toContain('arXiv:2403.05525');
    expect(r.stats.phones).toBe(0);
  });
});
