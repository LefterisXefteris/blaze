import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { NoteDetailView } from "@/components/note-detail-view";

type PageProps = { params: Promise<{ id: string }> };

type SessionDetail = {
  id: string;
  title: string | null;
  sourceType: string;
  sourceRef: string | null;
  userNotes: string;
  endedAt: string | null;
  startedAt: string;
  note: {
    aiSummary: string;
    structured: {
      decisions?: string[];
      actionItems?: Array<{ text: string; assignee?: string }>;
      openQuestions?: string[];
      keyQuotes?: Array<{ speaker: string; text: string }>;
    };
  } | null;
  messages: Array<{
    id: string;
    speaker: string;
    content: string;
    sentAt: string;
  }>;
  priorityItems: Array<{
    id: string;
    externalId: string;
    externalUrl: string;
    itemType: string;
    title: string;
    repo: string;
    reason: string;
    priority: number;
    aiSummary: string | null;
  }>;
};

async function fetchSessionDetail(id: string): Promise<SessionDetail | null> {
  const apiUrl = process.env.API_URL || "http://127.0.0.1:8000";
  const cookieStore = await cookies();
  const token = cookieStore.get("blaze-auth-token")?.value;
  if (!token) return null;

  const res = await fetch(`${apiUrl}/api/sessions/${id}`, {
    headers: { Cookie: `blaze-auth-token=${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function NotePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { id } = await params;
  const captureSession = await fetchSessionDetail(id);

  if (!captureSession?.note) {
    return (
      <div className="notes-page min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <p className="text-muted text-sm">Note not found. End the session first.</p>
      </div>
    );
  }

  const structured = captureSession.note.structured ?? {};

  return (
    <NoteDetailView
      sessionId={id}
      title={captureSession.title ?? "Session note"}
      endedAt={(captureSession.endedAt ?? captureSession.startedAt).toString()}
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
        sentAt: msg.sentAt,
      }))}
    />
  );
}
