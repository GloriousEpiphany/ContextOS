/**
 * ContextPrompt AI v4.0 — Embeddings Service
 * Generates vector embeddings using Transformers.js (ONNX Runtime Web).
 *
 * Model: all-MiniLM-L6-v2 (384 dimensions, ~23MB)
 * Runs entirely in-browser via WebAssembly/WebGPU.
 *
 * PERFORMANCE NOTES:
 * - Cold start (first load): ~2-5s (model download from CDN + initialization)
 * - Subsequent loads: ~500ms-1s (from Cache API)
 * - Per-document inference: <100ms for short texts (warm)
 * - Should run in Offscreen Document or Web Worker to avoid blocking UI
 */

// Transformers.js is loaded dynamically to avoid bundling the large library
// in the main extension. It's loaded on-demand when embeddings are needed.
let pipeline: any = null;
let pipelinePromise: Promise<any> | null = null;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

/**
 * Lazily load the Transformers.js pipeline.
 * Uses singleton pattern to avoid loading the model multiple times.
 */
async function getEmbeddingPipeline(): Promise<any> {
  if (pipeline) return pipeline;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    try {
      // Dynamic import — Transformers.js is installed as an optional dependency.
      // If not installed, embedding features gracefully degrade.
      const { pipeline: createPipeline } = await import(
        /* webpackIgnore: true */
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js'
      );
      pipeline = await createPipeline('feature-extraction', MODEL_NAME, {
        // Use WebGPU if available, fallback to WASM
        device: 'auto',
        dtype: 'fp32',
      });
      return pipeline;
    } catch (e) {
      console.error('[Embeddings] Failed to load Transformers.js pipeline:', e);
      pipelinePromise = null;
      throw e;
    }
  })();

  return pipelinePromise;
}

/**
 * Check if the embedding service is available.
 */
export async function isEmbeddingAvailable(): Promise<boolean> {
  try {
    await getEmbeddingPipeline();
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate an embedding vector for the given text.
 * Returns a Float32Array of dimension 384.
 *
 * @param text - The text to embed. Longer texts are truncated to ~512 tokens.
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const pipe = await getEmbeddingPipeline();

  // Truncate to ~512 tokens (~2000 chars) for MiniLM's context window
  const truncated = text.length > 2000 ? text.substring(0, 2000) : text;

  const output = await pipe(truncated, {
    pooling: 'mean',
    normalize: true,
  });

  // Extract Float32Array from the Tensor output
  const data = output.data ?? output[0]?.data;
  if (data instanceof Float32Array) {
    return data.slice(0, EMBEDDING_DIM);
  }

  // Fallback: convert to Float32Array
  return new Float32Array(Array.from(data).slice(0, EMBEDDING_DIM) as number[]);
}

/**
 * Generate embeddings for multiple texts in batch.
 * More efficient than calling generateEmbedding() individually.
 */
export async function generateEmbeddingBatch(texts: string[]): Promise<Float32Array[]> {
  const results: Float32Array[] = [];
  // Process sequentially to avoid memory pressure
  for (const text of texts) {
    results.push(await generateEmbedding(text));
  }
  return results;
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Get the embedding dimension for the current model.
 */
export function getEmbeddingDimension(): number {
  return EMBEDDING_DIM;
}

/**
 * Clean up the pipeline to free memory.
 */
export function destroyPipeline(): void {
  if (pipeline) {
    try {
      pipeline.dispose?.();
    } catch {
      // ignore
    }
    pipeline = null;
    pipelinePromise = null;
  }
}
