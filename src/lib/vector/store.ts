import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { embedText, vectorToSql } from "@/lib/vector/embed";
import type { IndexChunkInput } from "@/lib/vector/types";

export async function upsertContextChunk(input: IndexChunkInput): Promise<string | null> {
  const embedding = await embedText(
    input.purpose ? `${input.purpose}\n\n${input.content}` : input.content
  );

  const existing = await db.contextChunk.findUnique({
    where: {
      userId_sourceType_sourceId_chunkIndex: {
        userId: input.userId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        chunkIndex: input.chunkIndex,
      },
    },
    select: { id: true },
  });

  const chunk = existing
    ? await db.contextChunk.update({
        where: { id: existing.id },
        data: {
          sourceRef: input.sourceRef ?? null,
          content: input.content,
          purpose: input.purpose ?? null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      })
    : await db.contextChunk.create({
        data: {
          userId: input.userId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceRef: input.sourceRef ?? null,
          chunkIndex: input.chunkIndex,
          content: input.content,
          purpose: input.purpose ?? null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

  if (embedding) {
    const vectorSql = vectorToSql(embedding);
    await db.$executeRawUnsafe(
      `UPDATE "ContextChunk" SET embedding = $1::vector WHERE id = $2`,
      vectorSql,
      chunk.id
    );
  }

  return chunk.id;
}

export async function deleteContextChunksForSource(
  userId: string,
  sourceType: IndexChunkInput["sourceType"],
  sourceId: string
) {
  await db.contextChunk.deleteMany({
    where: { userId, sourceType, sourceId },
  });
}

export async function indexChunks(inputs: IndexChunkInput[]) {
  if (inputs.length === 0) return;

  const { userId, sourceType, sourceId } = inputs[0];
  await deleteContextChunksForSource(userId, sourceType, sourceId);

  for (const input of inputs) {
    await upsertContextChunk(input);
  }
}
