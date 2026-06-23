import { db } from "@/lib/db";
import { buildGitHubIndexText, buildMeetingIndexText } from "@/lib/vector/chunks";
import { indexChunks } from "@/lib/vector/store";
import type { IndexChunkInput } from "@/lib/vector/types";

export async function indexGitHubSession(params: {
  userId: string;
  sessionId: string;
  sourceRef: string;
  repo: string;
  number: number;
  title: string;
  itemType: string;
  aiSummary?: string | null;
  body?: string | null;
  priorityItemId?: string;
}) {
  const messages = await db.message.findMany({
    where: { sessionId: params.sessionId },
    orderBy: { sentAt: "asc" },
    select: { speaker: true, content: true },
  });

  const { purpose, chunks } = buildGitHubIndexText({
    repo: params.repo,
    number: params.number,
    title: params.title,
    itemType: params.itemType,
    aiSummary: params.aiSummary,
    body: params.body,
    comments: messages.map((m) => ({ speaker: m.speaker, content: m.content })),
  });

  const metadata = {
    repo: params.repo,
    number: params.number,
    title: params.title,
    itemType: params.itemType,
    sessionId: params.sessionId,
    priorityItemId: params.priorityItemId,
  };

  const sessionInputs: IndexChunkInput[] = chunks.map((content, chunkIndex) => ({
    userId: params.userId,
    sourceType: "GITHUB",
    sourceId: params.sessionId,
    sourceRef: params.sourceRef,
    chunkIndex,
    content,
    purpose,
    metadata,
  }));

  await indexChunks(sessionInputs);

  if (params.priorityItemId) {
    const priorityInputs: IndexChunkInput[] = chunks.map((content, chunkIndex) => ({
      userId: params.userId,
      sourceType: "PRIORITY",
      sourceId: params.priorityItemId!,
      sourceRef: params.sourceRef,
      chunkIndex,
      content,
      purpose,
      metadata,
    }));
    await indexChunks(priorityInputs);
  }
}

export async function indexMeetingSession(params: {
  userId: string;
  sessionId: string;
  title?: string | null;
  aiSummary: string;
  structured?: {
    decisions?: string[];
    actionItems?: Array<{ text: string }>;
  };
}) {
  const { purpose, chunks } = buildMeetingIndexText({
    title: params.title,
    aiSummary: params.aiSummary,
    decisions: params.structured?.decisions,
    actionItems: params.structured?.actionItems,
  });

  const inputs: IndexChunkInput[] = chunks.map((content, chunkIndex) => ({
    userId: params.userId,
    sourceType: "MEETING",
    sourceId: params.sessionId,
    sourceRef: null,
    chunkIndex,
    content,
    purpose,
    metadata: { sessionId: params.sessionId, title: params.title },
  }));

  await indexChunks(inputs);
}

export async function indexLiveMeetingTranscript(params: {
  userId: string;
  sessionId: string;
  title?: string | null;
  userNotes: string;
  messages: Array<{ speaker: string; content: string }>;
}) {
  if (params.messages.length === 0 && !params.userNotes.trim()) return;

  const transcript = params.messages
    .slice(-20)
    .map((m) => `${m.speaker}: ${m.content}`)
    .join("\n");

  const content = [
    params.title ? `Meeting: ${params.title}` : null,
    params.userNotes.trim() ? `Notes:\n${params.userNotes.trim()}` : null,
    transcript ? `Recent transcript:\n${transcript}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const purpose = params.title
    ? `Live meeting: ${params.title}`
    : "Live meeting in progress";

  await indexChunks([
    {
      userId: params.userId,
      sourceType: "MEETING",
      sourceId: params.sessionId,
      sourceRef: null,
      chunkIndex: 0,
      content,
      purpose,
      metadata: { sessionId: params.sessionId, live: true },
    },
  ]);
}
