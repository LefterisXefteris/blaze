import OpenAI from "openai";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/vector/types";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export function embeddingsAvailable(): boolean {
  return openai !== null;
}

export async function embedText(text: string): Promise<number[] | null> {
  if (!openai || !text.trim()) return null;

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data[0]?.embedding ?? null;
  } catch (error) {
    console.error("Embedding failed:", error);
    return null;
  }
}

export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  if (!openai || texts.length === 0) {
    return texts.map(() => null);
  }

  const inputs = texts.map((t) => t.slice(0, 8000)).filter(Boolean);
  if (inputs.length === 0) return texts.map(() => null);

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: inputs,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const byIndex = new Map(response.data.map((d) => [d.index, d.embedding]));
    let inputIdx = 0;
    return texts.map((t) => {
      if (!t.trim()) return null;
      const embedding = byIndex.get(inputIdx) ?? null;
      inputIdx += 1;
      return embedding;
    });
  } catch (error) {
    console.error("Batch embedding failed:", error);
    return texts.map(() => null);
  }
}

export function vectorToSql(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
