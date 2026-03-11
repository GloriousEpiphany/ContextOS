let _messages: Record<string, { message: string }> = {};
let _locale = '';

export async function loadLocale(lang?: string): Promise<void> {
  const resolved = (!lang || lang === 'auto')
    ? (navigator.language.startsWith('zh') ? 'zh' : 'en')
    : lang;
  if (resolved === _locale && Object.keys(_messages).length > 0) return;
  _locale = resolved;
  try {
    const url = chrome.runtime.getURL(`_locales/${resolved}/messages.json`);
    const resp = await fetch(url);
    _messages = await resp.json();
  } catch {
    _messages = {};
  }
}

export function t(key: string, fallback: string): string {
  const entry = _messages[key];
  if (entry?.message) return entry.message;
  try {
    const m = chrome.i18n.getMessage(key);
    if (m) return m;
  } catch {}
  return fallback;
}

export function getLocale(): string {
  return _locale;
}
