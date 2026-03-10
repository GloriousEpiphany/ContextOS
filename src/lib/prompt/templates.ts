/**
 * ContextPrompt AI v4.0 — Prompt Templates
 * Default and built-in prompt templates.
 */

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  category?: string;
}

export const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'standard',
    name: 'Standard',
    template: '📌 Context from: {title}\n🔗 {url}\n\n{summary}\n\n❓ My question: {query}',
  },
  {
    id: 'detailed',
    name: 'Detailed',
    template:
      '📌 Source: {title}\n🔗 URL: {url}\n\n📄 Content:\n{content}\n\n❓ Question: {query}',
  },
  {
    id: 'chinese',
    name: '中文模板',
    template:
      '📌 来源：{title}\n🔗 链接：{url}\n\n🤖 内容摘要：\n{summary}\n\n❓ 我的问题：{query}',
  },
  {
    id: 'ai_chat',
    name: 'AI Chat Context',
    template:
      '📌 来自 AI 对话: {title}\n\n💬 对话内容摘要:\n{chatSummary}\n\n⚠️ 注意：原始对话链接为私有链接，无法直接访问。\n\n❓ 我的问题: {query}',
  },
];

export const PROMPT_LIBRARY: PromptTemplate[] = [
  // Code Review
  {
    id: 'lib_code_review',
    name: 'Review Code Quality',
    category: 'code',
    template:
      'Please review the following code for quality, bugs, and improvements:\n\n{content}\n\nFocus on: correctness, performance, readability, and best practices.',
  },
  {
    id: 'lib_code_explain',
    name: 'Explain Code',
    category: 'code',
    template:
      'Please explain the following code in detail:\n\n{content}\n\nInclude: purpose, how it works, key concepts used.',
  },
  {
    id: 'lib_code_refactor',
    name: 'Refactor Suggestions',
    category: 'code',
    template:
      'Suggest refactoring improvements for this code:\n\n{content}\n\nConsider: DRY, SOLID, performance, readability.',
  },
  // Content Summary
  {
    id: 'lib_summary_exec',
    name: 'Executive Summary',
    category: 'summary',
    template:
      'Provide an executive summary of the following content:\n\n📌 Source: {title}\n\n{content}\n\nKeep it concise (3-5 bullet points) with key takeaways.',
  },
  {
    id: 'lib_summary_eli5',
    name: 'ELI5',
    category: 'summary',
    template:
      'Explain the following content as if I were 5 years old:\n\n📌 Source: {title}\n\n{content}\n\nUse simple language and analogies.',
  },
  // Translation
  {
    id: 'lib_translate_en',
    name: 'Translate to English',
    category: 'translation',
    template: 'Translate the following text to English:\n\n{selection}',
  },
  {
    id: 'lib_translate_zh',
    name: '翻译为中文',
    category: 'translation',
    template: '请将以下内容翻译为中文：\n\n{selection}',
  },
  {
    id: 'lib_translate_bilingual',
    name: 'Bilingual Comparison',
    category: 'translation',
    template:
      'Provide a bilingual (English + Chinese) translation of the following text. Show both versions side by side:\n\n{selection}',
  },
];

/**
 * Apply template variables to a template string.
 */
export function applyTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}
