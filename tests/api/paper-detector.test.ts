/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  isArxivPage,
  parseArxivId,
  extractArxivMeta,
  isOpenReviewPage,
  parseOpenReviewId,
  extractOpenReviewMeta,
  isCvprPage,
  extractCvprMeta,
  detectPaper,
} from '../../src/lib/api/paper-detector';

function makeDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

// ── arXiv ──

describe('arXiv detector', () => {
  it('isArxivPage matches abs/pdf/html URLs', () => {
    expect(isArxivPage('https://arxiv.org/abs/2403.05525')).toBe(true);
    expect(isArxivPage('https://arxiv.org/pdf/2403.05525v2')).toBe(true);
    expect(isArxivPage('https://arxiv.org/html/2403.05525')).toBe(true);
    expect(isArxivPage('https://openreview.net/forum?id=abc')).toBe(false);
    expect(isArxivPage('https://example.com')).toBe(false);
  });

  it('parseArxivId extracts ID from various URL formats', () => {
    expect(parseArxivId('https://arxiv.org/abs/2403.05525')).toBe('2403.05525');
    expect(parseArxivId('https://arxiv.org/abs/2403.05525v2')).toBe('2403.05525');
    expect(parseArxivId('https://arxiv.org/pdf/2403.05525v1')).toBe('2403.05525');
    expect(parseArxivId('https://arxiv.org/html/2403.05525')).toBe('2403.05525');
    expect(parseArxivId('https://example.com/paper')).toBeNull();
  });

  it('extractArxivMeta parses title, authors, abstract from arXiv abs page', () => {
    const doc = makeDoc(`
      <html><body>
        <h1 class="title mathjax">Title: A Simple Framework for Contrastive Learning</h1>
        <div class="authors">
          <a>Ting Chen</a>, <a>Simon Kornblith</a>, <a>Mohammad Norouzi</a>
        </div>
        <blockquote class="abstract mathjax">Abstract: This paper presents SimCLR.</blockquote>
        <a class="download-pdf" href="https://arxiv.org/pdf/2002.05709">PDF</a>
      </body></html>
    `);

    const meta = extractArxivMeta(doc, 'https://arxiv.org/abs/2002.05709');
    expect(meta).not.toBeNull();
    expect(meta!.id).toBe('arxiv:2002.05709');
    expect(meta!.source).toBe('arxiv');
    expect(meta!.arxivId).toBe('2002.05709');
    expect(meta!.title).toBe('A Simple Framework for Contrastive Learning');
    expect(meta!.authors).toEqual(['Ting Chen', 'Simon Kornblith', 'Mohammad Norouzi']);
    expect(meta!.abstract).toBe('This paper presents SimCLR.');
    expect(meta!.pdfUrl).toBe('https://arxiv.org/pdf/2002.05709');
  });

  it('extractArxivMeta returns null when title is missing', () => {
    const doc = makeDoc(`<html><body><div class="authors"><a>A. Author</a></div></body></html>`);
    const meta = extractArxivMeta(doc, 'https://arxiv.org/abs/9999.99999');
    expect(meta).toBeNull();
  });

  it('extractArxivMeta handles missing abstract gracefully', () => {
    const doc = makeDoc(`
      <html><body>
        <h1 class="title mathjax">Title: A Paper Without Abstract</h1>
        <div class="authors"><a>Author</a></div>
      </body></html>
    `);
    const meta = extractArxivMeta(doc, 'https://arxiv.org/abs/2401.00001');
    expect(meta).not.toBeNull();
    expect(meta!.abstract).toBeUndefined();
  });

  it('extractArxivMeta constructs PDF URL when link is missing', () => {
    const doc = makeDoc(`
      <html><body>
        <h1 class="title mathjax">Title: No PDF Link</h1>
        <div class="authors"><a>A</a></div>
      </body></html>
    `);
    const meta = extractArxivMeta(doc, 'https://arxiv.org/abs/2401.12345');
    expect(meta!.pdfUrl).toBe('https://arxiv.org/pdf/2401.12345');
  });
});

// ── OpenReview ──

