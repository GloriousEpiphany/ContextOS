/**
 * PaperBadge — floating badge injected into arXiv / OpenReview / CVPR pages.
 *
 * Shows: h-index of first author, citation count, linked GitHub repos count.
 * Design: mono eyebrow, dense 12px, accent #C2410C highlight, shadow DOM isolated.
 *
 * Per DESIGN.md: "Floating panel, Dense 12, mono eyebrow"
 */

const BADGE_CSS = `
  :host {
    all: initial;
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    pointer-events: auto;
  }

  .pb-badge {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: #1A1A1C;
    border: 1px solid #2A2A2D;
    border-radius: 6px;
    color: #E8E6E1;
    min-width: 160px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1), transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
    font-feature-settings: "tnum";
  }
  .pb-badge.show {
    opacity: 1;
    transform: translateY(0);
  }

  .pb-eyebrow {
    font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
    font-size: 10px;
    color: #8A8780;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .pb-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .pb-num {
    font-size: 22px;
    font-weight: 600;
    color: #C2410C;
    line-height: 1;
    font-feature-settings: "tnum";
  }

  .pb-label {
    font-size: 11px;
    color: #8A8780;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .pb-divider {
    height: 1px;
    background: #2A2A2D;
  }

  .pb-stat-row {
    display: flex;
    gap: 12px;
  }

  .pb-stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .pb-stat-num {
    font-size: 14px;
    font-weight: 600;
    color: #E8E6E1;
    font-feature-settings: "tnum";
  }

  .pb-stat-label {
    font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
    font-size: 9px;
    color: #8A8780;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .pb-empty {
    font-size: 11px;
    color: #8A8780;
    font-style: italic;
  }

  .pb-context-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    padding: 5px 10px;
    background: #C2410C;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 80ms;
  }
  .pb-context-btn:hover {
    background: #A8370A;
  }
  .pb-context-btn:active {
    transform: scale(0.98);
  }

  .pb-pdf-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
    padding: 5px 10px;
    background: transparent;
    color: #E8E6E1;
    border: 1px solid #2A2A2D;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 80ms, border-color 80ms;
    text-decoration: none;
  }
  .pb-pdf-btn:hover {
    background: #2A2A2D;
    border-color: #3A3A3D;
  }

  .pb-score-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .pb-score {
    font-size: 18px;
    font-weight: 600;
    color: #C2410C;
    line-height: 1;
    font-feature-settings: "tnum";
  }

  .pb-confidence {
    font-size: 10px;
    color: #8A8780;
  }

  @media (prefers-color-scheme: light) {
    .pb-badge {
      background: #FAFAF7;
      border-color: #DEDDD7;
      color: #16161A;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
    .pb-eyebrow, .pb-label, .pb-stat-label {
      color: #6A685F;
    }
    .pb-num { color: #C2410C; }
    .pb-stat-num { color: #16161A; }
    .pb-divider { background: #DEDDD7; }
    .pb-empty { color: #6A685F; }
    .pb-pdf-btn {
      color: #16161A;
      border-color: #DEDDD7;
    }
    .pb-pdf-btn:hover {
      background: #EDEDEA;
      border-color: #C8C7C0;
    }
    .pb-score { color: #C2410C; }
    .pb-confidence { color: #6A685F; }
  }

  @media (prefers-reduced-motion: reduce) {
    .pb-badge { transition: none; }
  }
`;

export interface BadgeData {
  hIndex?: number;
  citedBy?: number;
  repoCount?: number;
  arxivId?: string;
  pdfUrl?: string;
  score?: number;
  confidence?: number;
}

export function createPaperBadge(data: BadgeData): HTMLElement {
  const host = document.createElement('div');
  host.id = 'contextos-paper-badge';
  host.style.cssText = 'all:initial;';

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = BADGE_CSS;
  shadow.appendChild(style);

  const badge = document.createElement('div');
  badge.className = 'pb-badge';

  // Eyebrow
  const eyebrow = document.createElement('div');
  eyebrow.className = 'pb-eyebrow';
  eyebrow.textContent = 'ContextOS';
  badge.appendChild(eyebrow);

  // h-index row
  if (data.hIndex !== undefined) {
    const row = document.createElement('div');
    row.className = 'pb-row';

    const num = document.createElement('span');
    num.className = 'pb-num';
    num.textContent = String(data.hIndex);

    const label = document.createElement('span');
    label.className = 'pb-label';
    label.textContent = 'h-index';

    row.appendChild(num);
    row.appendChild(label);
    badge.appendChild(row);
  }

  // Divider + stats
  if (data.citedBy !== undefined || data.repoCount !== undefined || data.score !== undefined) {
    const divider = document.createElement('div');
    divider.className = 'pb-divider';
    badge.appendChild(divider);

    const statRow = document.createElement('div');
    statRow.className = 'pb-stat-row';

    if (data.citedBy !== undefined) {
      const stat = document.createElement('div');
      stat.className = 'pb-stat';
      stat.innerHTML = `<span class="pb-stat-num">${data.citedBy.toLocaleString()}</span><span class="pb-stat-label">cited</span>`;
      statRow.appendChild(stat);
    }

    if (data.repoCount !== undefined) {
      const stat = document.createElement('div');
      stat.className = 'pb-stat';
      stat.innerHTML = `<span class="pb-stat-num">${data.repoCount}</span><span class="pb-stat-label">repos</span>`;
      statRow.appendChild(stat);
    }

    if (data.score !== undefined) {
      const stat = document.createElement('div');
      stat.className = 'pb-stat';
      const conf = data.confidence !== undefined ? ` <span class="pb-confidence">±${data.confidence.toFixed(1)}</span>` : '';
      stat.innerHTML = `<span class="pb-stat-num">${data.score.toFixed(1)}${conf}</span><span class="pb-stat-label">score</span>`;
      statRow.appendChild(stat);
    }

    badge.appendChild(statRow);
  }

  // Context button
  if (data.arxivId) {
    const btn = document.createElement('button');
    btn.className = 'pb-context-btn';
    btn.textContent = 'Inject to ChatGPT';
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'injectPaperContext',
        data: { arxivId: data.arxivId },
      });
    });
    badge.appendChild(btn);
  }

  // PDF button (only if PDF URL is available and verified)
  if (data.pdfUrl) {
    const pdfBtn = document.createElement('a');
    pdfBtn.className = 'pb-pdf-btn';
    pdfBtn.textContent = 'PDF';
    pdfBtn.href = data.pdfUrl;
    pdfBtn.target = '_blank';
    pdfBtn.rel = 'noopener';
    badge.appendChild(pdfBtn);
  }

  shadow.appendChild(badge);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => badge.classList.add('show'));
  });

  return host;
}

export function removePaperBadge(): void {
  const existing = document.getElementById('contextos-paper-badge');
  if (existing) {
    const shadow = existing.shadowRoot;
    const badge = shadow?.querySelector('.pb-badge');
    if (badge) {
      badge.classList.remove('show');
      setTimeout(() => existing.remove(), 200);
    } else {
      existing.remove();
    }
  }
}
