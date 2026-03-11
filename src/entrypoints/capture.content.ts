/**
 * ContextPrompt AI v4.0 — Content Script: Page Context Capture
 * Captures page context (title, content, metadata, AI chat history)
 * when triggered by the background service worker.
 */

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    browser.runtime.onMessage.addListener(
      ((msg: unknown, _sender: unknown, sendResponse: (response?: unknown) => void) => {
        const message = msg as { action: string; options?: CaptureOptions };
        if (message.action !== 'captureContext') return;

        const depth = message.options?.captureDepth ?? 'standard';

        try {
          const context = capturePageContext(depth);
          sendResponse({ success: true, context });
        } catch (error) {
          sendResponse({
            success: false,
            error: (error as Error).message,
          });
        }

        return true;
      }) as Parameters<typeof browser.runtime.onMessage.addListener>[0],
    );
  },
});

// ==================== Types ====================

type CaptureDepth = 'light' | 'standard' | 'deep';

interface CaptureOptions {
  captureDepth: CaptureDepth;
}

interface OgData {
  title?: string;
  description?: string;
  image?: string;
  type?: string;
  siteName?: string;
}

interface PageContext {
  title: string;
  url: string;
  selection: string;
  description: string;
  ogData: OgData;
  structuredData: Record<string, unknown>[];
  mainContent: string;
  chatContent: string;
  isPrivateLink: boolean;
  platformName: string;
  captureDepth: CaptureDepth;
}

// ==================== Main Capture ====================

function capturePageContext(depth: CaptureDepth): PageContext {
  const title = document.title || '';
  const url = location.href;
  const selection = window.getSelection()?.toString().trim() || '';
  const description = getMetaDescription();

  const context: PageContext = {
    title,
    url,
    selection,
    description,
    ogData: {},
    structuredData: [],
    mainContent: '',
    chatContent: '',
    isPrivateLink: detectPrivateLink(url),
    platformName: '',
    captureDepth: depth,
  };

  if (depth === 'light') {
    return context;
  }

  // Standard and deep both include OG data and main content
  context.ogData = extractOgData();
  context.mainContent = extractMainContent(depth === 'deep' ? 0 : 5000);

  if (depth === 'deep') {
    context.structuredData = extractStructuredData();
    const platform = detectAIChatPlatform(url);
    if (platform) {
      context.platformName = platform;
      context.chatContent = extractChatContent(platform);
    }
  }

  return context;
}

// ==================== Meta Description ====================

function getMetaDescription(): string {
  const meta =
    document.querySelector<HTMLMetaElement>('meta[name="description"]') ||
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
  return meta?.content?.trim() || '';
}

// ==================== Open Graph Data ====================

function extractOgData(): OgData {
  const og = (property: string): string | undefined => {
    const el = document.querySelector<HTMLMetaElement>(
      `meta[property="og:${property}"], meta[name="og:${property}"]`,
    );
    return el?.content?.trim() || undefined;
  };

  return {
    title: og('title'),
    description: og('description'),
    image: og('image'),
    type: og('type'),
    siteName: og('site_name'),
  };
}

// ==================== Structured Data (JSON-LD) ====================

function extractStructuredData(): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );

  scripts.forEach((script) => {
    try {
      const data = JSON.parse(script.textContent || '');
      if (Array.isArray(data)) {
        results.push(...data);
      } else if (typeof data === 'object' && data !== null) {
        results.push(data);
      }
    } catch {
      // Malformed JSON-LD — skip
    }
  });

  return results;
}

// ==================== Main Content Extraction ====================

