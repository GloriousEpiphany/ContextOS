/**
 * Optional AI conversation observer.
 *
 * Default OFF via feature flag. When enabled, captures visible ChatGPT /
 * Claude / Qwen conversation turns locally. Background redacts PII before
 * storage and links obvious arXiv mentions to paper records.
 */

import { isEnabled } from '@/lib/feature-flags';

type ChatSource = 'chatgpt' | 'claude' | 'qwen';
type ChatRole = 'user' | 'assistant';

interface ChatTurn {
  role: ChatRole;
  text: string;
}

interface PlatformConfig {
  source: ChatSource;
  selectors: string[];
}

const OBSERVE_INTERVAL_MS = 15_000;
const MIN_TEXT_LENGTH = 8;

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  'chat.openai.com': {
    source: 'chatgpt',
    selectors: ['[data-message-author-role]', '[data-testid^="conversation-turn-"]'],
  },
  'chatgpt.com': {
    source: 'chatgpt',
    selectors: ['[data-message-author-role]', '[data-testid^="conversation-turn-"]'],
  },
  'claude.ai': {
    source: 'claude',
    selectors: ['[data-testid="user-message"]', '[data-testid="ai-message"]', '.font-claude-message', '.font-user-message'],
  },
  'chat.qwen.ai': {
    source: 'qwen',
    selectors: ['[class*="chatItem"]', '[class*="message-content"]', '.chat-msg-item', '.markdown-body'],
  },
};

export default defineContentScript({
  matches: ['*://chat.openai.com/*', '*://chatgpt.com/*', '*://claude.ai/*', '*://chat.qwen.ai/*'],
  runAt: 'document_idle',

  async main() {
    const config = PLATFORM_CONFIGS[location.hostname];
    if (!config) return;

    const enabled = await isEnabled('ai_conversation_observer').catch(() => false);
    if (!enabled) return;

    let lastFingerprint = '';

    async function captureIfChanged() {
      const messages = extractMessages(config);
      if (messages.length === 0) return;

      const fingerprint = messages.map((message) => `${message.role}:${message.text}`).join('\n');
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;

      await chrome.runtime.sendMessage({
        action: 'storeChatConversation',
        data: {
          source: config.source,
          conversationId: getConversationId(config.source),
          url: location.href,
          title: document.title,
          messages,
          capturedAt: Date.now(),
        },
      }).catch(() => {});
    }

    await captureIfChanged();
    const interval = window.setInterval(captureIfChanged, OBSERVE_INTERVAL_MS);
    window.addEventListener('pagehide', () => window.clearInterval(interval), { once: true });
  },
});

function extractMessages(config: PlatformConfig): ChatTurn[] {
  const messages: ChatTurn[] = [];
  const seen = new Set<string>();

  for (const selector of config.selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    if (elements.length === 0) continue;

    for (const element of elements) {
      const text = normalizeText(element.textContent ?? '');
      if (text.length < MIN_TEXT_LENGTH || seen.has(text)) continue;
      seen.add(text);
      messages.push({ role: inferRole(element, config.source), text });
    }

    if (messages.length > 0) break;
  }

  return messages.slice(-40);
}

function inferRole(element: Element, source: ChatSource): ChatRole {
  const role = element.getAttribute('data-message-author-role');
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';

  const testId = element.getAttribute('data-testid')?.toLowerCase() ?? '';
  const className = String((element as HTMLElement).className ?? '').toLowerCase();

  if (testId.includes('user') || className.includes('user') || className.includes('human')) return 'user';
  if (testId.includes('ai') || className.includes('assistant') || className.includes('claude')) return 'assistant';

  if (source === 'qwen' && messagesLookUserAuthored(element)) return 'user';
  return 'assistant';
}

function messagesLookUserAuthored(element: Element): boolean {
  const text = `${element.getAttribute('class') ?? ''} ${element.getAttribute('data-role') ?? ''}`.toLowerCase();
  return text.includes('user') || text.includes('mine') || text.includes('question');
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function getConversationId(source: ChatSource): string {
  const path = location.pathname.replace(/\/+$/, '');
  if (path && path !== '/') return `${source}:${path}`;
  return `${source}:${location.hostname}`;
}
