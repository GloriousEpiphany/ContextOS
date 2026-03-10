/**
 * ContextPrompt AI v4.0 — NLP Engine
 * Lightweight rule-based NLP for local processing (no AI required).
 * Migrated from lib/nlp-engine.js with TypeScript types.
 */

const STOP_WORDS_EN = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
  'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'and', 'or',
  'but', 'if', 'then', 'else', 'when', 'at', 'by', 'for', 'with',
  'about', 'against', 'between', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out',
  'on', 'off', 'over', 'under', 'again', 'further', 'once', 'here',
  'there', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'same', 'so', 'than', 'too', 'very', 'just',
]);

const STOP_WORDS_CN = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '那', '他', '她', '它', '们', '这个',
  '那个', '什么', '怎么', '为什么', '因为', '所以', '但是', '如果', '虽然',
  '或者', '而且', '以及', '还有', '可以', '能够', '应该', '必须', '需要',
]);

function isStopWord(word: string): boolean {
  return STOP_WORDS_EN.has(word.toLowerCase()) || STOP_WORDS_CN.has(word);
}

function tokenize(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[\s,.!?;:'"()\[\]{}。，！？；：""''（）【】]+/)
    .filter((t) => t.length > 0);

  const result: string[] = [];
  for (const token of tokens) {
    if (/[\u4e00-\u9fff]/.test(token)) {
      if (token.length > 1) result.push(token);
      for (let i = 0; i < token.length - 1; i++) {
        result.push(token.substring(i, i + 2));
      }
    } else {
      result.push(token);
    }
  }
  return result;
}

function calculateWordFrequency(text: string): Record<string, number> {
  const words = tokenize(text);
  const freq: Record<string, number> = {};
  for (const word of words) {
    if (!isStopWord(word) && word.length > 1) {
      freq[word] = (freq[word] || 0) + 1;
    }
  }
  return freq;
}

function splitSentences(text: string): string[] {
  return text
    .split(/([.!?。！？]+[\s]*|[\n\r]+)/g)
    .filter((s) => s.trim().length > 10)
    .map((s) => s.trim());
}

function scoreSentence(
  sentence: string,
  wordFreq: Record<string, number>,
  position: number,
  totalSentences: number,
): number {
  const words = tokenize(sentence);
  let score = 0;

  for (const word of words) {
    if (wordFreq[word]) score += wordFreq[word];
  }
  score = score / Math.max(words.length, 1);

  if (position === 0) score *= 1.5;
  else if (position === totalSentences - 1) score *= 1.2;

  if (words.length < 5) score *= 0.5;
  else if (words.length > 50) score *= 0.8;

  return score;
}

/**
 * Extract top N key sentences from text.
 */
export function extractKeyPoints(text: string, maxSentences = 3): string {
  if (!text || text.length < 50) return text;

  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return text;

  const wordFreq = calculateWordFrequency(text);
  const scored = sentences.map((sentence, index) => ({
    sentence,
    score: scoreSentence(sentence, wordFreq, index, sentences.length),
    index,
  }));

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxSentences);
  top.sort((a, b) => a.index - b.index);

  return top.map((s) => s.sentence).join(' ');
}

/**
 * Summarize text using rule-based extraction.
 */
export function summarizeText(text: string, maxLength = 1000): string {
  if (!text || text.length < 100) return text;

  const truncated = text.length > 8000 ? text.substring(0, 8000) : text;
  const sentences = splitSentences(truncated);
  if (sentences.length <= 6) return truncated;

  const wordFreq = calculateWordFrequency(truncated);
  const scored = sentences.map((sentence, index) => ({
    sentence,
    score: scoreSentence(sentence, wordFreq, index, sentences.length),
    index,
  }));

  scored.sort((a, b) => b.score - a.score);
  const topCount = Math.min(Math.max(5, Math.ceil(sentences.length * 0.3)), 8);
  const top = scored.slice(0, topCount);
  top.sort((a, b) => a.index - b.index);

  let result = top.map((s) => s.sentence).join(' ');
  if (result.length > maxLength) {
    result = result.substring(0, maxLength) + '...';
  }
  return result;
}

/**
 * Create a summary from a captured context object.
 */
export function createContextSummary(context: {
  isPrivateLink?: boolean;
  chatContent?: string;
  selection?: string;
  description?: string;
  mainContent?: string;
  ogData?: { description?: string };
}): string {
  if (context.isPrivateLink && context.chatContent) {
    return summarizeChatContent(context.chatContent);
  }
  if (context.selection && context.selection.length > 100) {
    return extractKeyPoints(context.selection);
  }
  if (context.description) return context.description;
  if (context.mainContent) return summarizeText(context.mainContent);
  if (context.ogData?.description) return context.ogData.description;
  return 'No detailed content available';
}

/**
 * Summarize AI chat conversation content.
 */
function summarizeChatContent(chatContent: string): string {
  if (!chatContent || chatContent.length < 50) return chatContent || 'No chat content available';
  if (chatContent.length <= 1000) return chatContent;

  const lines = chatContent.split('\n\n');
  if (lines.length <= 5) return chatContent;

  return [
    ...lines.slice(0, 2),
    '...(conversation truncated)...',
    ...lines.slice(-3),
  ].join('\n\n');
}

/**
 * Extract keywords from text.
 */
export function extractKeywords(text: string, maxKeywords = 5): string[] {
  const wordFreq = calculateWordFrequency(text);
  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Detect language of text.
 */
export function detectLanguage(text: string): 'zh' | 'en' {
  const chineseChars = (text.substring(0, 500).match(/[\u4e00-\u9fff]/g) || []).length;
  return chineseChars / Math.min(text.length, 500) > 0.1 ? 'zh' : 'en';
}
