import Groq from "groq-sdk";

import type { RagChunk } from "@/lib/rag/types";

type GenerateReplyInput = {
  userMessage: string;
  chunks: RagChunk[];
};

const DEFAULT_GROQ_MODEL = "llama-3.1-70b-versatile";

let groqClient: Groq | undefined;

export async function generateReply({
  userMessage,
  chunks,
}: GenerateReplyInput): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const context = chunks
    .map((chunk, index) => {
      const source = chunk.page
        ? `${chunk.source}, page ${chunk.page}`
        : chunk.source;

      return `[${index + 1}] ${source}\n${chunk.text}`;
    })
    .join("\n\n");

  const completion = await getGroqClient(apiKey).chat.completions.create({
    model: process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
    temperature: 0.2,
    max_completion_tokens: 350,
    messages: [
      {
        role: "system",
        content:
          "Ты отвечаешь клиенту в Instagram Direct. Отвечай кратко, понятно, на русском. Используй только контекст из PDF. Если в контексте нет ответа, скажи, что нужно уточнить у менеджера. Не выдумывай.",
      },
      {
        role: "user",
        content: `Контекст из PDF:\n${context || "Контекст не найден."}\n\nВопрос клиента:\n${userMessage}`,
      },
    ],
  });

  return (
    completion.choices[0]?.message?.content?.trim() ||
    "Нужно уточнить у менеджера."
  );
}

function getGroqClient(apiKey: string): Groq {
  groqClient ??= new Groq({ apiKey });
  return groqClient;
}
