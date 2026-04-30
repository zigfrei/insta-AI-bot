import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { PDFParse } from "pdf-parse";

import {
  embedTexts,
  getEmbeddingDimensions,
  getEmbeddingProvider,
  getEmbeddingModel,
} from "../src/lib/rag/embeddings";
import type { RagChunk, RagIndex } from "../src/lib/rag/types";

loadEnvConfig(process.cwd());

const SOURCE_DIR = path.join(process.cwd(), "data", "source");
const INDEX_PATH = path.join(process.cwd(), "data", "rag", "index.json");
const CHUNK_SIZE = 1_100;
const CHUNK_OVERLAP = 180;
const DEFAULT_EMBEDDING_BATCH_SIZE = 12;
const DEFAULT_EMBEDDING_REQUEST_DELAY_MS = 21_000;

async function main() {
  const pdfPaths = await getSourcePdfPaths();

  if (pdfPaths.length === 0) {
    throw new Error(`No PDF files found in ${SOURCE_DIR}`);
  }

  const documents = await Promise.all(
    pdfPaths.map(async (pdfPath) => {
      const text = await extractPdfText(pdfPath);
      return {
        pdfPath,
        source: toProjectRelativePath(pdfPath),
        chunks: chunkText(normalizeWhitespace(text), CHUNK_SIZE, CHUNK_OVERLAP),
      };
    }),
  );
  const totalChunks = documents.reduce(
    (total, document) => total + document.chunks.length,
    0,
  );
  const chunks: RagChunk[] = [];
  const provider = getEmbeddingProvider();
  const model = getEmbeddingModel();
  const dimensions = getEmbeddingDimensions();
  const embeddingBatchSize = getPositiveIntegerEnv(
    "VOYAGE_EMBEDDING_BATCH_SIZE",
    DEFAULT_EMBEDDING_BATCH_SIZE,
  );
  const embeddingRequestDelayMs = getPositiveIntegerEnv(
    "VOYAGE_EMBEDDING_REQUEST_DELAY_MS",
    DEFAULT_EMBEDDING_REQUEST_DELAY_MS,
  );

  console.log(`Building RAG index with provider: ${provider}`);
  console.log(`Embedding model: ${model}`);
  console.log(`Embedding dimensions: ${dimensions}`);
  console.log(`Embedding batch size: ${embeddingBatchSize}`);
  console.log(`Embedding request delay: ${embeddingRequestDelayMs}ms`);
  console.log(`Source directory: ${SOURCE_DIR}`);
  console.log(`PDF files: ${documents.length}`);
  console.log(`Chunks: ${totalChunks}`);

  let embeddedChunks = 0;

  for (const [documentIndex, document] of documents.entries()) {
    console.log(`Processing ${document.source}`);

    for (
      let batchStart = 0;
      batchStart < document.chunks.length;
      batchStart += embeddingBatchSize
    ) {
      const batch = document.chunks.slice(
        batchStart,
        batchStart + embeddingBatchSize,
      );
      const embeddings = await embedTextsWithRetry(batch, "document");

      for (const [batchIndex, chunk] of batch.entries()) {
        const chunkIndex = batchStart + batchIndex;
        embeddedChunks += 1;
        console.log(`Embedding chunk ${embeddedChunks}/${totalChunks}`);
        chunks.push({
          id: `pdf-${documentIndex + 1}-chunk-${chunkIndex + 1}`,
          source: document.source,
          text: chunk,
          embedding: embeddings[batchIndex],
        });
      }

      if (embeddedChunks < totalChunks) {
        await sleep(embeddingRequestDelayMs);
      }
    }
  }

  const ragIndex: RagIndex = {
    provider,
    model,
    dimensions,
    createdAt: new Date().toISOString(),
    chunks,
  };

  await mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, `${JSON.stringify(ragIndex, null, 2)}\n`);

  console.log(`Saved RAG index: ${INDEX_PATH}`);
}

async function embedTextsWithRetry(
  texts: string[],
  inputType: "document",
): Promise<number[][]> {
  try {
    return await embedTexts(texts, inputType);
  } catch (error) {
    const retryAfterMs = getRetryAfterMs(error);

    if (!retryAfterMs) {
      throw error;
    }

    console.warn(
      `Voyage rate limit reached. Retrying in ${Math.ceil(retryAfterMs / 1_000)}s.`,
    );
    await sleep(retryAfterMs);

    return embedTexts(texts, inputType);
  }
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const cause = error.cause;

  if (
    cause &&
    typeof cause === "object" &&
    "status" in cause &&
    cause.status === 429 &&
    "retryAfterMs" in cause &&
    typeof cause.retryAfterMs === "number"
  ) {
    return cause.retryAfterMs;
  }

  return undefined;
}

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  console.warn(`Invalid ${name} "${rawValue}", using "${fallback}".`);
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getSourcePdfPaths(): Promise<string[]> {
  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });

  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"),
    )
    .map((entry) => path.join(SOURCE_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const sourceBuffer = await readFile(pdfPath);
  const parser = new PDFParse({ data: sourceBuffer });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function toProjectRelativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    if (end < text.length) {
      const lastSentenceEnd = Math.max(
        text.lastIndexOf(". ", end),
        text.lastIndexOf("? ", end),
        text.lastIndexOf("! ", end),
      );

      if (lastSentenceEnd > start + size * 0.6) {
        end = lastSentenceEnd + 1;
      }
    }

    const chunk = text.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

main().catch((error) => {
  console.error("Failed to build RAG index:", error);
  process.exit(1);
});
