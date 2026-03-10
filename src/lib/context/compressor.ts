/**
 * ContextPrompt AI v4.0 — Context Compressor
 * Compresses and formats context sections to fit within token budgets.
 */

import { extractKeyPoints } from '../nlp-engine';
import { estimateTokens, truncateToTokenBudget } from './budget';

/**
 * Compress text to fit within a target token budget.
 * Strategy: preserve first/last sentences + extract key sentences.
 */
export function compressText(text: string, targetTokens: number): string {
  if (!text) return '';

  const currentTokens = estimateTokens(text);
  if (currentTokens <= targetTokens) return text;

  // Try extractive compression first
  const sentences = text.split(/(?<=[.!?。！？])\s+/).filter((s) => s.trim().length > 10);

  if (sentences.length <= 3) {
    return truncateToTokenBudget(text, targetTokens);
  }

  // Keep first and last sentences
  const first = sentences[0];
  const last = sentences[sentences.length - 1];

  // Extract key points from the middle
  const middleText = sentences.slice(1, -1).join(' ');
  const remaining = targetTokens - estimateTokens(first) - estimateTokens(last) - 10;

  if (remaining <= 0) {
    return truncateToTokenBudget(first, targetTokens);
  }

  const middleSentenceCount = Math.max(1, Math.floor(remaining / 50));
  const keyPoints = extractKeyPoints(middleText, middleSentenceCount);
  const compressed = [first, keyPoints, last].filter(Boolean).join('\n');

  return truncateToTokenBudget(compressed, targetTokens);
}

/**
 * Format context sections into a structured Markdown context package.
 */
export function formatContextPackage(sections: {
  systemPrompt?: string;
  userQuery?: string;
  currentPage?: { title: string; url: string; content: string } | null;
  knowledgeResults?: Array<{ title: string; summary: string; url: string; tags: string[] }>;
}): string {
  const parts: string[] = [];

  if (sections.currentPage) {
    parts.push(
      `## Current Page Context`,
      `**Title:** ${sections.currentPage.title}`,
      `**URL:** ${sections.currentPage.url}`,
      '',
      sections.currentPage.content,
    );
  }

  if (sections.knowledgeResults && sections.knowledgeResults.length > 0) {
    parts.push('', `## Related Knowledge (${sections.knowledgeResults.length} items)`);
    for (const item of sections.knowledgeResults) {
      parts.push(
        '',
        `### ${item.title}`,
        `- **URL:** ${item.url}`,
        `- **Tags:** ${item.tags.join(', ')}`,
        '',
        item.summary,
      );
    }
  }

  if (sections.userQuery) {
    parts.push('', `## User Query`, '', sections.userQuery);
  }

  return parts.join('\n');
}
