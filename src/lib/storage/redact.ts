/**
 * PII redaction for chat history before exposure via MCP server-tools.
 *
 * Per eng review 2026-05-01: Exp #5 captures user conversations with
 * ChatGPT / Claude / Qwen. When MCP exposes those conversations to external
 * AI clients, we must strip:
 * - Email addresses
 * - Phone numbers
 * - Common API token patterns (sk-..., ghp_..., AKIA..., etc)
 *
 * This is a defense-in-depth measure. Users also get a "Wipe all chats"
 * button in Settings (defense-in-breadth).
 */

const EMAIL_RE = /\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/gi;

// Tokens: keep this conservative — we only strip patterns with low false-positive rate.
// Each entry: [pattern, replacement label]
const TOKEN_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g, '[anthropic-token]'], // Anthropic (must precede generic sk-)
  [/\bsk-(?!ant-)[A-Za-z0-9_\-]{20,}\b/g, '[openai-token]'],     // OpenAI
  [/\bghp_[A-Za-z0-9]{30,}\b/g, '[github-pat]'],           // GitHub fine-grained PAT
  [/\bgho_[A-Za-z0-9]{30,}\b/g, '[github-oauth]'],
  [/\bghs_[A-Za-z0-9]{30,}\b/g, '[github-server]'],
  [/\bghu_[A-Za-z0-9]{30,}\b/g, '[github-user]'],
  [/\bghr_[A-Za-z0-9]{30,}\b/g, '[github-refresh]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[aws-access-key]'],         // AWS access key
  [/\bxox[abrs]-[A-Za-z0-9\-]{10,}\b/g, '[slack-token]'], // Slack
  [/\bAIza[0-9A-Za-z_\-]{35}\b/g, '[google-api-key]'],   // Google API key
  [/\bhf_[A-Za-z0-9]{30,}\b/g, '[huggingface-token]'],   // HuggingFace
];

// Phone: international + (xxx) xxx-xxxx + xxx-xxx-xxxx + xx-xxxx-xxxx (CN-style)
const PHONE_RE =
  /(?:\+?\d{1,3}[\s\-.])?(?:\(?\d{2,4}\)?[\s\-.])?\d{3,4}[\s\-.]?\d{4}\b/g;

export interface RedactionStats {
  emails: number;
  tokens: number;
  phones: number;
}

export interface RedactionResult {
  text: string;
  stats: RedactionStats;
}

/**
 * Redact PII in `text`. Replaces matches with bracketed labels so the LLM
 * can still understand the structure ("[email] sent me [github-pat]").
 *
 * Phone matching is intentionally conservative — only obvious patterns.
 * Order matters: tokens first (they may contain digits that phone regex
 * would otherwise eat), then emails, then phones.
 */
export function redactPII(text: string): RedactionResult {
  if (!text) return { text: text ?? '', stats: { emails: 0, tokens: 0, phones: 0 } };

  let out = text;
  let tokens = 0;

  for (const [pattern, label] of TOKEN_PATTERNS) {
    out = out.replace(pattern, () => {
      tokens++;
      return label;
    });
  }

  let emails = 0;
  out = out.replace(EMAIL_RE, () => {
    emails++;
    return '[email]';
  });

  let phones = 0;
  out = out.replace(PHONE_RE, (match) => {
    // Only redact if it looks like a real phone number (>= 7 digits total)
    const digitCount = (match.match(/\d/g) ?? []).length;
    if (digitCount < 7) return match;
    phones++;
    return '[phone]';
  });

  return { text: out, stats: { emails, tokens, phones } };
}

/** Convenience: redact and discard stats. */
export function redact(text: string): string {
  return redactPII(text).text;
}
