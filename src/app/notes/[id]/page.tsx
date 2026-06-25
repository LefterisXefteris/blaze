import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NoteDetailView } from "@/components/note-detail-view";

type PageProps = { params: Promise<{ id: string }> };

export default async function NotePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { id } = await params;

  const captureSession = await db.captureSession.findFirst({
    where: { id, userId: session.user.id },
    include: {
      note: true,
      messages: { orderBy: { sentAt: "asc" } },
      priorityItems: true,
    },
  });

  if (!captureSession?.note) {
    return (
      <div className="notes-page min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <p className="text-muted text-sm">Note not found. End the session first.</p>
      </div>
    );
  }

  const structured = captureSession.note.structured as {
    decisions?: string[];
    actionItems?: Array<{ text: string; assignee?: string }>;
    openQuestions?: string[];
    keyQuotes?: Array<{ speaker: string; text: string }>;
  };

  return (
    <NoteDetailView
      sessionId={id}
      title={captureSession.title ?? "Session note"}
      endedAt={(captureSession.endedAt ?? captureSession.startedAt).toISOString()}
      sourceType={captureSession.sourceType}
      sourceRef={captureSession.sourceRef}
      userNotes={captureSession.userNotes}
      priorityItems={captureSession.priorityItems.map((item) => ({
        id: item.id,
        externalId: item.externalId,
        externalUrl: item.externalUrl,
        itemType: item.itemType,
        title: item.title,
        repo: item.repo,
        reason: item.reason,
        priority: item.priority,
        aiSummary: item.aiSummary,
      }))}
      summary={captureSession.note.aiSummary ?? ""}
      structured={structured}
      messages={captureSession.messages.map((msg) => ({
        id: msg.id,
        speaker: msg.speaker,
        content: msg.content,
        sentAt: msg.sentAt.toISOString(),
      }))}
    />
  );
}
