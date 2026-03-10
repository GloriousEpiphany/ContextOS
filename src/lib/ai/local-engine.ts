/**
 * ContextPrompt AI v4.0 — Local AI Engine
 * Integrates Chrome Built-in AI (Gemini Nano) and WebLLM for on-device inference.
 *
 * IMPORTANT LIMITATIONS:
 * - Gemini Nano (Chrome 138+): Only available for Chrome Extensions.
 *   Supports English, Spanish, Japanese as of Chrome 140. NO Chinese support yet.
 * - WebLLM: Requires WebGPU-capable GPU. Models are downloaded on first use (~500MB-2GB).
 * - Both engines run in an Offscreen Document to survive Service Worker termination.
 */

/** Chrome Built-in AI types (not yet in @types/chrome) */
declare namespace ai {
  interface LanguageModel {
    create(options?: { systemPrompt?: string }): Promise<LanguageModelSession>;
    capabilities(): Promise<{ available: 'readily' | 'after-download' | 'no' }>;
  }
  interface LanguageModelSession {
    prompt(input: string): Promise<string>;
    promptStreaming(input: string): ReadableStream<string>;
    destroy(): void;
  }
  interface Summarizer {
    create(options?: {
      type?: 'key-points' | 'tl;dr' | 'teaser' | 'headline';
      length?: 'short' | 'medium' | 'long';
      format?: 'plain-text' | 'markdown';
    }): Promise<SummarizerSession>;
    capabilities(): Promise<{ available: 'readily' | 'after-download' | 'no' }>;
  }
  interface SummarizerSession {
    summarize(text: string): Promise<string>;
    destroy(): void;
  }
}

declare global {
  interface WindowOrWorkerGlobalScope {
    ai?: {
      languageModel?: ai.LanguageModel;
      summarizer?: ai.Summarizer;
    };
  }
}

export type LocalAICapability = 'prompt' | 'summarize' | 'none';

export interface LocalAIStatus {
  chromeAIAvailable: boolean;
  promptAPIAvailable: boolean;
  summarizerAPIAvailable: boolean;
  webllmAvailable: boolean;
  capabilities: LocalAICapability[];
}

/**
 * Local AI Engine — wraps Chrome Built-in AI APIs.
 * WebLLM integration is planned for Phase 1c via Offscreen Document.
 */
export class LocalAIEngine {
  private promptSession: ai.LanguageModelSession | null = null;
  private summarizerSession: ai.SummarizerSession | null = null;

  /**
   * Check what local AI capabilities are available.
   */
  async checkCapabilities(): Promise<LocalAIStatus> {
    const status: LocalAIStatus = {
      chromeAIAvailable: false,
      promptAPIAvailable: false,
      summarizerAPIAvailable: false,
      webllmAvailable: false,
      capabilities: [],
    };

    try {
      if (typeof self !== 'undefined' && self.ai) {
        status.chromeAIAvailable = true;

        if (self.ai.languageModel) {
          const caps = await self.ai.languageModel.capabilities();
          if (caps.available !== 'no') {
            status.promptAPIAvailable = true;
            status.capabilities.push('prompt');
          }
        }

        if (self.ai.summarizer) {
          const caps = await self.ai.summarizer.capabilities();
          if (caps.available !== 'no') {
            status.summarizerAPIAvailable = true;
            status.capabilities.push('summarize');
          }
        }
      }
    } catch {
      // Chrome AI APIs not available
    }

    // WebGPU check (prerequisite for WebLLM)
    try {
      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          status.webllmAvailable = true;
        }
      }
    } catch {
      // WebGPU not available
    }

    if (status.capabilities.length === 0) {
      status.capabilities.push('none');
    }

    return status;
  }

  /**
   * Summarize text using Chrome Summarizer API.
   * Falls back to Prompt API if Summarizer is unavailable.
   *
   * NOTE: Only works with English/Spanish/Japanese content as of Chrome 140.
   */
  async summarize(
    text: string,
    options: { type?: 'key-points' | 'tl;dr'; length?: 'short' | 'medium' | 'long' } = {},
  ): Promise<string | null> {
    // Try Summarizer API first
    try {
      if (self.ai?.summarizer) {
        const caps = await self.ai.summarizer.capabilities();
        if (caps.available !== 'no') {
          if (!this.summarizerSession) {
            this.summarizerSession = await self.ai.summarizer.create({
              type: options.type ?? 'key-points',
              length: options.length ?? 'medium',
              format: 'markdown',
            });
          }
          // Truncate input to ~4K tokens (~16K chars) for Nano's context window
          const truncated = text.length > 16000 ? text.substring(0, 16000) : text;
          return await this.summarizerSession.summarize(truncated);
        }
      }
    } catch (e) {
      console.warn('[LocalAI] Summarizer API failed:', e);
      this.summarizerSession = null;
    }

    // Fallback to Prompt API
    return this.prompt(
      `Summarize the following text in ${options.length ?? 'medium'} length, using ${options.type ?? 'key-points'} format:\n\n${text.substring(0, 8000)}`,
    );
  }

  /**
   * Send a prompt to Gemini Nano via Chrome Prompt API.
   * Returns null if unavailable.
   */
  async prompt(input: string, systemPrompt?: string): Promise<string | null> {
    try {
      if (!self.ai?.languageModel) return null;

      const caps = await self.ai.languageModel.capabilities();
      if (caps.available === 'no') return null;

      if (!this.promptSession) {
        this.promptSession = await self.ai.languageModel.create({
          systemPrompt: systemPrompt ?? 'You are a helpful assistant.',
        });
      }

      // Truncate to stay within Nano's context window
      const truncated = input.length > 8000 ? input.substring(0, 8000) : input;
      return await this.promptSession.prompt(truncated);
    } catch (e) {
      console.warn('[LocalAI] Prompt API failed:', e);
      this.promptSession = null;
      return null;
    }
  }

  /**
   * Detect if content is in a language supported by Gemini Nano.
   */
  isLanguageSupportedByNano(text: string): boolean {
    const sample = text.substring(0, 500);
    const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
    const japaneseChars = (sample.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
    // Chinese is NOT supported, Japanese IS supported
    if (chineseChars / sample.length > 0.1) return false;
    // English, Spanish, Japanese are supported
    return true;
  }

  /**
   * Clean up sessions to free memory.
   */
  destroy(): void {
    try {
      this.promptSession?.destroy();
      this.summarizerSession?.destroy();
    } catch {
      // ignore cleanup errors
    }
    this.promptSession = null;
    this.summarizerSession = null;
  }
}