function extractMainContent(maxLength: number): string {
  // Clone the body so we can strip elements without affecting the page
  const clone = document.body.cloneNode(true) as HTMLElement;

  // Remove elements that are not useful content
  const removeTags = [
    'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
    'nav', 'header', 'footer', 'aside',
    'form', 'button', 'input', 'select', 'textarea',
  ];
  removeTags.forEach((tag) => {
    clone.querySelectorAll(tag).forEach((el) => el.remove());
  });

  // Remove hidden elements
  clone.querySelectorAll('[aria-hidden="true"], [hidden], [style*="display:none"], [style*="display: none"]').forEach((el) => el.remove());

  // Prefer semantic content containers
  const contentEl =
    clone.querySelector('article') ||
    clone.querySelector('main') ||
    clone.querySelector('[role="main"]') ||
    clone.querySelector('.post-content, .article-content, .entry-content, .content') ||
    clone;

  let text = (contentEl.textContent || '')
    // Collapse whitespace
    .replace(/[\t ]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  if (maxLength > 0 && text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

  return text;
}

// ==================== Private Link Detection ====================

function detectPrivateLink(url: string): boolean {
  const privatePatterns = [
    /localhost/i,
    /127\.0\.0\.\d+/,
    /192\.168\.\d+\.\d+/,
    /10\.\d+\.\d+\.\d+/,
    /172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
    /\.internal\b/i,
    /\.local\b/i,
    /\.corp\b/i,
    /\.intranet\b/i,
    /mail\.google\.com/i,
    /drive\.google\.com/i,
    /docs\.google\.com/i,
    /notion\.so/i,
    /slack\.com/i,
    /teams\.microsoft\.com/i,
    /figma\.com/i,
    /linear\.app/i,
    /jira/i,
    /confluence/i,
  ];

  return privatePatterns.some((pattern) => pattern.test(url));
}

// ==================== AI Chat Platform Detection ====================

interface PlatformPattern {
  name: string;
  pattern: RegExp;
}

const AI_PLATFORMS: PlatformPattern[] = [
  { name: 'ChatGPT',  pattern: /chat\.openai\.com|chatgpt\.com/i },
  { name: 'Claude',   pattern: /claude\.ai/i },
  { name: 'Gemini',   pattern: /gemini\.google\.com/i },
  { name: 'DeepSeek', pattern: /chat\.deepseek\.com/i },
  { name: 'Poe',      pattern: /poe\.com/i },
  { name: 'Perplexity', pattern: /perplexity\.ai/i },
  { name: 'Copilot',  pattern: /copilot\.microsoft\.com/i },
  { name: 'HuggingChat', pattern: /huggingface\.co\/chat/i },
  { name: 'Mistral',  pattern: /chat\.mistral\.ai/i },
  { name: 'Grok',     pattern: /grok\.x\.ai|x\.com\/i\/grok/i },
];

function detectAIChatPlatform(url: string): string | null {
  for (const { name, pattern } of AI_PLATFORMS) {
    if (pattern.test(url)) return name;
  }
  return null;
}

// ==================== AI Chat Content Extraction ====================

function extractChatContent(platform: string): string {
  const messages: string[] = [];

  // Each platform has different DOM structure — try platform-specific
  // selectors first, then fall back to generic conversational selectors
  const selectorMap: Record<string, string[]> = {
    ChatGPT: [
      '[data-message-author-role]',
      'div.group\\/conversation-turn',
      '.text-message',
    ],
    Claude: [
      '[data-testid="user-message"]',
      '[data-testid="ai-message"]',
      '.font-claude-message',
      '.font-user-message',
    ],
    Gemini: [
      'message-content',
      '.query-content',
      '.response-content',
      '.conversation-container .message',
    ],
    DeepSeek: [
      '.ds-markdown',
      '.chat-message',
      '.chat-message-content',
    ],
    Poe: [
      '[class*="Message_row"]',
      '.Message_botMessageBubble__',
      '.Message_humanMessageBubble__',
    ],
    Perplexity: [
      '.prose',
      '[data-testid="answer-text"]',
    ],
    Copilot: [
      '.ac-textBlock',
      '[data-content]',
    ],
    HuggingChat: [
      '.message-body',
      '.chat-message',
    ],
    Mistral: [
      '.prose',
      '.message-content',
    ],
    Grok: [
      '[data-testid="tweetText"]',
      '.message-bubble',
    ],
  };

  const selectors = selectorMap[platform] || [];
  const genericSelectors = [
    '[role="presentation"]',
    '.message',
    '.chat-message',
    '.conversation-turn',
  ];

  const allSelectors = [...selectors, ...genericSelectors];

  for (const selector of allSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      elements.forEach((el) => {
        const role = inferMessageRole(el, platform);
        const text = (el.textContent || '').replace(/[\t ]+/g, ' ').trim();
        if (text.length > 0) {
          messages.push(`[${role}]: ${text}`);
        }
      });
      break; // Use the first selector that matches
    }
  }

  return messages.join('\n\n');
}

function inferMessageRole(el: Element, platform: string): string {
  // Check data attributes
  const authorRole = el.getAttribute('data-message-author-role');
  if (authorRole) return authorRole;

  // Check common class/attribute patterns
  const className = el.className?.toString?.() || '';
  const lowerClass = className.toLowerCase();

  if (lowerClass.includes('human') || lowerClass.includes('user')) return 'user';
  if (lowerClass.includes('bot') || lowerClass.includes('assistant') || lowerClass.includes('ai')) return 'assistant';

  // Platform-specific heuristics
  if (platform === 'Claude') {
    const testId = el.getAttribute('data-testid') || '';
    if (testId.includes('user')) return 'user';
    if (testId.includes('ai')) return 'assistant';
  }

  return 'message';
}
