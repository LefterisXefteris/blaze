import { db } from "@/lib/db";
import { embedText } from "@/lib/vector/embed";
import { SIMILARITY_THRESHOLD, type ContextHit } from "@/lib/vector/types";
import { detectEntityMatches } from "@/lib/vector/entities";

type RawSearchRow = {
  id: string;
  sourceType: ContextHit["sourceType"];
  sourceId: string;
  sourceRef: string | null;
  purpose: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

export async function semanticSearch(params: {
  userId: string;
  query: string;
  topK?: number;
  sourceTypes?: ContextHit["sourceType"][];
  minSimilarity?: number;
}): Promise<ContextHit[]> {
  const embedding = await embedText(params.query);
  if (!embedding) return [];

  const topK = params.topK ?? 5;
  const minSimilarity = params.minSimilarity ?? SIMILARITY_THRESHOLD;
  const vectorLiteral = `[${embedding.join(",")}]`;

  const sourceFilter =
    params.sourceTypes && params.sourceTypes.length > 0
      ? params.sourceTypes
      : null;

  const rows = sourceFilter
    ? await db.$queryRawUnsafe<RawSearchRow[]>(
        `
        SELECT
          id,
          "sourceType",
          "sourceId",
          "sourceRef",
          purpose,
          content,
          metadata,
          1 - (embedding <=> $1::vector) AS similarity
        FROM "ContextChunk"
        WHERE "userId" = $2::uuid
          AND embedding IS NOT NULL
          AND "sourceType"::text = ANY($4::text[])
        ORDER BY embedding <=> $1::vector
        LIMIT $3
        `,
        vectorLiteral,
        params.userId,
        topK,
        sourceFilter
      )
    : await db.$queryRawUnsafe<RawSearchRow[]>(
        `
        SELECT
          id,
          "sourceType",
          "sourceId",
          "sourceRef",
          purpose,
          content,
          metadata,
          1 - (embedding <=> $1::vector) AS similarity
        FROM "ContextChunk"
        WHERE "userId" = $2::uuid
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $3
        `,
        vectorLiteral,
        params.userId,
        topK
      );

  return rows
    .filter((row) => Number(row.similarity) >= minSimilarity)
    .map((row) => ({
      id: row.id,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceRef: row.sourceRef,
      purpose: row.purpose,
      content: row.content,
      similarity: Number(row.similarity),
      linkReason: "semantic" as const,
      metadata: row.metadata ?? undefined,
    }));
}

export async function searchContext(params: {
  userId: string;
  query: string;
  topK?: number;
}): Promise<ContextHit[]> {
  const [semantic, entity] = await Promise.all([
    semanticSearch({
      userId: params.userId,
      query: params.query,
      topK: params.topK ?? 5,
    }),
    detectEntityMatches(params.userId, params.query),
  ]);

  const seen = new Set<string>();
  const merged: ContextHit[] = [];

  for (const hit of [...entity, ...semantic]) {
    const key = `${hit.sourceType}:${hit.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
  }

  return merged
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, params.topK ?? 5);
}

export function formatContextForPrompt(hits: ContextHit[]): string {
  if (hits.length === 0) return "";

  return hits
    .map((hit) => {
      const label =
        hit.sourceType === "GITHUB" || hit.sourceType === "PRIORITY"
          ? "GitHub"
          : hit.sourceType === "MEETING"
            ? "Meeting"
            : "Note";
      const ref = hit.sourceRef ? ` (${hit.sourceRef})` : "";
      const reason =
        hit.linkReason === "entity_match"
          ? "matched by PR/issue reference"
          : `${Math.round(hit.similarity * 100)}% match`;
      const summary = hit.purpose ?? hit.content.slice(0, 280);
      return `- [${label}${ref}] ${summary} — ${reason}`;
    })
    .join("\n");
}
