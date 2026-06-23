import { db } from "@/lib/db";
import { generateLiveSummary } from "@/lib/agent/extractor";
import { indexLiveMeetingTranscript } from "@/lib/vector/indexer";
import {
  persistRelatedContext,
  retrieveMeetingContext,
} from "@/lib/vector/context";

const MEETING_SOURCE_TYPES = new Set(["MEETING", "SLACK", "MANUAL"]);

export async function updateSessionLiveSummary(sessionId: string) {
  const session = await db.captureSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { sentAt: "asc" } } },
  });

  if (!session || session.status !== "ACTIVE") return;

  const messages = session.messages.map((m) => ({
    id: m.id,
    speaker: m.speaker,
    content: m.content,
    sentAt: m.sentAt,
  }));

  let relatedContextPrompt = "";
  if (MEETING_SOURCE_TYPES.has(session.sourceType)) {
    const relatedContext = await retrieveMeetingContext({
      userId: session.userId,
      sessionId: session.id,
      title: session.title,
      userNotes: session.userNotes,
      messages: session.messages.map((m) => ({
        speaker: m.speaker,
        content: m.content,
      })),
    });
    relatedContextPrompt = relatedContext.promptText;
    await persistRelatedContext(sessionId, relatedContext);

    void indexLiveMeetingTranscript({
      userId: session.userId,
      sessionId: session.id,
      title: session.title,
      userNotes: session.userNotes,
      messages: session.messages.map((m) => ({
        speaker: m.speaker,
        content: m.content,
      })),
    }).catch((error) => {
      console.error(`Meeting index failed for ${sessionId}:`, error);
    });
  }

  const liveSummary = await generateLiveSummary(
    messages,
    session.userNotes,
    { title: session.title, sourceType: session.sourceType },
    relatedContextPrompt
  );

  await db.captureSession.update({
    where: { id: sessionId },
    data: { liveSummary },
  });
}
