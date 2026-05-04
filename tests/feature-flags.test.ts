import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock chrome.storage.local + chrome.storage.onChanged
const storage: Record<string, unknown> = {};
const listeners: Array<(changes: Record<string, chrome.storage.StorageChange>, area: chrome.storage.AreaName) => void> = [];

(globalThis as unknown as { chrome: typeof chrome }).chrome = {
  storage: {
    local: {
      get: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (k in storage) out[k] = storage[k];
        }
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: storage[k], newValue: v };
          storage[k] = v;
        }
        listeners.forEach((l) => l(changes, 'local'));
      }),
    },
    onChanged: {
      addListener: vi.fn((cb: typeof listeners[number]) => listeners.push(cb)),
      removeListener: vi.fn((cb: typeof listeners[number]) => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      }),
    },
  },
} as unknown as typeof chrome;

import { isEnabled, setFlag, getAll, onChange, __TEST_ONLY__ } from '../src/lib/feature-flags';

describe('feature-flags', () => {
  beforeEach(() => {
    for (const k of Object.keys(storage)) delete storage[k];
    listeners.length = 0;
  });

  it('returns DEFAULTS when storage is empty', async () => {
    expect(await isEnabled('mcp_oneclick_install')).toBe(true);
    // Exp #5 must be OFF by default (privacy)
    expect(await isEnabled('ai_conversation_observer')).toBe(false);
  });

  it('persists toggles', async () => {
    await setFlag('paper_badge_hover', false);
    expect(await isEnabled('paper_badge_hover')).toBe(false);
  });

  it('getAll returns every defined flag', async () => {
    const all = await getAll();
    const expected = Object.keys(__TEST_ONLY__.DEFAULTS).sort();
    expect(Object.keys(all).sort()).toEqual(expected);
  });

  it('onChange fires only when a flag value actually changes', async () => {
    const seen: Array<Partial<Record<string, boolean>>> = [];
    const unsub = onChange((diff) => seen.push(diff));

    await setFlag('paper_badge_hover', false);
    await setFlag('paper_badge_hover', false); // same value — should not fire diff

    unsub();
    expect(seen.length).toBe(1);
    expect(seen[0]).toEqual({ paper_badge_hover: false });
  });

  it('AI observer flag round-trips through opt-in flow', async () => {
    expect(await isEnabled('ai_conversation_observer')).toBe(false);
    await setFlag('ai_conversation_observer', true);
    expect(await isEnabled('ai_conversation_observer')).toBe(true);
    await setFlag('ai_conversation_observer', false);
    expect(await isEnabled('ai_conversation_observer')).toBe(false);
  });
});
