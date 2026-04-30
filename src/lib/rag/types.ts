export type RagChunk = {
  id: string;
  source: string;
  page?: number;
  text: string;
  embedding: number[];
};

export type RagIndex = {
  provider?: string;
  model: string;
  dimensions?: number;
  createdAt: string;
  chunks: RagChunk[];
};
