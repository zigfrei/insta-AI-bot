const DEFAULT_VOYAGE_EMBEDDING_MODEL = "voyage-4-lite";
const DEFAULT_VOYAGE_EMBEDDING_DIMENSION = 512;
const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";

type VoyageInputType = "query" | "document";

type VoyageEmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
  }>;
};

const DEFAULT_VOYAGE_RETRY_DELAY_MS = 60_000;

export function getEmbeddingProvider(): string {
  return "voyage";
}

export function getEmbeddingModel(): string {
  return process.env.VOYAGE_EMBEDDING_MODEL ?? DEFAULT_VOYAGE_EMBEDDING_MODEL;
}

export function getEmbeddingDimensions(): number {
  const rawDimension = process.env.VOYAGE_EMBEDDING_DIMENSION;

  if (!rawDimension) {
    return DEFAULT_VOYAGE_EMBEDDING_DIMENSION;
  }

  const dimension = Number(rawDimension);

  if ([256, 512, 1024, 2048].includes(dimension)) {
    return dimension;
  }

  console.warn(
    `Unsupported VOYAGE_EMBEDDING_DIMENSION "${rawDimension}", using "${DEFAULT_VOYAGE_EMBEDDING_DIMENSION}".`,
  );

  return DEFAULT_VOYAGE_EMBEDDING_DIMENSION;
}

export async function embedText(
  text: string,
  inputType: VoyageInputType = "query",
): Promise<number[]> {
  const [embedding] = await embedTexts([text], inputType);

  if (!embedding) {
    throw new Error("Voyage returned no embedding");
  }

  return embedding;
}

export async function embedTexts(
  texts: string[],
  inputType: VoyageInputType,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const apiKey = process.env.VOYAGE_API_KEY;

  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is not configured");
  }

  const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: texts,
      model: getEmbeddingModel(),
      input_type: inputType,
      output_dimension: getEmbeddingDimensions(),
      output_dtype: "float",
      truncation: true,
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    const retryAfter = response.headers.get("retry-after");
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1_000 : undefined;

    throw new Error(
      `Voyage embeddings failed: ${response.status} ${response.statusText} ${responseBody}`,
      {
        cause: {
          status: response.status,
          retryAfterMs:
            retryAfterMs && Number.isFinite(retryAfterMs)
              ? retryAfterMs
              : DEFAULT_VOYAGE_RETRY_DELAY_MS,
        },
      },
    );
  }

  const body = (await response.json()) as VoyageEmbeddingResponse;
  const embeddings = body.data?.map((item) => item.embedding);

  if (!embeddings || embeddings.some((embedding) => !embedding)) {
    throw new Error("Voyage embeddings response is missing embeddings");
  }

  return embeddings.map((embedding) => normalizeVector(embedding ?? []));
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  if (norm === 0) {
    return vector;
  }

  return vector.map((value) => value / norm);
}
