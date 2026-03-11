/**
 * ContextPrompt AI v4.0 — Injector Content Script
 * Injects "Craft Prompt" button into AI chat platforms.
 * Uses Shadow DOM for style isolation.
 */

export default defineContentScript({
  matches: [
    '*://chat.openai.com/*',
    '*://chatgpt.com/*',
    '*://claude.ai/*',
    '*://gemini.google.com/*',
    '*://chat.deepseek.com/*',
    '*://chat.qwen.ai/*',
    '*://www.doubao.com/*',
    '*://poe.com/*',
    '*://www.perplexity.ai/*',
    '*://perplexity.ai/*',
    '*://copilot.microsoft.com/*',
    '*://huggingface.co/chat*',
    '*://chat.mistral.ai/*',
    '*://grok.x.ai/*',
  ],
  runAt: 'document_idle',

  main() {
    // ── Platform Config ──
    interface PlatformConfig {
      name: string;
      inputSelector: string;
      containerSelector: string;
      inputType: 'textarea' | 'contenteditable' | 'auto';
    }

    const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
      'chat.openai.com':       { name: 'ChatGPT',    inputSelector: '#prompt-textarea',                                  containerSelector: 'form',                                              inputType: 'textarea' },
      'chatgpt.com':           { name: 'ChatGPT',    inputSelector: '#prompt-textarea',                                  containerSelector: 'form',                                              inputType: 'textarea' },
      'claude.ai':             { name: 'Claude',      inputSelector: '[contenteditable="true"]',                          containerSelector: 'fieldset, form, .composer',                         inputType: 'contenteditable' },
      'gemini.google.com':     { name: 'Gemini',      inputSelector: 'div[role="textbox"], rich-textarea',                containerSelector: '.input-area, form',                                 inputType: 'contenteditable' },
      'chat.deepseek.com':     { name: 'DeepSeek',    inputSelector: 'textarea, [contenteditable="true"]',               containerSelector: '.chat-input, .chat-input-panel, form',              inputType: 'auto' },
      'chat.qwen.ai':          { name: 'Qwen',        inputSelector: 'textarea, [contenteditable="true"]',               containerSelector: '.chat-input, form, .input-wrapper',                 inputType: 'auto' },
      'www.doubao.com':         { name: 'Doubao',      inputSelector: 'textarea, [contenteditable="true"]',               containerSelector: '.chat-input-container, form, .input-area',          inputType: 'auto' },
      'poe.com':               { name: 'Poe',         inputSelector: 'textarea, [contenteditable="true"]',               containerSelector: 'form, .ChatMessageInputContainer, [class*="Input"]', inputType: 'auto' },
      'www.perplexity.ai':     { name: 'Perplexity',  inputSelector: 'textarea, [contenteditable="true"]',               containerSelector: 'form, .input-wrapper',                              inputType: 'auto' },
      'perplexity.ai':         { name: 'Perplexity',  inputSelector: 'textarea, [contenteditable="true"]',               containerSelector: 'form, .input-wrapper',                              inputType: 'auto' },
      'copilot.microsoft.com': { name: 'Copilot',     inputSelector: 'textarea, [contenteditable="true"]',               containerSelector: 'form, .input-container',                            inputType: 'auto' },
      'huggingface.co':        { name: 'HuggingChat', inputSelector: 'textarea, [contenteditable="true"]',               containerSelector: 'form, .input-container',                            inputType: 'auto' },
      'chat.mistral.ai':       { name: 'Mistral',     inputSelector: 'textarea, [contenteditable="true"]',               containerSelector: 'form, .chat-input',                                 inputType: 'auto' },
      'grok.x.ai':             { name: 'Grok',        inputSelector: 'textarea, [contenteditable="true"]',               containerSelector: 'form, .input-area',                                 inputType: 'auto' },
    };

    const host = window.location.hostname;
    const config = PLATFORM_CONFIGS[host];
    if (!config) return;

    // ── i18n helper ──
    function t(key: string, fallback: string): string {
      try {
        const msg = chrome.i18n.getMessage(key);
        if (msg) return msg;
      } catch { /* ignore */ }
      return fallback;
    }

    // ── Messaging with retry ──
    async function sendMsg(msg: Record<string, unknown>, retries = 1): Promise<any> {
      try {
        return await chrome.runtime.sendMessage(msg);
      } catch (err) {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 500));
          return sendMsg(msg, retries - 1);
        }
        throw err;
      }
    }

    // ── Shadow DOM Host ──
    let shadowHost: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;

    function createShadowHost(): ShadowRoot {
      if (shadow) return shadow;

      shadowHost = document.createElement('div');
      shadowHost.id = 'contextprompt-injector-host';
      shadowHost.style.cssText = 'all:initial;position:relative;z-index:9999;display:block;';
      shadow = shadowHost.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = INJECTOR_CSS;
      shadow.appendChild(style);

      return shadow;
    }

    // ── Create Button ──
    function createButton(root: ShadowRoot): HTMLButtonElement {
      const btn = document.createElement('button');
      btn.id = 'cp-inject-btn';
      btn.className = 'cp-inject-btn';
      btn.type = 'button';
      btn.title = t('craftPromptTitle', 'Generate and insert AI prompt');
      btn.innerHTML = `<span class="cp-icon">✨</span><span class="cp-text">${t('craftPrompt', 'Craft Prompt')}</span>`;
      btn.addEventListener('click', handleClick);
      root.appendChild(btn);
      return btn;
    }

    // ── Button Click Handler ──
    async function handleClick(e: Event) {
      e.preventDefault();
      e.stopPropagation();

      const btn = shadow?.getElementById('cp-inject-btn');
      if (btn) btn.classList.add('cp-loading');

      try {
        const context = await sendMsg({ action: 'getLatestContext' });
        if (!context) {
          showNotification(t('noContext', 'No captured context. Capture a page first.'), 'warning');
          return;
        }
        const settings = await sendMsg({ action: 'getSettings' });
        const templates = await sendMsg({ action: 'getTemplates' });
        const template = templates?.find((tpl: any) => tpl.id === settings?.defaultTemplate) || templates?.[0];
        if (!template) {
          showNotification(t('noTemplate', 'No template found'), 'warning');
          return;
        }
        const prompt = await generatePrompt(context, template, settings || {});
        showPreviewPanel(prompt, context, templates, settings || {});
      } catch (error) {
        showNotification(t('errorPrefix', 'Error: ') + (error as Error).message, 'error');
      } finally {
        if (btn) btn.classList.remove('cp-loading');
      }
    }

    // ── Prompt Generation ──
    async function generatePrompt(context: any, template: any, settings: any): Promise<string> {
      let prompt: string = template.template || '';

      // Build summary
      let summary = '';
      if (context.aiSummary) {
        summary = context.aiSummary;
      } else if (settings.aiEnabled) {
        try {
          const result = await sendMsg({
            action: 'summarizeWithAI',
            data: { content: context.mainContent || context.selection || context.description || '', language: settings.language || 'auto', maxLength: 300 },
          });
          summary = result?.success && result.summary ? result.summary : (context.description || context.selection || t('noDetailedContent', 'No detailed content'));
        } catch {
          summary = context.description || context.selection || t('noDetailedContent', 'No detailed content');
        }
      } else {
        summary = context.description || context.selection || t('noDetailedContent', 'No detailed content');
      }

      const content = context.aiSummary || summary || context.mainContent || context.selection || '';
      const chatSummary = context.chatContent ? summary : t('noChatContent', 'No chat content');

      prompt = prompt.replace(/\{title\}/g, context.title || t('untitled', 'Untitled'));
      prompt = prompt.replace(/\{url\}/g, context.url || '');
      prompt = prompt.replace(/\{summary\}/g, summary);
      prompt = prompt.replace(/\{content\}/g, content);
      prompt = prompt.replace(/\{selection\}/g, context.selection || t('noTextSelected', 'No text selected'));
      prompt = prompt.replace(/\{query\}/g, t('typeQuestionHere', '[Type your question here]'));
      prompt = prompt.replace(/\{description\}/g, context.description || '');
      prompt = prompt.replace(/\{chatSummary\}/g, chatSummary);

      return prompt;
    }

    // ── Preview Panel ──
    function showPreviewPanel(prompt: string, context: any, templates: any[], settings: any) {
      if (!shadow) return;
      removePreviewPanel();

      const panel = document.createElement('div');
      panel.id = 'cp-preview';
      panel.className = 'cp-preview';

      const templateOptions = (templates || [])
        .map((tpl: any) => `<option value="${tpl.id}" ${tpl.id === (settings.defaultTemplate || templates[0]?.id) ? 'selected' : ''}>${escapeHtml(tpl.name)}</option>`)
        .join('');

      panel.innerHTML = `
        <div class="cp-preview-header">
          <span class="cp-preview-title">✨ ${t('promptPreview', 'Prompt Preview')}</span>
          <button class="cp-preview-close" aria-label="Close">&times;</button>
        </div>
        <div class="cp-preview-toolbar">
          <select class="cp-template-switcher">${templateOptions}</select>
        </div>
        <textarea class="cp-preview-editor" rows="10">${escapeHtml(prompt)}</textarea>
        <div class="cp-preview-footer">
          <button class="cp-btn-cancel">${t('cancel', 'Cancel')}</button>
          <button class="cp-btn-insert">${t('insertPromptBtn', 'Insert Prompt')}</button>
        </div>
      `;
      shadow.appendChild(panel);
      requestAnimationFrame(() => panel.classList.add('show'));

      // Events
      panel.querySelector('.cp-preview-close')?.addEventListener('click', removePreviewPanel);
      panel.querySelector('.cp-btn-cancel')?.addEventListener('click', removePreviewPanel);
      panel.querySelector('.cp-btn-insert')?.addEventListener('click', async () => {
        const editor = panel.querySelector('.cp-preview-editor') as HTMLTextAreaElement;
        const text = editor?.value || '';
        removePreviewPanel();
        await insertPrompt(text);
        sendMsg({ action: 'savePromptHistory', data: { prompt: text, template: settings.defaultTemplate, contextTitle: context.title } }).catch(() => {});
        showNotification(t('promptInserted', 'Prompt inserted!'), 'success');
      });
      panel.querySelector('.cp-template-switcher')?.addEventListener('change', async (e) => {
        const newTemplate = templates.find((tpl: any) => tpl.id === (e.target as HTMLSelectElement).value) || templates[0];
        const newPrompt = await generatePrompt(context, newTemplate, settings);
        const editor = panel.querySelector('.cp-preview-editor') as HTMLTextAreaElement;
        if (editor) editor.value = newPrompt;
      });

      // Close on Escape
      const escHandler = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') { removePreviewPanel(); document.removeEventListener('keydown', escHandler); }
      };
      document.addEventListener('keydown', escHandler);
    }

    function removePreviewPanel() {
      const panel = shadow?.getElementById('cp-preview');
      if (panel) {
        panel.classList.remove('show');
        setTimeout(() => panel.remove(), 300);
      }
    }

    function escapeHtml(text: string): string {
      if (!text) return '';
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Insert Prompt into Chat Input ──
    async function insertPrompt(prompt: string) {
      const input = document.querySelector<HTMLElement>(config.inputSelector);
      if (!input) {
        showNotification(t('inputFieldNotFound', 'Input field not found'), 'error');
        return;
      }

      input.focus();
      const isContentEditable = input.hasAttribute('contenteditable') && input.getAttribute('contenteditable') !== 'false';

      if (isContentEditable) {
        if ((input.textContent || '').trim() === '' || input.querySelector('[data-placeholder]')) {
          input.innerHTML = '';
        }
        input.appendChild(document.createTextNode(prompt));
        input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: prompt }));
      } else {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(input, prompt);
        } else {
          (input as HTMLTextAreaElement).value = prompt;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Select query placeholder
      const placeholder = t('typeQuestionHere', '[Type your question here]');
      if (prompt.includes(placeholder)) {
        setTimeout(() => {
          if (isContentEditable) {
            const sel = window.getSelection();
            const range = document.createRange();
            const text = input.textContent || '';
            const start = text.indexOf(placeholder);
            if (start >= 0 && sel) {
              const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
              let node: Node | null;
              let idx = 0;
              while ((node = walker.nextNode())) {
                if (idx + (node.textContent?.length || 0) > start) {
                  const offset = start - idx;
                  range.setStart(node, offset);
                  range.setEnd(node, offset + placeholder.length);
                  sel.removeAllRanges();
                  sel.addRange(range);
                  break;
                }
                idx += node.textContent?.length || 0;
              }
            }
          } else {
            const ta = input as HTMLTextAreaElement;
            const start = prompt.indexOf(placeholder);
            if (start >= 0) ta.setSelectionRange(start, start + placeholder.length);
          }
        }, 100);
      }
    }

    // ── Notifications ──
    function showNotification(message: string, type: string = 'info') {
      if (!shadow) return;
      const existing = shadow.querySelector('.cp-notification');
      if (existing) existing.remove();

      const el = document.createElement('div');
      el.className = `cp-notification cp-notification-${type}`;
      el.textContent = message;
      shadow.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
    }

    // ── Injection Logic ──
    function inject() {
      if (shadow?.getElementById('cp-inject-btn')) return;

      const input = document.querySelector(config.inputSelector);
      if (!input) return;

      const containerSelectors = config.containerSelector.split(',').map(s => s.trim());
      let container: Element | null = null;
      for (const sel of containerSelectors) {
        container = input.closest(sel);
        if (container) break;
      }
      if (!container) container = input.parentElement;
      if (!container) return;

      const root = createShadowHost();
      createButton(root);

      container.insertBefore(shadowHost!, container.firstChild);
    }

    async function checkAndInject() {
      try {
        const settings = await sendMsg({ action: 'getSettings' });
        if (settings && settings.enableInjection === false) return;
      } catch { /* default: inject */ }
      inject();
    }

    // ── Keyboard shortcut listener ──
    chrome.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: (r?: any) => void) => {
      if (msg.action === 'triggerCraftPrompt') {
        handleClick(new Event('click'));
        sendResponse({ success: true });
      }
      return false;
    });

    // ── MutationObserver for SPA navigation ──
    const observer = new MutationObserver(() => {
      if (!shadow?.getElementById('cp-inject-btn')) {
        checkAndInject();
      }
    });

    // ── Init ──
    checkAndInject();
    observer.observe(document.body, { childList: true, subtree: true });
    // Retry after delays for slow-loading SPAs
    setTimeout(checkAndInject, 1500);
    setTimeout(checkAndInject, 4000);

    // ── CSS ──
    const INJECTOR_CSS = `
      /* Button */
      .cp-inject-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        background: linear-gradient(135deg, #0f766e 0%, #0e7490 40%, #0d9488 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: -0.01em;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 2px 8px rgba(13,148,136,0.25);
        position: relative;
        overflow: hidden;
        margin: 8px 0;
      }
      .cp-inject-btn::before {
        content: '';
        position: absolute;
        top: 0; left: -100%; width: 100%; height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
        transition: left 0.5s ease;
      }
      .cp-inject-btn:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,0.08), 0 4px 16px rgba(13,148,136,0.35); }
      .cp-inject-btn:hover::before { left: 100%; }
      .cp-inject-btn:active { transform: translateY(0) scale(0.98); }
      .cp-icon { font-size: 14px; display: flex; align-items: center; transition: transform 0.2s; }
      .cp-inject-btn:hover .cp-icon { transform: scale(1.1) rotate(10deg); }
      .cp-text { white-space: nowrap; }
      .cp-loading { pointer-events: none; opacity: 0.7; }
      .cp-loading .cp-icon { animation: cp-spin 1s linear infinite; }
      @keyframes cp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      /* Notification */
      .cp-notification {
        position: fixed; top: 20px; right: 20px;
        padding: 12px 20px; border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px; font-weight: 500; color: white;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 10px 20px -3px rgba(0,0,0,0.15);
        z-index: 999999; opacity: 0; transform: translateX(100%);
        transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        max-width: 340px; line-height: 1.5;
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      }
      .cp-notification.show { opacity: 1; transform: translateX(0); }
      .cp-notification-success { background: linear-gradient(135deg, #059669, #10b981); }
      .cp-notification-error { background: linear-gradient(135deg, #dc2626, #ef4444); }
      .cp-notification-warning { background: linear-gradient(135deg, #d97706, #f59e0b); }
      .cp-notification-info { background: linear-gradient(135deg, #0f766e, #0d9488); }

      /* Preview Panel */
      .cp-preview {
        position: fixed; bottom: 80px; right: 20px;
        width: 380px; max-height: 480px;
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid rgba(0,0,0,0.06);
        border-radius: 16px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.04), 0 16px 32px rgba(0,0,0,0.08);
        z-index: 999998;
        display: flex; flex-direction: column; overflow: hidden;
        opacity: 0; transform: translateY(12px) scale(0.97);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #0f172a;
      }
      .cp-preview.show { opacity: 1; transform: translateY(0) scale(1); }
      .cp-preview-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.06);
      }
      .cp-preview-title { font-size: 14px; font-weight: 600; letter-spacing: -0.02em; }
      .cp-preview-close {
        background: none; border: none; cursor: pointer; color: #94a3b8;
        padding: 4px; border-radius: 6px; transition: all 0.15s; font-size: 18px; line-height: 1;
      }
      .cp-preview-close:hover { background: rgba(239,68,68,0.08); color: #ef4444; }
      .cp-preview-toolbar { padding: 8px 16px; border-bottom: 1px solid rgba(0,0,0,0.04); }
      .cp-template-switcher {
        width: 100%; padding: 6px 10px;
        background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.08);
        border-radius: 8px; font-size: 12px; font-family: inherit; color: inherit; cursor: pointer;
      }
      .cp-template-switcher:focus { outline: none; border-color: #0d9488; }
      .cp-preview-editor {
        flex: 1; margin: 12px 16px; padding: 10px;
        background: rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.06);
        border-radius: 8px; font-size: 13px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        line-height: 1.5; color: inherit; resize: vertical;
        min-height: 120px; max-height: 280px;
      }
      .cp-preview-editor:focus { outline: none; border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13,148,136,0.1); }
      .cp-preview-footer {
        display: flex; justify-content: flex-end; gap: 8px;
        padding: 12px 16px; border-top: 1px solid rgba(0,0,0,0.04);
      }
      .cp-btn-cancel {
        padding: 7px 16px; background: rgba(0,0,0,0.04);
        border: 1px solid rgba(0,0,0,0.08); border-radius: 8px;
        font-size: 13px; font-family: inherit; cursor: pointer; color: inherit;
      }
      .cp-btn-cancel:hover { background: rgba(0,0,0,0.08); }
      .cp-btn-insert {
        padding: 7px 20px;
        background: linear-gradient(135deg, #0f766e, #0e7490);
        color: white; border: none; border-radius: 8px;
        font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer;
        box-shadow: 0 1px 3px rgba(13,148,136,0.2);
      }
      .cp-btn-insert:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(13,148,136,0.3); }
      .cp-btn-insert:active { transform: translateY(0) scale(0.98); }

      /* Dark mode */
      @media (prefers-color-scheme: dark) {
        .cp-inject-btn { box-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 2px 12px rgba(13,148,136,0.35); }
        .cp-preview {
          background: rgba(15,23,42,0.92); border-color: rgba(94,234,212,0.08); color: #f1f5f9;
          box-shadow: 0 1px 2px rgba(0,0,0,0.15), 0 4px 8px rgba(0,0,0,0.15), 0 16px 32px rgba(0,0,0,0.25);
        }
        .cp-preview-header { border-bottom-color: rgba(255,255,255,0.06); }
        .cp-preview-toolbar { border-bottom-color: rgba(255,255,255,0.04); }
        .cp-template-switcher { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); }
        .cp-preview-editor { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.06); }
        .cp-preview-footer { border-top-color: rgba(255,255,255,0.04); }
        .cp-btn-cancel { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.08); }
        .cp-btn-cancel:hover { background: rgba(255,255,255,0.1); }
      }

      /* Responsive */
      @media (max-width: 768px) {
        .cp-inject-btn { padding: 6px 10px; font-size: 12px; }
        .cp-text { display: none; }
        .cp-icon { font-size: 16px; }
        .cp-preview { width: calc(100vw - 32px); right: 16px; bottom: 60px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .cp-inject-btn, .cp-inject-btn::before, .cp-icon, .cp-notification, .cp-preview {
          transition: none; animation: none;
        }
      }
    `;
  },
});
