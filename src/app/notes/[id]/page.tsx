import Link from "next/link";
import dynamic from "next/dynamic";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { format } from "date-fns";
import { InlineSpinner } from "@/components/ui/skeletons";

const NoteConfirmQueue = dynamic(
  () =>
    import("@/components/note-confirm-queue").then((m) => ({
      default: m.NoteConfirmQueue,
    })),
  { loading: () => <InlineSpinner label="Loading actions…" /> }
);

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
    },
  });

  if (!captureSession?.note) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-muted">Note not found. End the session first.</p>
        <Link href={`/sessions/${id}`} className="text-sm text-link mt-2 inline-block">
          Back to session
        </Link>
      </div>
    );
  }

  const structured = captureSession.note.structured as {
    summary?: string;
    decisions?: string[];
    actionItems?: Array<{ text: string; assignee?: string }>;
    openQuestions?: string[];
    keyQuotes?: Array<{ speaker: string; text: string }>;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/notes" className="text-sm text-muted hover:text-foreground">
        ← Notes
      </Link>
      <h1 className="text-2xl font-semibold mt-4">
        {captureSession.title ?? "Session note"}
      </h1>
      <p className="text-sm text-muted mt-1">
        {format(captureSession.endedAt ?? captureSession.startedAt, "PPP")}
      </p>

      <article className="mt-8 max-w-none">
        <section className="mb-8">
          <h2 className="text-lg font-medium">Summary</h2>
          <p className="text-muted mt-2 prose-muted leading-relaxed">
            {captureSession.note.aiSummary}
          </p>
        </section>

        {structured.decisions && structured.decisions.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-medium">Decisions</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {structured.decisions.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </section>
        )}

        {structured.actionItems && structured.actionItems.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-medium">Action items</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {structured.actionItems.map((item, i) => (
                <li key={i}>
                  {item.text}
                  {item.assignee && (
                    <span className="text-muted"> — {item.assignee}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {structured.openQuestions && structured.openQuestions.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-medium">Open questions</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {structured.openQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        )}

        <NoteConfirmQueue sessionId={id} variant="page" />

        {captureSession.messages.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-medium">Transcript</h2>
            <div className="mt-2 card divide-y divide-border-subtle">
              {captureSession.messages.map((msg) => (
                <div key={msg.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{msg.speaker}</span>
                    <span className="text-xs text-muted">
                      {format(msg.sentAt, "HH:mm")}
                    </span>
                  </div>
                  <p className="text-sm mt-0.5 text-muted">{msg.content}</p>
                </div>
              ))}
            </div>
            {captureSession.sourceType === "SLACK" && (
              <p className="text-xs text-muted mt-2">
                Slack huddles capture typed thread messages automatically. For{" "}
                <strong>voice</strong>, open the live session in Blaze and click{" "}
                <strong>Start listening</strong> — lines appear here and in Slack when
                ElevenLabs Scribe is configured (<code>ELEVENLABS_API_KEY</code>).
              </p>
            )}
          </section>
        )}

        {structured.keyQuotes && structured.keyQuotes.length > 0 && (
          <section>
            <h2 className="text-lg font-medium">Key quotes</h2>
            <div className="mt-2 space-y-3">
              {structured.keyQuotes.map((q, i) => (
                <blockquote
                  key={i}
                  className="border-l-2 border-border pl-4 italic text-muted"
                >
                  &ldquo;{q.text}&rdquo;
                  <footer className="text-sm not-italic text-muted mt-1">
                    — {q.speaker}
                  </footer>
                </blockquote>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
