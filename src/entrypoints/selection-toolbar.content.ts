/**
 * ContextPrompt AI v4.0 — Selection Toolbar Content Script
 * Displays a floating toolbar when the user selects text on a webpage.
 * Uses Shadow DOM for style isolation.
 */

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  runAt: 'document_idle',

  main() {
    const MIN_SELECTION_LENGTH = 10;
    let toolbarHost: HTMLDivElement | null = null;
    let shadowRoot: ShadowRoot | null = null;
    let toolbar: HTMLDivElement | null = null;

    // ── Create Shadow DOM Host ──
    function createToolbar(): void {
      if (toolbarHost) return;

      toolbarHost = document.createElement('div');
      toolbarHost.id = 'contextprompt-selection-toolbar';
      toolbarHost.style.cssText = 'position:absolute;z-index:2147483647;pointer-events:none;';
      document.body.appendChild(toolbarHost);

      shadowRoot = toolbarHost.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = `
        .cp-toolbar {
          display: flex;
          gap: 4px;
          padding: 6px 8px;
          background: #1e293b;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
          pointer-events: auto;
          animation: cpFadeIn 0.15s ease;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .cp-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          border: none;
          border-radius: 5px;
          background: transparent;
          color: #e2e8f0;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s;
          font-family: inherit;
        }
        .cp-btn:hover { background: rgba(255,255,255,0.12); }
        .cp-btn svg { width: 14px; height: 14px; flex-shrink: 0; }
        .cp-divider { width: 1px; background: rgba(255,255,255,0.15); margin: 2px 2px; }
        @keyframes cpFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        .cp-toast {
          position: fixed;
          top: 16px;
          right: 16px;
          padding: 10px 16px;
          background: #C2410C;
          color: white;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          animation: cpFadeIn 0.2s ease;
          pointer-events: none;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
      `;
      shadowRoot.appendChild(style);

      toolbar = document.createElement('div');
      toolbar.className = 'cp-toolbar';
      const saveLabel = chrome.i18n.getMessage('save') || 'Save';
      const summaryLabel = chrome.i18n.getMessage('contentSummary') || 'Summary';
      const translateLabel = chrome.i18n.getMessage('translation') || 'Translate';
      const copyLabel = chrome.i18n.getMessage('copy') || 'Copy';

      toolbar.innerHTML = `
        <button class="cp-btn" data-action="save" title="${saveLabel}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V5l-3-3z"/>
            <path d="M9 2v3h3M7 8h2M7 10.5h4"/>
          </svg>
          ${saveLabel}
        </button>
        <div class="cp-divider"></div>
        <button class="cp-btn" data-action="summarize" title="${summaryLabel}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 4h10M3 7h7M3 10h5"/>
          </svg>
          ${summaryLabel}
        </button>
        <button class="cp-btn" data-action="translate" title="${translateLabel}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6M5 1v2M3 3c.6 2.8 2.4 5 5 6.5M9 3c-.6 2.8-2.4 5-5 6.5"/>
            <path d="M9 9l1.5 4 1.5-4 1.5 4"/>
          </svg>
          ${translateLabel}
        </button>
        <button class="cp-btn" data-action="copy" title="${copyLabel}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="5" width="8" height="8" rx="1"/>
            <path d="M3 11V3h8"/>
          </svg>
          ${copyLabel}
        </button>
      `;

      // Event handlers
      toolbar.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.cp-btn') as HTMLElement | null;
        if (!btn) return;

        const action = btn.dataset.action;
        const selectedText = window.getSelection()?.toString().trim() || '';
        if (!selectedText) return;

        handleToolbarAction(action!, selectedText);
      });

      shadowRoot.appendChild(toolbar);
    }

    // ── Position Toolbar ──
    function showToolbar(rect: DOMRect): void {
      if (!toolbarHost || !toolbar) return;

      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      // Position above selection
      let top = rect.top + scrollY - 44;
      let left = rect.left + scrollX + (rect.width / 2) - 150;

      // If toolbar would go above viewport, show below
      if (top - scrollY < 10) {
        top = rect.bottom + scrollY + 8;
      }

      // Clamp horizontal position
      left = Math.max(8, Math.min(left, document.documentElement.scrollWidth - 310));

      toolbarHost.style.top = `${top}px`;
      toolbarHost.style.left = `${left}px`;
      toolbarHost.style.display = 'block';
    }

    function hideToolbar(): void {
      if (toolbarHost) {
        toolbarHost.style.display = 'none';
      }
    }

    // ── Action Handlers ──
    async function handleToolbarAction(action: string, text: string): Promise<void> {
      try {
        switch (action) {
          case 'save':
            await chrome.runtime.sendMessage({
              action: 'captureToKnowledge',
              data: {
                title: document.title,
                url: location.href,
                selection: text,
                description: text.substring(0, 200),
                mainContent: text,
                tags: [],
              },
            });
            showToast(chrome.i18n.getMessage('savedToKnowledge') || 'Saved to knowledge base');
            break;

          case 'summarize':
            showToast(chrome.i18n.getMessage('summaryInProgress') || 'Summarizing...');
            const summary = await chrome.runtime.sendMessage({
              action: 'summarizeSelection',
              data: { content: text },
            });
            if (summary?.success && summary.summary) {
              await navigator.clipboard.writeText(summary.summary);
              showToast(chrome.i18n.getMessage('summaryCopied') || 'Summary copied to clipboard');
            } else {
              showToast(chrome.i18n.getMessage('summarizeFailed') || 'Summarization failed');
            }
            break;

          case 'translate':
            showToast(chrome.i18n.getMessage('translating') || 'Translating...');
            const translation = await chrome.runtime.sendMessage({
              action: 'translateSelection',
              data: { content: text },
            });
            if (translation?.success && translation.result) {
              await navigator.clipboard.writeText(translation.result);
              showToast(chrome.i18n.getMessage('translationCopied') || 'Translation copied to clipboard');
            } else {
              showToast(chrome.i18n.getMessage('translateFailed') || 'Translation failed');
            }
            break;

          case 'copy': {
            const markdown = `> ${text.replace(/\n/g, '\n> ')}\n\n— [${document.title}](${location.href})`;
            await navigator.clipboard.writeText(markdown);
            showToast(chrome.i18n.getMessage('copiedMarkdown') || 'Copied as Markdown');
            break;
          }
        }
      } catch (err) {
        console.error('[SelectionToolbar] Action error:', err);
        showToast(chrome.i18n.getMessage('operationFailed') || 'Operation failed');
      }

      hideToolbar();
    }

    // ── Toast Notification ──
    function showToast(message: string): void {
      if (!shadowRoot) return;
      const existing = shadowRoot.querySelector('.cp-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.className = 'cp-toast';
      toast.textContent = message;
      shadowRoot.appendChild(toast);

      setTimeout(() => toast.remove(), 2500);
    }

    // ── Event Listeners ──
    createToolbar();

    document.addEventListener('mouseup', (e) => {
      // Ignore clicks on the toolbar itself
      if (toolbarHost?.contains(e.target as Node)) return;

      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim() || '';

        if (text.length >= MIN_SELECTION_LENGTH && selection?.rangeCount) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          showToolbar(rect);
        } else {
          hideToolbar();
        }
      }, 10);
    });

    document.addEventListener('mousedown', (e) => {
      // Hide toolbar when clicking outside
      if (toolbarHost && !toolbarHost.contains(e.target as Node)) {
        hideToolbar();
      }
    });

    document.addEventListener('scroll', () => hideToolbar(), { passive: true });
  },
});
