/**
 * ContextPrompt AI v4.0 — Token Budget Manager
 * Estimates token counts and allocates budget across context sections.
 */

import type { TokenBudget } from '@/types/index';

// ----------------------------------------------------------------------------
// Model Token Limits
// ----------------------------------------------------------------------------

const MODEL_TOKEN_LIMITS: Record<string, number> = {
  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  // Anthropic
  'claude-sonnet-4-6-20250514': 200000,
  'claude-haiku-4-5-20251001': 200000,
  // DeepSeek
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  // Qwen
  'qwen-turbo': 8000,
  'qwen-plus': 32000,
  'qwen-max': 32000,
};

const DEFAULT_TOKEN_LIMIT = 32000;

/**
 * Get the token limit for a model.
 */
export function getModelTokenLimit(model: string): number {
  return MODEL_TOKEN_LIMITS[model] || DEFAULT_TOKEN_LIMIT;
}

/**
 * Estimate the number of tokens in a text string.
 * Uses a simple heuristic: English ~4 chars/token, Chinese ~1.5 chars/token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // CJK Unified Ideographs range
    if (code >= 0x4e00 && code <= 0x9fff) {
      tokens += 1.5;
    } else {
      tokens += 1 / 4;
    }
  }

  return Math.ceil(tokens);
}

/**
 * Budget allocation ratios (of usable tokens after reserved).
 */
const BUDGET_RATIOS = {
  system: 0.10,
  userQuery: 0.10,
  currentPage: 0.35,
  knowledgeGraph: 0.45,
};

/**
 * Allocate token budget across sections based on the target model.
 *
 * @param model - The AI model identifier
 * @param reservedTokens - Tokens reserved for model response (default 4096)
 */
export function allocateBudget(model: string, reservedTokens = 4096): TokenBudget {
  const total = getModelTokenLimit(model);
  const usable = total - reservedTokens;

  return {
    total,
    system: Math.floor(usable * BUDGET_RATIOS.system),
    userQuery: Math.floor(usable * BUDGET_RATIOS.userQuery),
    currentPage: Math.floor(usable * BUDGET_RATIOS.currentPage),
    knowledgeGraph: Math.floor(usable * BUDGET_RATIOS.knowledgeGraph),
    reserved: reservedTokens,
  };
}

/**
 * Truncate text to fit within a token budget.
 * Returns the truncated text.
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (!text) return '';
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  // Estimate character limit from token budget
  const ratio = maxTokens / estimated;
  const charLimit = Math.floor(text.length * ratio * 0.95); // 5% safety margin
  return text.substring(0, charLimit);
}
