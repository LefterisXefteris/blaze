-- pgvector setup (run after Prisma db push creates ContextChunk table)
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "ContextChunk" ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS "ContextChunk_embedding_idx"
  ON "ContextChunk" USING hnsw (embedding vector_cosine_ops);
