/**
 * ContextPrompt AI v4.0 — Three-Level AI Router
 * Routes tasks to the most appropriate AI engine:
 *   Level 1: Chrome Built-in AI (Gemini Nano) — free, instant, English/Spanish/Japanese only
 *   Level 2: WebLLM (browser-local LLM) — free, local, ~2-5s (future implementation)
 *   Level 3: Cloud API (OpenAI/Anthropic/DeepSeek/Qwen) — paid, high quality
 */

import { LocalAIEngine } from './local-engine';
import { CloudAIEngine } from './cloud-engine';
import type { CloudAISettings } from './cloud-engine';

export type AITaskType =
  | 'summarize_short'    // <2000 chars
  | 'summarize_long'     // >2000 chars
  | 'keywords'           // keyword extraction
  | 'classify'           // content classification
  | 'translate'          // translation
  | 'prompt_optimize'    // optimize a prompt
  | 'quality_analyze'    // prompt quality analysis
  | 'fuse_contexts'      // merge multiple contexts
  | 'complex_reasoning'; // complex analysis/creation

export type AILevel = 'local_nano' | 'local_webllm' | 'cloud' | 'fallback_nlp';

interface RouteDecision {
  level: AILevel;
  reason: string;
}

export class AIRouter {
  private localEngine: LocalAIEngine;
  private cloudEngine: CloudAIEngine;
  private localCapabilitiesChecked = false;
  private localAvailable = false;
  private nanoAvailable = false;

  constructor() {
    this.localEngine = new LocalAIEngine();
    this.cloudEngine = new CloudAIEngine();
  }

  updateCloudSettings(settings: Partial<CloudAISettings>): void {
    this.cloudEngine.updateSettings(settings);
  }

  /**
   * Initialize by checking local AI availability. Call once at startup.
   */
  async initialize(): Promise<void> {
    if (this.localCapabilitiesChecked) return;
    try {
      const status = await this.localEngine.checkCapabilities();
      this.nanoAvailable = status.promptAPIAvailable || status.summarizerAPIAvailable;
      this.localAvailable = this.nanoAvailable || status.webllmAvailable;
      this.localCapabilitiesChecked = true;
    } catch {
      this.localCapabilitiesChecked = true;
    }
  }

  /**
   * Decide which AI engine to route a task to.
   */
  private route(task: AITaskType, contentLanguage: string): RouteDecision {
    const isNanoLanguage = !['zh', 'ko', 'ar', 'ru'].includes(contentLanguage);
    const cloudConfigured = this.cloudEngine.isConfigured();

    switch (task) {
      case 'summarize_short':
        if (this.nanoAvailable && isNanoLanguage) {
          return { level: 'local_nano', reason: 'Short text + supported language → Gemini Nano' };
        }
        if (cloudConfigured) {
          return { level: 'cloud', reason: 'Nano unavailable or unsupported language → Cloud' };
        }
        return { level: 'fallback_nlp', reason: 'No AI available → rule-based NLP' };

      case 'summarize_long':
        if (cloudConfigured) {
          return { level: 'cloud', reason: 'Long text needs large context window → Cloud' };
        }
        if (this.nanoAvailable && isNanoLanguage) {
          return { level: 'local_nano', reason: 'Cloud unavailable → Nano with truncation' };
        }
        return { level: 'fallback_nlp', reason: 'No AI available → rule-based NLP' };

      case 'keywords':
      case 'classify':
        // These are simple enough for local NLP even without AI
        if (this.nanoAvailable && isNanoLanguage) {
          return { level: 'local_nano', reason: 'Simple task → Gemini Nano' };
        }
        return { level: 'fallback_nlp', reason: 'Use rule-based extraction' };

      case 'prompt_optimize':
        if (this.nanoAvailable && isNanoLanguage) {
          return { level: 'local_nano', reason: 'Prompt optimization → Gemini Nano' };
        }
        if (cloudConfigured) {
          return { level: 'cloud', reason: 'Prompt optimization → Cloud' };
        }
        return { level: 'fallback_nlp', reason: 'No AI → return original prompt' };

      case 'quality_analyze':
      case 'fuse_contexts':
      case 'complex_reasoning':
        if (cloudConfigured) {
          return { level: 'cloud', reason: 'Complex task requires high-quality model → Cloud' };
        }
        if (this.nanoAvailable && isNanoLanguage) {
          return { level: 'local_nano', reason: 'Cloud unavailable → Nano (degraded quality)' };
        }
        return { level: 'fallback_nlp', reason: 'No AI available' };

      case 'translate':
        // Chrome Translator API would go here in the future
        if (cloudConfigured) {
          return { level: 'cloud', reason: 'Translation → Cloud' };
        }
        return { level: 'fallback_nlp', reason: 'No translation available' };

      default:
        return { level: 'fallback_nlp', reason: 'Unknown task type' };
    }
  }

