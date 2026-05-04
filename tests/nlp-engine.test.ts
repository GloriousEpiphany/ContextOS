import { describe, it, expect } from 'vitest';
import {
  extractKeyPoints,
  summarizeText,
  extractKeywords,
  detectLanguage,
  createContextSummary,
} from '@/lib/nlp-engine';

// Regression: NLP engine — rule-based text processing
// Found by /qa on 2026-05-04

const LONG_ENGLISH = `Contrastive learning has emerged as a powerful paradigm for self-supervised visual representation learning. The key insight is to learn representations by contrasting positive pairs against negative pairs in an embedding space. SimCLR demonstrated that a simple framework combining random augmentations, a learnable projection head, and the NT-Xent loss can achieve remarkable results on ImageNet. Subsequent work like MoCo introduced a momentum-based encoder to maintain a consistent set of negative examples. DINO showed that self-supervised vision transformers can learn semantically meaningful features without any negative pairs at all. These methods have fundamentally changed how we think about pre-training visual models. The implications extend beyond image classification to object detection, segmentation, and multimodal understanding.`;

const LONG_CHINESE = `对比学习已经成为自监督视觉表征学习的强大范式。其核心思想是在嵌入空间中通过对比正样本对和负样本对来学习表征。SimCLR证明了一个简单的框架结合随机增强、可学习的投影头和NT-Xent损失就能在ImageNet上取得出色的结果。后续的MoCo引入了基于动量的编码器来维护一致的负样本集合。DINO表明自监督视觉Transformer可以在没有任何负样本对的情况下学习语义上有意义的特征。这些方法从根本上改变了我们对视觉模型预训练的认知。其影响超越了图像分类，延伸到目标检测、分割和多模态理解。`;

describe('extractKeyPoints', () => {
  it('returns short text unchanged', () => {
    expect(extractKeyPoints('Too short')).toBe('Too short');
  });

  it('returns empty string for empty input', () => {
    expect(extractKeyPoints('')).toBe('');
  });

  it('extracts key sentences from long text', () => {
    const result = extractKeyPoints(LONG_ENGLISH, 3);
    expect(result.length).toBeLessThan(LONG_ENGLISH.length);
    expect(result.length).toBeGreaterThan(50);
  });

  it('respects maxSentences parameter', () => {
    const result1 = extractKeyPoints(LONG_ENGLISH, 2);
    const result2 = extractKeyPoints(LONG_ENGLISH, 5);
    // More sentences allowed → longer result
    expect(result2.length).toBeGreaterThanOrEqual(result1.length);
  });

  it('handles Chinese text', () => {
    const result = extractKeyPoints(LONG_CHINESE, 3);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(LONG_CHINESE.length);
  });
});

describe('summarizeText', () => {
  it('returns short text unchanged', () => {
    expect(summarizeText('Short text here.')).toBe('Short text here.');
  });

  it('returns empty string for empty input', () => {
    expect(summarizeText('')).toBe('');
  });

  it('summarizes long text', () => {
    const result = summarizeText(LONG_ENGLISH, 500);
    expect(result.length).toBeLessThanOrEqual(503); // +3 for '...'
    expect(result.length).toBeGreaterThan(50);
  });

  it('handles very long text by truncating input first', () => {
    const veryLong = LONG_ENGLISH.repeat(10);
    const result = summarizeText(veryLong, 1000);
    expect(result.length).toBeLessThanOrEqual(1003);
  });
});

describe('extractKeywords', () => {
  it('extracts keywords from English text', () => {
    const keywords = extractKeywords(LONG_ENGLISH, 5);
    expect(keywords.length).toBeLessThanOrEqual(5);
    expect(keywords.length).toBeGreaterThan(0);
    // Should contain domain-relevant words
    const joined = keywords.join(' ').toLowerCase();
    expect(joined).toMatch(/contrastive|learning|representation|simclr|vision/);
  });

  it('returns empty for empty input', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  it('respects maxKeywords parameter', () => {
    expect(extractKeywords(LONG_ENGLISH, 3).length).toBeLessThanOrEqual(3);
    expect(extractKeywords(LONG_ENGLISH, 10).length).toBeLessThanOrEqual(10);
  });

  it('filters stop words', () => {
    const keywords = extractKeywords('the the the is is is a a a', 5);
    expect(keywords.length).toBe(0);
  });
});

describe('detectLanguage', () => {
  it('detects English text', () => {
    expect(detectLanguage('This is an English sentence about machine learning.')).toBe('en');
  });

  it('detects Chinese text', () => {
    expect(detectLanguage('这是一个关于机器学习的中文句子。')).toBe('zh');
  });

  it('detects mixed text with dominant Chinese', () => {
    // >10% Chinese chars in first 500 → zh
    const mixed = 'Hello 你好世界 这是中文内容 测试语言检测功能'.repeat(5);
    expect(detectLanguage(mixed)).toBe('zh');
  });

  it('detects mixed text with dominant English', () => {
    const mixed = 'This is mostly English text with a few Chinese characters 哦 sprinkled in.';
    expect(detectLanguage(mixed)).toBe('en');
  });
});

describe('createContextSummary', () => {
  it('summarizes selection when long enough', () => {
    const result = createContextSummary({
      selection: LONG_ENGLISH,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(LONG_ENGLISH.length);
  });

  it('returns description when available', () => {
    const result = createContextSummary({
      description: 'Page description here.',
    });
    expect(result).toBe('Page description here.');
  });

  it('summarizes main content', () => {
    const result = createContextSummary({
      mainContent: LONG_ENGLISH,
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns ogData description as fallback', () => {
    const result = createContextSummary({
      ogData: { description: 'OG description.' },
    });
    expect(result).toBe('OG description.');
  });

  it('returns fallback when nothing available', () => {
    const result = createContextSummary({});
    expect(result).toBe('No detailed content available');
  });
});
