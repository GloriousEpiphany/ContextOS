/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPaperBadge, removePaperBadge, type BadgeData } from '../../src/lib/components/PaperBadge';

describe('PaperBadge', () => {
  beforeEach(() => {
    document.getElementById('contextos-paper-badge')?.remove();
  });

  it('creates a host element with correct id', () => {
    const host = createPaperBadge({ hIndex: 25 });
    expect(host.id).toBe('contextos-paper-badge');
    // happy-dom supports open shadow DOM
    expect(host.shadowRoot).not.toBeNull();
  });

  it('renders eyebrow text "ContextOS"', () => {
    const host = createPaperBadge({ hIndex: 25 });
    const shadow = host.shadowRoot!;
    const eyebrow = shadow.querySelector('.pb-eyebrow');
    expect(eyebrow?.textContent).toBe('ContextOS');
  });

  it('renders h-index when provided', () => {
    const host = createPaperBadge({ hIndex: 42 });
    const shadow = host.shadowRoot!;
    const num = shadow.querySelector('.pb-num');
    expect(num?.textContent).toBe('42');
    const label = shadow.querySelector('.pb-label');
    expect(label?.textContent).toBe('h-index');
  });

  it('does not render h-index row when hIndex is undefined', () => {
    const host = createPaperBadge({ citedBy: 100 });
    const shadow = host.shadowRoot!;
    const num = shadow.querySelector('.pb-num');
    expect(num).toBeNull();
  });

  it('renders citedBy stat when provided', () => {
    const host = createPaperBadge({ citedBy: 1234 });
    const shadow = host.shadowRoot!;
    const statNum = shadow.querySelector('.pb-stat-num');
    expect(statNum?.textContent).toBe('1,234');
    const statLabel = shadow.querySelector('.pb-stat-label');
    expect(statLabel?.textContent).toBe('cited');
  });

  it('renders repoCount stat when provided', () => {
    const host = createPaperBadge({ repoCount: 5 });
    const shadow = host.shadowRoot!;
    const statNum = shadow.querySelector('.pb-stat-num');
    expect(statNum?.textContent).toBe('5');
    const statLabel = shadow.querySelector('.pb-stat-label');
    expect(statLabel?.textContent).toBe('repos');
  });

  it('renders all data together', () => {
    const host = createPaperBadge({
      hIndex: 30,
      citedBy: 500,
      repoCount: 3,
      arxivId: '2403.05525',
    });
    const shadow = host.shadowRoot!;
    expect(shadow.querySelector('.pb-num')?.textContent).toBe('30');
    expect(shadow.querySelectorAll('.pb-stat-num').length).toBe(2);
    expect(shadow.querySelector('.pb-context-btn')).not.toBeNull();
  });

  it('renders "Inject to ChatGPT" button when arxivId is provided', () => {
    const host = createPaperBadge({ arxivId: '2403.05525' });
    const shadow = host.shadowRoot!;
    const btn = shadow.querySelector('.pb-context-btn');
    expect(btn?.textContent).toBe('Inject to ChatGPT');
  });

  it('does not render button when arxivId is missing', () => {
    const host = createPaperBadge({ hIndex: 10 });
    const shadow = host.shadowRoot!;
    const btn = shadow.querySelector('.pb-context-btn');
    expect(btn).toBeNull();
  });

  it('button sends chrome.runtime.sendMessage on click', () => {
    const messages: any[] = [];
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn((msg: any) => messages.push(msg)),
      },
    };

    const host = createPaperBadge({ arxivId: '2403.05525' });
    const shadow = host.shadowRoot!;
    const btn = shadow.querySelector('.pb-context-btn') as HTMLButtonElement;
    btn.click();

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      action: 'injectPaperContext',
      data: { arxivId: '2403.05525' },
    });
  });

  it('removePaperBadge removes show class from existing badge', () => {
    const host = createPaperBadge({ hIndex: 10 });
    document.body.appendChild(host);

    removePaperBadge();

    const shadow = host.shadowRoot;
    const badge = shadow?.querySelector('.pb-badge');
    expect(badge?.classList.contains('show')).toBe(false);
  });

  it('removePaperBadge is a no-op when no badge exists', () => {
    expect(() => removePaperBadge()).not.toThrow();
  });

  it('renders score when provided', () => {
    const host = createPaperBadge({ score: 6.5, confidence: 4.5 });
    const shadow = host.shadowRoot!;
    const statNum = shadow.querySelector('.pb-stat-num');
    expect(statNum?.textContent).toContain('6.5');
    expect(statNum?.textContent).toContain('±4.5');
  });

  it('renders score without confidence when confidence is undefined', () => {
    const host = createPaperBadge({ score: 7.0 });
    const shadow = host.shadowRoot!;
    const statNum = shadow.querySelector('.pb-stat-num');
    expect(statNum?.textContent).toBe('7.0');
  });

  it('renders PDF button when pdfUrl is provided', () => {
    const host = createPaperBadge({ pdfUrl: 'https://example.com/paper.pdf' });
    const shadow = host.shadowRoot!;
    const pdfBtn = shadow.querySelector('.pb-pdf-btn') as HTMLAnchorElement;
    expect(pdfBtn).not.toBeNull();
    expect(pdfBtn.textContent).toBe('PDF');
    expect(pdfBtn.href).toBe('https://example.com/paper.pdf');
    expect(pdfBtn.target).toBe('_blank');
  });

  it('does not render PDF button when pdfUrl is missing', () => {
    const host = createPaperBadge({ hIndex: 10 });
    const shadow = host.shadowRoot!;
    const pdfBtn = shadow.querySelector('.pb-pdf-btn');
    expect(pdfBtn).toBeNull();
  });

});
