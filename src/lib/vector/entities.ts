import { db } from "@/lib/db";
import { parseGitHubUrl } from "@/lib/types";
import type { ContextHit } from "@/lib/vector/types";

function externalIdForIssue(repo: string, number: number) {
  return `${repo}#${number}`;
}

export async function detectEntityMatches(
  userId: string,
  text: string
): Promise<ContextHit[]> {
  const hits: ContextHit[] = [];
  const seen = new Set<string>();

  const urlMatches = text.match(
    /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:issues|pull)\/\d+/gi
  );
  if (urlMatches) {
    for (const url of urlMatches) {
      const parsed = parseGitHubUrl(url);
      if (!parsed) continue;
      const externalId = externalIdForIssue(parsed.repo, parsed.number);
      await addPriorityHit(userId, externalId, hits, seen, "entity_match");
    }
  }

  const prRefs = text.match(/\b(?:PR|pull request|issue)\s*#?(\d+)\b/gi) ?? [];
  for (const ref of prRefs) {
    const numMatch = ref.match(/(\d+)/);
    if (!numMatch) continue;
    const number = parseInt(numMatch[1], 10);

    const items = await db.priorityItem.findMany({
      where: { userId, status: "open" },
      select: {
        id: true,
        externalId: true,
        title: true,
        repo: true,
        aiSummary: true,
        sessionId: true,
        externalUrl: true,
        itemType: true,
      },
    });

    for (const item of items) {
      const [, itemNumberStr] = item.externalId.split("#");
      const itemNumber = parseInt(itemNumberStr ?? "", 10);
      if (itemNumber !== number) continue;

      const key = `PRIORITY:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      hits.push({
        id: item.id,
        sourceType: "PRIORITY",
        sourceId: item.id,
        sourceRef: item.externalId,
        purpose: item.aiSummary ?? `${item.repo}#${number}: ${item.title}`,
        content: item.aiSummary ?? item.title,
        similarity: 0.99,
        linkReason: "entity_match",
        metadata: {
          repo: item.repo,
          externalUrl: item.externalUrl,
          sessionId: item.sessionId,
          itemType: item.itemType,
        },
      });
    }
  }

  const repoHashRefs = text.match(/\b([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)#(\d+)\b/g);
  if (repoHashRefs) {
    for (const ref of repoHashRefs) {
      const match = ref.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)#(\d+)$/);
      if (!match) continue;
      const externalId = `${match[1]}#${match[2]}`;
      await addPriorityHit(userId, externalId, hits, seen, "entity_match");
    }
  }

  return hits;
}

async function addPriorityHit(
  userId: string,
  externalId: string,
  hits: ContextHit[],
  seen: Set<string>,
  linkReason: ContextHit["linkReason"]
) {
  const item = await db.priorityItem.findUnique({
    where: {
      userId_source_externalId: { userId, source: "github", externalId },
    },
    select: {
      id: true,
      externalId: true,
      title: true,
      repo: true,
      aiSummary: true,
      sessionId: true,
      externalUrl: true,
      itemType: true,
    },
  });

  if (!item) return;

  const key = `PRIORITY:${item.id}`;
  if (seen.has(key)) return;
  seen.add(key);

  hits.push({
    id: item.id,
    sourceType: "PRIORITY",
    sourceId: item.id,
    sourceRef: item.externalId,
    purpose: item.aiSummary ?? `${item.repo}: ${item.title}`,
    content: item.aiSummary ?? item.title,
    similarity: 0.99,
    linkReason,
    metadata: {
      repo: item.repo,
      externalUrl: item.externalUrl,
      sessionId: item.sessionId,
      itemType: item.itemType,
    },
  });
}

export async function findPriorityByTitleKeywords(
  userId: string,
  title: string | null | undefined
): Promise<ContextHit[]> {
  if (!title?.trim()) return [];

  const words = title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["meeting", "review", "sync", "standup"].includes(w));

  if (words.length === 0) return [];

  const items = await db.priorityItem.findMany({
    where: { userId, status: "open" },
    select: {
      id: true,
      externalId: true,
      title: true,
      repo: true,
      aiSummary: true,
      sessionId: true,
      externalUrl: true,
      itemType: true,
    },
    take: 20,
  });

  const hits: ContextHit[] = [];
  for (const item of items) {
    const haystack = `${item.title} ${item.aiSummary ?? ""} ${item.repo}`.toLowerCase();
    const matches = words.filter((w) => haystack.includes(w)).length;
    if (matches >= Math.min(2, words.length)) {
      hits.push({
        id: item.id,
        sourceType: "PRIORITY",
        sourceId: item.id,
        sourceRef: item.externalId,
        purpose: item.aiSummary ?? item.title,
        content: item.aiSummary ?? item.title,
        similarity: 0.85 + matches * 0.02,
        linkReason: "entity_match",
        metadata: {
          repo: item.repo,
          externalUrl: item.externalUrl,
          sessionId: item.sessionId,
          itemType: item.itemType,
        },
      });
    }
  }

  return hits.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
}
