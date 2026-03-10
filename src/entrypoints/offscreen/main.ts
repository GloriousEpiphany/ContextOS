/**
 * ContextPrompt AI v4.0 — Offscreen Document
 * Hosts the Transformers.js embedding pipeline in a persistent document context,
 * independent of the Service Worker lifecycle.
 */

let pipeline: any = null;
let pipelinePromise: Promise<any> | null = null;
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

async function getEmbeddingPipeline(): Promise<any> {
  if (pipeline) return pipeline;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    try {
      const { pipeline: createPipeline } = await import(
        /* webpackIgnore: true */
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js'
      );
      pipeline = await createPipeline('feature-extraction', MODEL_NAME, {
        device: 'auto',
        dtype: 'fp32',
      });
      console.log('[Offscreen] Embedding pipeline loaded');
      return pipeline;
    } catch (e) {
      console.error('[Offscreen] Failed to load pipeline:', e);
      pipelinePromise = null;
      throw e;
    }
  })();

  return pipelinePromise;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const truncated = text.length > 2000 ? text.substring(0, 2000) : text;

  const output = await pipe(truncated, {
    pooling: 'mean',
    normalize: true,
  });

  const data = output.data ?? output[0]?.data;
  const arr = data instanceof Float32Array
    ? Array.from(data.slice(0, EMBEDDING_DIM))
    : Array.from(data).slice(0, EMBEDDING_DIM);

  return arr as number[];
}

chrome.runtime.onMessage.addListener(
  (message: { action: string; data?: any }, _sender, sendResponse) => {
    if (message.action === 'computeEmbedding') {
      const text = message.data?.text || '';
      generateEmbedding(text)
        .then((vector) => sendResponse({ success: true, vector }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      return true;
    }

    if (message.action === 'warmupEmbedding') {
      getEmbeddingPipeline()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      return true;
    }
  },
);

// Pre-warm the pipeline on load
getEmbeddingPipeline().catch(() => {});
