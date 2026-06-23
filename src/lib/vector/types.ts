export type ContextHit = {
  id: string;
  sourceType: "GITHUB" | "MEETING" | "NOTE" | "PRIORITY";
  sourceId: string;
  sourceRef: string | null;
  purpose: string | null;
  content: string;
  similarity: number;
  linkReason: "semantic" | "entity_match" | "explicit";
  metadata?: Record<string, unknown>;
};

export type IndexChunkInput = {
  userId: string;
  sourceType: ContextHit["sourceType"];
  sourceId: string;
  sourceRef?: string | null;
  chunkIndex: number;
  content: string;
  purpose?: string | null;
  metadata?: Record<string, unknown>;
};

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export const SIMILARITY_THRESHOLD = 0.72;