  /**
   * Detect content language from text.
   */
  detectLanguage(text: string): string {
    const sample = text.substring(0, 500);
    const len = sample.length || 1;
    const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
    if (chineseChars / len > 0.1) return 'zh';
    // Japanese: Hiragana + Katakana
    const japaneseChars = (sample.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
    if (japaneseChars / len > 0.05) return 'ja';
    // Korean: Hangul
    const koreanChars = (sample.match(/[\uac00-\ud7af\u1100-\u11ff]/g) || []).length;
    if (koreanChars / len > 0.05) return 'ko';
    return 'en';
  }

  /**
   * Summarize content using the best available engine.
   */
  async summarize(
    content: string,
    options: { language?: string; maxLength?: number } = {},
  ): Promise<{ result: string; level: AILevel }> {
    await this.initialize();

    const language = options.language ?? this.detectLanguage(content);
    const taskType: AITaskType = content.length > 2000 ? 'summarize_long' : 'summarize_short';
    const decision = this.route(taskType, language);

    switch (decision.level) {
      case 'local_nano': {
        const result = await this.localEngine.summarize(content, {
          type: 'key-points',
          length: (options.maxLength ?? 500) > 300 ? 'medium' : 'short',
        });
        if (result) return { result, level: 'local_nano' };
        // Fallthrough to cloud if Nano fails
        if (this.cloudEngine.isConfigured()) {
          const cloudResult = await this.cloudEngine.summarize(content, options);
          return { result: cloudResult, level: 'cloud' };
        }
        return { result: content.substring(0, options.maxLength ?? 500), level: 'fallback_nlp' };
      }

      case 'cloud': {
        const result = await this.cloudEngine.summarize(content, options);
        return { result, level: 'cloud' };
      }

      default:
        return {
          result: content.substring(0, options.maxLength ?? 500),
          level: 'fallback_nlp',
        };
    }
  }

  /**
   * Analyze prompt quality.
   */
  async analyzePromptQuality(prompt: string) {
    await this.initialize();
    const decision = this.route('quality_analyze', this.detectLanguage(prompt));

    if (decision.level === 'cloud' && this.cloudEngine.isConfigured()) {
      return this.cloudEngine.analyzePromptQuality(prompt);
    }

    // Fallback: simple heuristic analysis
    const wordCount = prompt.split(/\s+/).length;
    const hasQuestion = /[?？]/.test(prompt);
    const hasContext = prompt.length > 200;

    return {
      clarity: Math.min(10, Math.floor(wordCount / 5) + (hasQuestion ? 3 : 0)),
      specificity: Math.min(10, Math.floor(wordCount / 10) + 3),
      completeness: hasContext ? 7 : 4,
      overall: Math.min(10, Math.floor(wordCount / 8) + (hasQuestion ? 2 : 0) + (hasContext ? 2 : 0)),
      suggestions: [
        ...(!hasQuestion ? ['Consider adding a clear question'] : []),
        ...(!hasContext ? ['Provide more context for better results'] : []),
      ],
      improvedPrompt: prompt,
    };
  }

  /**
   * Fuse multiple contexts.
   */
  async fuseContexts(
    contexts: Array<{ title: string; selection?: string; description?: string; chatContent?: string }>,
  ): Promise<{ result: string; level: AILevel }> {
    await this.initialize();

    if (this.cloudEngine.isConfigured()) {
      const result = await this.cloudEngine.fuseContexts(contexts);
      return { result, level: 'cloud' };
    }

    // Fallback: simple concatenation
    const combined = contexts
      .map((ctx) => `## ${ctx.title}\n${ctx.description ?? ctx.selection ?? ''}`)
      .join('\n\n---\n\n');
    return { result: combined, level: 'fallback_nlp' };
  }

  /**
   * Test cloud AI connection.
   */
  async testConnection() {
    return this.cloudEngine.testConnection();
  }

  /**
   * Get current engine status for UI display.
   */
  async getStatus(): Promise<{
    localNano: boolean;
    localWebLLM: boolean;
    cloud: boolean;
  }> {
    await this.initialize();
    return {
      localNano: this.nanoAvailable,
      localWebLLM: false, // Will be implemented with Offscreen Document
      cloud: this.cloudEngine.isConfigured(),
    };
  }

  destroy(): void {
    this.localEngine.destroy();
  }
}
