// Type declarations for CDN-imported modules that lack local type definitions.

declare module 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js' {
  export function pipeline(
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ): Promise<(input: string, options?: Record<string, unknown>) => Promise<{ data: Float32Array }>>;
}