describe('OpenReview detector', () => {
  it('isOpenReviewPage matches forum URLs', () => {
    expect(isOpenReviewPage('https://openreview.net/forum?id=abc123')).toBe(true);
    expect(isOpenReviewPage('https://openreview.net/forum?id=SJxK5nAqtQ')).toBe(true);
    expect(isOpenReviewPage('https://arxiv.org/abs/2403.05525')).toBe(false);
  });

  it('parseOpenReviewId extracts forum ID', () => {
    expect(parseOpenReviewId('https://openreview.net/forum?id=SJxK5nAqtQ')).toBe('SJxK5nAqtQ');
    expect(parseOpenReviewId('https://openreview.net/forum?id=abc_def-123')).toBe('abc_def-123');
    expect(parseOpenReviewId('https://openreview.net/')).toBeNull();
  });

  it('extractOpenReviewMeta parses title, authors, abstract', () => {
    const doc = makeDoc(`
      <html><body>
        <h2 class="citation_title">Attention Is All You Need</h2>
        <div class="forum-authors">
          <a>Ashish Vaswani</a> <a>Noam Shazeer</a>
        </div>
        <span class="forum-abstract-text">The dominant sequence transduction models...</span>
      </body></html>
    `);

    const meta = extractOpenReviewMeta(doc, 'https://openreview.net/forum?id=xxx');
    expect(meta).not.toBeNull();
    expect(meta!.id).toBe('openreview:xxx');
    expect(meta!.title).toBe('Attention Is All You Need');
    expect(meta!.authors.length).toBe(2);
    expect(meta!.abstract).toBe('The dominant sequence transduction models...');
  });

  it('extractOpenReviewMeta detects NeurIPS venue', () => {
    const doc = makeDoc(`
      <html><body>
        <h2 class="citation_title">Test Paper</h2>
        <div class="forum-authors"><a>A</a></div>
        <div>NeurIPS 2025</div>
      </body></html>
    `);
    const meta = extractOpenReviewMeta(doc, 'https://openreview.net/forum?id=abc');
    expect(meta!.source).toBe('neurips');
  });

  it('extractOpenReviewMeta detects ICLR venue', () => {
    const doc = makeDoc(`
      <html><body>
        <h2 class="citation_title">Test</h2>
        <div class="forum-authors"><a>A</a></div>
        <div>International Conference on Learning Representations</div>
      </body></html>
    `);
    const meta = extractOpenReviewMeta(doc, 'https://openreview.net/forum?id=abc');
    expect(meta!.source).toBe('iclr');
  });

  it('extractOpenReviewMeta defaults to openreview when no venue detected', () => {
    const doc = makeDoc(`
      <html><body>
        <h2 class="citation_title">Test</h2>
        <div class="forum-authors"><a>A</a></div>
      </body></html>
    `);
    const meta = extractOpenReviewMeta(doc, 'https://openreview.net/forum?id=abc');
    expect(meta!.source).toBe('openreview');
  });

  it('extractOpenReviewMeta extracts review scores', () => {
    const doc = makeDoc(`
      <html><body>
        <h2 class="citation_title">Scored Paper</h2>
        <div class="forum-authors"><a>A</a></div>
        <div>
          <strong>Rating:</strong> <span>7</span>
          <strong>Confidence:</strong> <span>4</span>
        </div>
        <div>
          <strong>Rating:</strong> <span>6</span>
          <strong>Confidence:</strong> <span>5</span>
        </div>
      </body></html>
    `);
    const meta = extractOpenReviewMeta(doc, 'https://openreview.net/forum?id=scored');
    expect(meta!.score).toBe(6.5); // average of 7 and 6
    expect(meta!.confidence).toBe(4.5); // average of 4 and 5
  });

  it('extractOpenReviewMeta handles missing scores gracefully', () => {
    const doc = makeDoc(`
      <html><body>
        <h2 class="citation_title">No Scores</h2>
        <div class="forum-authors"><a>A</a></div>
      </body></html>
    `);
    const meta = extractOpenReviewMeta(doc, 'https://openreview.net/forum?id=noscore');
    expect(meta!.score).toBeUndefined();
    expect(meta!.confidence).toBeUndefined();
  });
});

// ── CVPR ──

describe('CVPR detector', () => {
  it('isCvprPage matches openaccess.thecvf.com URLs', () => {
    expect(isCvprPage('https://openaccess.thecvf.com/CVPR2024?day=all')).toBe(true);
    expect(isCvprPage('https://openaccess.thecvf.com/ICCV2023?day=all')).toBe(true);
    expect(isCvprPage('https://openaccess.thecvf.com/ECCV2022?day=all')).toBe(true);
    expect(isCvprPage('https://arxiv.org/abs/2403.05525')).toBe(false);
  });

  it('extractCvprMeta parses title, authors, abstract', () => {
    const doc = makeDoc(`
      <html><body>
        <div id="papertitle">Masked Autoencoders Are Scalable Vision Learners</div>
        <div id="authors">Kaiming He, Xinlei Chen, Saining Xie</div>
        <div id="abstract">This paper shows that masked autoencoders...</div>
        <a href="https://openaccess.thecvf.com/content/CVPR2022/papers/He_Masked_Autoencoders_Are_Scalable_Vision_Learners_CVPR_2022_paper.pdf">PDF</a>
      </body></html>
    `);

    const meta = extractCvprMeta(doc, 'https://openaccess.thecvf.com/content/CVPR2022/papers/He_Masked_Autoencoders_Are_Scalable_Vision_Learners_CVPR_2022_paper.html');
    expect(meta).not.toBeNull();
    expect(meta!.source).toBe('cvpr');
    expect(meta!.title).toBe('Masked Autoencoders Are Scalable Vision Learners');
    expect(meta!.authors.length).toBe(3);
    expect(meta!.abstract).toBe('This paper shows that masked autoencoders...');
  });
});

// ── Unified detectPaper ──

describe('detectPaper (unified)', () => {
  it('dispatches to arXiv detector', () => {
    const doc = makeDoc(`
      <html><body>
        <h1 class="title mathjax">Title: Test</h1>
        <div class="authors"><a>A</a></div>
      </body></html>
    `);
    const meta = detectPaper('https://arxiv.org/abs/2401.00001', doc);
    expect(meta).not.toBeNull();
    expect(meta!.source).toBe('arxiv');
  });

  it('dispatches to OpenReview detector', () => {
    const doc = makeDoc(`
      <html><body>
        <h2 class="citation_title">Test</h2>
        <div class="forum-authors"><a>A</a></div>
      </body></html>
    `);
    const meta = detectPaper('https://openreview.net/forum?id=abc', doc);
    expect(meta).not.toBeNull();
    expect(meta!.source).toBe('openreview');
  });

  it('returns null for unrecognized URLs', () => {
    const doc = makeDoc(`<html><body></body></html>`);
    expect(detectPaper('https://example.com', doc)).toBeNull();
    expect(detectPaper('https://google.com', doc)).toBeNull();
  });
});
