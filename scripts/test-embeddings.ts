import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const {
    embedText,
    getEmbeddingDimensions,
    getEmbeddingModel,
    getEmbeddingProvider,
  } = await import("../src/lib/rag/embeddings");

  console.log(`Embedding provider: ${getEmbeddingProvider()}`);
  console.log(`Embedding model: ${getEmbeddingModel()}`);
  console.log(`Embedding dimensions: ${getEmbeddingDimensions()}`);

  const embedding = await embedText(
    "Проверка подключения Voyage embeddings для RAG индекса.",
    "query",
  );

  console.log(`Returned dimensions: ${embedding.length}`);
  console.log("Embedding API is ready.");
}

main().catch((error) => {
  console.error("Failed to test embeddings API:", error);
  process.exit(1);
});
