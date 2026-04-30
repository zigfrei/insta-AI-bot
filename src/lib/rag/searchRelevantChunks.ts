import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  embedText,
  getEmbeddingDimensions,
  getEmbeddingModel,
  getEmbeddingProvider,
} from "./embeddings";
import type { RagChunk, RagIndex } from "./types";

const INDEX_PATH = path.join(process.cwd(), "data", "rag", "index.json");

let indexPromise: Promise<RagIndex> | undefined;

export async function searchRelevantChunks(
  query: string,
  limit = 5,
): Promise<RagChunk[]> {
  const index = await loadRagIndex();

  if (index.chunks.length === 0) {
    return [];
  }

  if (index.provider && index.provider !== getEmbeddingProvider()) {
    console.warn(
      `RAG index was built with provider "${index.provider}", current provider is "${getEmbeddingProvider()}". Rebuild with pnpm rag:build.`,
    );
  }

  if (index.model !== getEmbeddingModel()) {
    console.warn(
      `RAG index was built with "${index.model}", current model is "${getEmbeddingModel()}". Rebuild with pnpm rag:build.`,
    );
  }

  if (index.dimensions && index.dimensions !== getEmbeddingDimensions()) {
    console.warn(
      `RAG index was built with ${index.dimensions} dimensions, current dimensions is ${getEmbeddingDimensions()}. Rebuild with pnpm rag:build.`,
    );
  }

  const queryEmbedding = await embedText(query);

  return index.chunks
    .map((chunk) => ({
      chunk,
      score: dotProduct(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk);
}

async function loadRagIndex(): Promise<RagIndex> {
  indexPromise ??= readFile(INDEX_PATH, "utf8")
    .then((content) => JSON.parse(content))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        console.warn(
          `RAG index not found at ${INDEX_PATH}. Build it with pnpm rag:build.`,
        );

        return {
          provider: getEmbeddingProvider(),
          model: getEmbeddingModel(),
          dimensions: getEmbeddingDimensions(),
          createdAt: new Date(0).toISOString(),
          chunks: [],
        };
      }

      throw error;
    });

  return indexPromise;
}

function dotProduct(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let score = 0;

  for (let index = 0; index < length; index += 1) {
    score += a[index] * b[index];
  }

  return score;
}
