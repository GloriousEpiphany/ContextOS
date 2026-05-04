import { describe, it, expect } from 'vitest';
import {
  getModelTokenLimit,
  estimateTokens,
  allocateBudget,
  truncateToTokenBudget,
} from '../../src/lib/context/budget';

// Regression: budget module — token estimation and allocation
// Found by /qa on 2026-05-04
// Report: .gstack/qa-reports/

describe('getModelTokenLimit', () => {
  it('returns known model limits', () => {
    expect(getModelTokenLimit('gpt-4o')).toBe(128000);
    expect(getModelTokenLimit('claude-sonnet-4-6-20250514')).toBe(200000);
    expect(getModelTokenLimit('deepseek-chat')).toBe(64000);
    expect(getModelTokenLimit('qwen-turbo')).toBe(8000);
    expect(getModelTokenLimit('qwen-max')).toBe(32000);
  });

  it('returns default for unknown models', () => {
    expect(getModelTokenLimit('unknown-model')).toBe(32000);
    expect(getModelTokenLimit('')).toBe(32000);
  });
});

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates English text at ~4 chars per token', () => {
    // 20 chars "hello world test now" → ~5 tokens
    const tokens = estimateTokens('hello world test now');
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  it('estimates Chinese text at higher token density', () => {
    const en = estimateTokens('abcdefghij'); // 10 chars English
    const zh = estimateTokens('你好世界测试文本啊'); // 10 chars Chinese
    // Chinese chars ~1.5 tokens each vs English ~0.25
    expect(zh).toBeGreaterThan(en);
  });

  it('handles mixed language text', () => {
    const tokens = estimateTokens('Hello 你好 world 世界');
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('allocateBudget', () => {
  it('allocates budget with default reserved tokens', () => {
    const budget = allocateBudget('gpt-4o');
    expect(budget.total).toBe(128000);
    expect(budget.reserved).toBe(4096);
    expect(budget.system).toBe(Math.floor((128000 - 4096) * 0.10));
    expect(budget.userQuery).toBe(Math.floor((128000 - 4096) * 0.10));
    expect(budget.currentPage).toBe(Math.floor((128000 - 4096) * 0.35));
    expect(budget.knowledgeGraph).toBe(Math.floor((128000 - 4096) * 0.45));
  });

  it('allocates budget with custom reserved tokens', () => {
    const budget = allocateBudget('gpt-4o', 8192);
    expect(budget.reserved).toBe(8192);
    expect(budget.system).toBe(Math.floor((128000 - 8192) * 0.10));
  });

  it('all sections sum to less than usable tokens', () => {
    const budget = allocateBudget('gpt-4o');
    const usable = budget.total - budget.reserved;
    const allocated = budget.system + budget.userQuery + budget.currentPage + budget.knowledgeGraph;
    // Floor rounding means allocated <= usable
    expect(allocated).toBeLessThanOrEqual(usable);
  });

  it('handles small model budgets', () => {
    const budget = allocateBudget('qwen-turbo'); // 8000 tokens
    expect(budget.total).toBe(8000);
    expect(budget.system).toBeGreaterThan(0);
    expect(budget.knowledgeGraph).toBeGreaterThan(0);
  });
});

describe('truncateToTokenBudget', () => {
  it('returns text unchanged if under budget', () => {
    const text = 'short text';
    expect(truncateToTokenBudget(text, 1000)).toBe(text);
  });

  it('truncates text that exceeds budget', () => {
    const longText = 'word '.repeat(5000);
    const truncated = truncateToTokenBudget(longText, 100);
    expect(truncated.length).toBeLessThan(longText.length);
    expect(truncated.length).toBeGreaterThan(0);
  });

  it('returns empty string for empty input', () => {
    expect(truncateToTokenBudget('', 100)).toBe('');
  });
});
