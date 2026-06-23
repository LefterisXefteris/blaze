import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { findPriorityByTitleKeywords, detectEntityMatches } from "@/lib/vector/entities";
import { searchContext, formatContextForPrompt } from "@/lib/vector/search";
import type { ContextHit } from "@/lib/vector/types";

export type SessionRelatedContext = {
  hits: ContextHit[];
  promptText: string;
  updatedAt: string;
};

function dedupeHits(hits: ContextHit[]): ContextHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.sourceType}:${hit.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function retrieveMeetingContext(params: {
  userId: string;
  sessionId: string;
  title?: string | null;
  userNotes: string;
  messages: Array<{ speaker: string; content: string }>;
}): Promise<SessionRelatedContext> {
  const transcriptWindow = params.messages
    .slice(-10)
    .map((m) => m.content)
    .join(" ");

  const query = [
    params.title ?? "",
    params.userNotes,
    transcriptWindow,
  ]
    .filter(Boolean)
    .join("\n");

  const [semanticHits, entityFromText, titleHits, explicitLinks] = await Promise.all([
    searchContext({
      userId: params.userId,
      query,
      topK: 5,
    }),
    detectEntityMatches(params.userId, query),
    findPriorityByTitleKeywords(params.userId, params.title),
    db.contextLink.findMany({
      where: { userId: params.userId, fromId: params.sessionId },
    }),
  ]);

  const explicitHits: ContextHit[] = [];
  for (const link of explicitLinks) {
    if (link.toType === "PRIORITY") {
      const item = await db.priorityItem.findFirst({
        where: { id: link.toId, userId: params.userId },
      });
      if (item) {
        explicitHits.push({
          id: item.id,
          sourceType: "PRIORITY",
          sourceId: item.id,
          sourceRef: item.externalId,
          purpose: item.aiSummary ?? item.title,
          content: item.aiSummary ?? item.title,
          similarity: 1,
          linkReason: "explicit",
          metadata: {
            externalUrl: item.externalUrl,
            sessionId: item.sessionId,
          },
        });
      }
    }
  }

  const githubHits = dedupeHits([
    ...explicitHits,
    ...entityFromText,
    ...titleHits,
    ...semanticHits,
  ]).filter((h) => h.sourceType === "GITHUB" || h.sourceType === "PRIORITY");

  const hits = githubHits.slice(0, 5);
  const promptText = formatContextForPrompt(hits);

  return {
    hits,
    promptText,
    updatedAt: new Date().toISOString(),
  };
}

export async function persistRelatedContext(
  sessionId: string,
  context: SessionRelatedContext
) {
  const session = await db.captureSession.findUnique({
    where: { id: sessionId },
    select: { metadata: true, userId: true },
  });
  if (!session) return;

  const metadata = (session.metadata as Record<string, unknown> | null) ?? {};
  await db.captureSession.update({
    where: { id: sessionId },
    data: {
      metadata: {
        ...metadata,
        relatedContext: context,
      } as Prisma.InputJsonValue,
    },
  });

  for (const hit of context.hits) {
    if (hit.sourceType !== "PRIORITY") continue;
    await db.contextLink.upsert({
      where: {
        userId_fromId_toId: {
          userId: session.userId,
          fromId: sessionId,
          toId: hit.sourceId,
        },
      },
      create: {
        userId: session.userId,
        fromType: "MEETING",
        fromId: sessionId,
        toType: "PRIORITY",
        toId: hit.sourceId,
        linkReason:
          hit.linkReason === "entity_match"
            ? "ENTITY_MATCH"
            : hit.linkReason === "explicit"
              ? "EXPLICIT"
              : "SEMANTIC",
        confidence: hit.similarity,
      },
      update: {
        linkReason:
          hit.linkReason === "entity_match"
            ? "ENTITY_MATCH"
            : hit.linkReason === "explicit"
              ? "EXPLICIT"
              : "SEMANTIC",
        confidence: hit.similarity,
      },
    });
  }
}

export async function linkPriorityToSession(
  userId: string,
  sessionId: string,
  priorityItemId: string
) {
  await db.contextLink.upsert({
    where: {
      userId_fromId_toId: { userId, fromId: sessionId, toId: priorityItemId },
    },
    create: {
      userId,
      fromType: "MEETING",
      fromId: sessionId,
      toType: "PRIORITY",
      toId: priorityItemId,
      linkReason: "EXPLICIT",
      confidence: 1,
    },
    update: { linkReason: "EXPLICIT", confidence: 1 },
  });
}

export function getStoredRelatedContext(
  metadata: unknown
): SessionRelatedContext | null {
  if (!metadata || typeof metadata !== "object") return null;
  const related = (metadata as { relatedContext?: SessionRelatedContext }).relatedContext;
  if (!related?.hits) return null;
  return related;
}
