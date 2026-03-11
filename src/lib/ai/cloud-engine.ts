/**
 * ContextPrompt AI v4.0 — Cloud AI Engine
 * Unified API client for multiple cloud AI providers.
 * Migrated from lib/ai-service.js with TypeScript types.
 */

import { AI_PROVIDER_CONFIGS } from '@/types/index';

export type { AIProviderConfig } from '@/types/index';

/** Re-export for backward compat — canonical source is types/index.ts */
export const API_PROVIDERS = AI_PROVIDER_CONFIGS;

export interface CloudAISettings {
  aiEnabled: boolean;
  aiProvider: string;
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CallOptions {
  temperature?: number;
  maxTokens?: number;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text: string }>;
  error?: { message: string };
}

interface OpenAIResponse {
  choices?: Array<{ message: { content: string } }>;
  error?: { message: string };
}

export class CloudAIEngine {
  private enabled: boolean;
  private provider: string;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(settings: Partial<CloudAISettings> = {}) {
    this.enabled = settings.aiEnabled ?? false;
    this.provider = settings.aiProvider ?? 'openai';
    this.apiKey = settings.aiApiKey ?? '';
    this.baseUrl = settings.aiBaseUrl ?? '';
    this.model = settings.aiModel ?? 'gpt-4o-mini';
  }

  updateSettings(settings: Partial<CloudAISettings>): void {
    this.enabled = settings.aiEnabled ?? this.enabled;
    this.provider = settings.aiProvider ?? this.provider;
    this.apiKey = settings.aiApiKey ?? this.apiKey;
    this.baseUrl = settings.aiBaseUrl ?? this.baseUrl;
    this.model = settings.aiModel ?? this.model;
  }

  isConfigured(): boolean {
    return this.enabled && !!this.apiKey && this.apiKey.length > 0;
  }

  private async fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const response = await fetch(url, init);
      if (response.ok || response.status < 500 || attempt === maxRetries - 1) {
        return response;
      }
      // Exponential backoff: 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
    // Unreachable, but satisfies TS
    return fetch(url, init);
  }

  private getBaseUrl(): string {
    if (this.provider === 'custom' && this.baseUrl) {
      return this.baseUrl;
    }
    const provider = this.provider as keyof typeof API_PROVIDERS;
    return API_PROVIDERS[provider]?.baseUrl ?? API_PROVIDERS.openai.baseUrl;
  }

  async callAPI(messages: ChatMessage[], options: CallOptions = {}): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('AI service not configured. Please set API key in settings.');
    }

    const baseUrl = this.getBaseUrl();
    const isAnthropic = this.provider === 'anthropic';
    const endpoint = isAnthropic
      ? `${baseUrl}/messages`
      : `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let requestBody: Record<string, unknown>;

    if (isAnthropic) {
      headers['x-api-key'] = this.apiKey;
      headers['anthropic-version'] = '2024-10-22';
      const systemMsg = messages.find((m) => m.role === 'system');
      const userMsgs = messages.filter((m) => m.role !== 'system');
      requestBody = {
        model: this.model,
        max_tokens: options.maxTokens ?? 1000,
        messages: userMsgs,
      };
      if (systemMsg) requestBody.system = systemMsg.content;
    } else {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      requestBody = {
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
      };
    }

    const response = await this.fetchWithRetry(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({} as Record<string, unknown>));
      const errMsg =
        (errorData as { error?: { message?: string }; message?: string }).error?.message ??
        (errorData as { message?: string }).message ??
        `API request failed: ${response.status}`;
      throw new Error(errMsg);
    }

    const data = await response.json();

    if (isAnthropic) {
      return (data as AnthropicResponse).content?.[0]?.text ?? '';
    }
    return (data as OpenAIResponse).choices?.[0]?.message?.content ?? '';
  }

  async summarize(
    content: string,
    options: { language?: string; maxLength?: number } = {},
  ): Promise<string> {
    const language = options.language ?? 'auto';
    const maxLength = options.maxLength ?? 500;

    const contentToSummarize =
      content.length > 12000
        ? content.substring(0, 12000) + '\n\n...(content truncated for summarization)'
        : content;

    const systemPrompt =
      language === 'zh'
        ? `你是一个专业的内容分析助手。请对以下网页内容进行全面的总结归纳：
1. 提炼核心主题和关键论点
2. 列出重要的数据、事实或结论
3. 保留关键的技术细节或专业术语
4. 如有多个章节，按逻辑结构组织摘要
控制在${maxLength}字以内，使用清晰的结构化格式。`
        : `You are a professional content analyst. Summarize the following web content:
1. Extract core themes and key arguments
2. List important data, facts, or conclusions
3. Preserve key technical details and domain terminology
4. Organize by logical structure if multiple sections exist
Keep within ${maxLength} words, use clear structured format.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Please analyze and summarize:\n\n${contentToSummarize}` },
    ];

    return this.callAPI(messages, {
      temperature: 0.3,
      maxTokens: Math.min(Math.max(maxLength * 2, 800), 2000),
    });
  }

  async analyzePromptQuality(prompt: string): Promise<{
    clarity: number;
    specificity: number;
    completeness: number;
    overall: number;
    suggestions: string[];
    improvedPrompt: string;
  }> {
    const systemPrompt = `You are a prompt quality analyst. Analyze the following prompt and return JSON:
{
  "clarity": 1-10,
  "specificity": 1-10,
  "completeness": 1-10,
  "overall": 1-10,
  "suggestions": ["suggestion1", "suggestion2"],
  "improvedPrompt": "improved version"
}
Return only JSON, no other text.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze this prompt:\n\n${prompt}` },
    ];

    const response = await this.callAPI(messages, { temperature: 0.3, maxTokens: 800 });

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // fall through to default
    }

    return {
      clarity: 5,
      specificity: 5,
      completeness: 5,
      overall: 5,
      suggestions: ['Unable to analyze — please check AI configuration'],
      improvedPrompt: prompt,
    };
  }

  async fuseContexts(
    contexts: Array<{ title: string; selection?: string; description?: string; chatContent?: string }>,
  ): Promise<string> {
    if (!contexts || contexts.length === 0) return '';
    if (contexts.length === 1) {
      return contexts[0].description ?? contexts[0].selection ?? '';
    }

    const contextTexts = contexts
      .map((ctx, i) => {
        const content = ctx.selection ?? ctx.description ?? ctx.chatContent ?? '';
        return `【Context ${i + 1}: ${ctx.title}】\n${content}`;
      })
      .join('\n\n---\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an intelligent context fusion assistant. Analyze the following multiple context sources, find relationships, and generate a coherent fused summary within 500 words.`,
      },
      { role: 'user', content: `Fuse these contexts:\n\n${contextTexts}` },
    ];

    return this.callAPI(messages, { temperature: 0.5, maxTokens: 800 });
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello, respond with "OK" to confirm connection.' },
      ];
      const response = await this.callAPI(messages, { maxTokens: 10 });
      return { success: true, message: response };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }
}
