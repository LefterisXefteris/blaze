-- Enable pgvector (Supabase has this; local Docker uses pgvector/pgvector image)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "ContextSourceType" AS ENUM ('GITHUB', 'MEETING', 'NOTE', 'PRIORITY');
CREATE TYPE "ContextLinkReason" AS ENUM ('EXPLICIT', 'SEMANTIC', 'ENTITY_MATCH', 'CALENDAR');

-- CreateTable
CREATE TABLE "ContextChunk" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "sourceType" "ContextSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRef" TEXT,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "purpose" TEXT,
    "metadata" JSONB,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContextLink" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "linkReason" "ContextLinkReason" NOT NULL DEFAULT 'SEMANTIC',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContextChunk_userId_sourceType_sourceId_chunkIndex_key" ON "ContextChunk"("userId", "sourceType", "sourceId", "chunkIndex");
CREATE INDEX "ContextChunk_userId_sourceType_idx" ON "ContextChunk"("userId", "sourceType");
CREATE INDEX "ContextChunk_userId_sourceRef_idx" ON "ContextChunk"("userId", "sourceRef");
CREATE UNIQUE INDEX "ContextLink_userId_fromId_toId_key" ON "ContextLink"("userId", "fromId", "toId");
CREATE INDEX "ContextLink_userId_fromId_idx" ON "ContextLink"("userId", "fromId");

-- HNSW index for fast cosine similarity search
CREATE INDEX "ContextChunk_embedding_idx" ON "ContextChunk" USING hnsw ("embedding" vector_cosine_ops);
