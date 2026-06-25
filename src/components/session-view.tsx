"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { InlineSpinner } from "@/components/ui/skeletons";
import { NotesShell } from "@/components/notes-shell";
import { NoteSourceBadge } from "@/components/note-source-badge";
import { NoteSourcePanel } from "@/components/note-source-panel";
import { NoteAgentPanel } from "@/components/note-agent-panel";
import { NoteDeleteButton } from "@/components/note-delete-button";
import type { LinkedPriorityItem } from "@/lib/note-source-types";

const LiveMicCapture = dynamic(
  () => import("./live-mic-capture").then((m) => ({ default: m.LiveMicCapture })),
  {
    ssr: false,
    loading: () => <InlineSpinner label="Loading mic…" />,
  }
);

type Message = {
  id: string;
  speaker: string;
  content: string;
  sentAt: string;
};

type Action = {
  id: string;
  intentType: string;
  riskLevel: string;
  status: string;
  payload: { title?: string; description?: string };
  undoExpiresAt?: string | null;
  createdAt: string;
};

type SessionData = {
  id: string;
  title: string | null;
  status: string;
  userNotes: string;
  liveSummary: string;
  sourceType: string;
  sourceRef: string | null;
  startedAt: string;
  messages: Message[];
  agentActions: Action[];
  priorityItems?: LinkedPriorityItem[];
};

type RelatedContextHit = {
  sourceType: string;
  sourceRef: string | null;
  purpose: string | null;
  content: string;
  similarity: number;
  linkReason: string;
  metadata?: {
    externalUrl?: string;
    sessionId?: string;
    repo?: string;
  };
};

type RelatedContext = {
  hits: RelatedContextHit[];
  updatedAt: string;
};

function RelatedContextPanel({
  relatedContext,
}: {
  relatedContext: RelatedContext | null;
}) {
  if (!relatedContext?.hits?.length) {
    return (
      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-2">Related context</h2>
        <p className="text-sm text-muted">
          Blaze will surface linked PRs and issues as the meeting unfolds.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold mb-3">Related context</h2>
      <div className="space-y-3">
        {relatedContext.hits.map((hit, i) => {
          const url = hit.metadata?.externalUrl;
          const sessionId = hit.metadata?.sessionId;
          const reasonLabel =
            hit.linkReason === "entity_match"
              ? "PR reference"
              : hit.linkReason === "explicit"
                ? "Linked"
                : `${Math.round(hit.similarity * 100)}% match`;

          return (
            <div
              key={`${hit.sourceRef ?? hit.content}-${i}`}
              className="rounded-lg border border-border-subtle px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  {hit.sourceType === "PRIORITY" || hit.sourceType === "GITHUB"
                    ? "GitHub"
                    : hit.sourceType.toLowerCase()}
                  {hit.sourceRef ? ` · ${hit.sourceRef}` : ""}
                </span>
                <span className="text-xs badge-muted px-2 py-0.5 rounded-full">
                  {reasonLabel}
                </span>
              </div>
              <p className="text-sm leading-relaxed">
                {hit.purpose ?? hit.content.slice(0, 200)}
              </p>
              <div className="flex gap-3 mt-2">
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-link hover:underline"
                  >
                    Open on GitHub
                  </a>
                )}
                {sessionId && (
                  <Link
                    href={`/sessions/${sessionId}`}
                    className="text-xs text-link hover:underline"
                  >
                    View thread
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SessionView({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [userNotes, setUserNotes] = useState("");
  const [liveSummary, setLiveSummary] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [relatedContext, setRelatedContext] = useState<RelatedContext | null>(null);

  const fetchRelatedContext = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/context`);
    if (res.ok) {
      setRelatedContext(await res.json());
    }
  }, [sessionId]);

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      setSession(data);
      setUserNotes(data.userNotes ?? "");
      setLiveSummary(data.liveSummary ?? "");
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
    fetchRelatedContext();
  }, [fetchSession, fetchRelatedContext]);

  useEffect(() => {
    if (!session || session.status !== "ACTIVE") return;

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);

    es.addEventListener("init", (e) => {
      const data = JSON.parse(e.data);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              messages: data.messages,
              agentActions: data.actions,
              userNotes: data.userNotes,
              liveSummary: data.liveSummary ?? "",
            }
          : prev
      );
      setUserNotes(data.userNotes);
      setLiveSummary(data.liveSummary ?? "");
    });

    es.addEventListener("messages", (e) => {
      const msgs = JSON.parse(e.data);
      setSession((prev) =>
        prev ? { ...prev, messages: [...prev.messages, ...msgs] } : prev
      );
    });

    es.addEventListener("actions", (e) => {
      const actions = JSON.parse(e.data);
      setSession((prev) =>
        prev
          ? { ...prev, agentActions: [...actions, ...prev.agentActions] }
          : prev
      );
    });

    es.addEventListener("notes", (e) => {
      const data = JSON.parse(e.data);
      setUserNotes(data.userNotes);
    });

    es.addEventListener("liveSummary", (e) => {
      const data = JSON.parse(e.data);
      setLiveSummary(data.liveSummary);
    });

    es.addEventListener("relatedContext", (e) => {
      setRelatedContext(JSON.parse(e.data));
    });

    es.addEventListener("end", () => {
      es.close();
      fetchSession().then(() => router.push(`/notes/${sessionId}`));
    });

    return () => es.close();
  }, [sessionId, session?.status, fetchSession, router]);

  const saveNotes = async () => {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userNotes }),
    });
  };

  const addMessage = async () => {
    if (!newMessage.trim()) return;
    const content = newMessage.trim();
    setNewMessage("");
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speaker: "You", content }),
    });
    if (res.ok) {
      const data = await res.json();
      setSession((prev) =>
        prev ? { ...prev, messages: data.messages ?? prev.messages } : prev
      );
    }
  };

  const endSession = async () => {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    });
    router.push(`/notes/${sessionId}`);
  };

  const handleAction = async (
    actionId: string,
    operation: string,
    payload?: Action["payload"]
  ) => {
    const res = await fetch("/api/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, operation, payload }),
    });
    if (res.ok) {
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          agentActions: prev.agentActions.map((a) =>
            a.id === actionId
              ? {
                  ...a,
                  status:
                    operation === "confirm"
                      ? "CONFIRMED"
                      : operation === "reject"
                        ? "REJECTED"
                        : operation === "undo"
                          ? "UNDONE"
                          : a.status,
                }
              : a
          ),
        };
      });
    }
  };

  if (loading) {
    return <div className="p-8 text-muted">Loading session...</div>;
  }

  if (!session) {
    return <div className="p-8 text-muted">Session not found</div>;
  }

  const isActive = session.status === "ACTIVE";
  const isMeetingCapture =
    session.sourceType === "SLACK" || session.sourceType === "MEETING";

  if (isMeetingCapture && isActive) {
    return (
      <NotesShell
        activeSessionId={sessionId}
        defaultContextOpen
        sidebarRefreshKey={sidebarRefreshKey}
        toolbarActions={
          <>
            <NoteDeleteButton
              sessionId={sessionId}
              title={session.title}
              onDeleted={() => setSidebarRefreshKey((key) => key + 1)}
            />
            <button
              type="button"
              onClick={endSession}
              className="notes-toolbar-btn notes-toolbar-btn-primary"
            >
              End meeting & save notes
            </button>
          </>
        }
        aside={
          <NoteSourcePanel
            sourceType={session.sourceType}
            sourceRef={session.sourceRef}
            messages={session.messages}
            liveSummary={liveSummary || undefined}
            userNotes={userNotes}
            scratchEditable
            onScratchChange={setUserNotes}
            onScratchSave={saveNotes}
          >
            <section className="notes-context-section">
              <LiveMicCapture
                sessionId={sessionId}
                onTranscript={fetchSession}
                autoStart={session.sourceType === "SLACK"}
              />
            </section>
            {session.sourceType === "SLACK" && (
              <section className="notes-context-section">
                <div className="flex gap-2">
                  <input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addMessage()}
                    placeholder="Type what was said..."
                    className="notes-inline-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={addMessage}
                    className="notes-toolbar-btn notes-toolbar-btn-primary shrink-0"
                  >
                    Add
                  </button>
                </div>
              </section>
            )}
            <section className="notes-context-section">
              <RelatedContextPanel relatedContext={relatedContext} />
            </section>
          </NoteSourcePanel>
        }
      >
        <main className="notes-document">
          <h1 className="notes-title-display">
            {session.title ?? "Untitled session"}
          </h1>
          <NoteSourceBadge
            sourceType={session.sourceType}
            sourceRef={session.sourceRef}
            date={format(new Date(session.startedAt), "PPP")}
          />
          <span className="flex items-center gap-1.5 text-xs badge-flame px-2 py-1 rounded-full w-fit mb-4">
            <span className="landing-live-dot w-2 h-2" />
            Capturing
          </span>

          <article className="notes-article">
            <NoteAgentPanel
              sessionId={sessionId}
              actions={session.agentActions}
              showConfirmQueue={false}
              onConfirm={(id, payload) => handleAction(id, "confirm", payload)}
              onReject={(id) => handleAction(id, "reject")}
              onUndo={(id) => handleAction(id, "undo")}
              variant="hero"
            />
          </article>
        </main>
      </NotesShell>
    );
  }

  return (
    <NotesShell
      activeSessionId={sessionId}
      defaultContextOpen={
        session.sourceType !== "MANUAL" ||
        session.agentActions.length > 0 ||
        session.messages.length > 0
      }
      sidebarRefreshKey={sidebarRefreshKey}
      aside={
        <NoteSourcePanel
          sourceType={session.sourceType}
          sourceRef={session.sourceRef}
          messages={session.messages}
          priorityItems={session.priorityItems ?? []}
          liveSummary={liveSummary || undefined}
          userNotes={userNotes}
          scratchEditable={isActive}
          onScratchChange={setUserNotes}
          onScratchSave={saveNotes}
          scratchDisabled={!isActive}
        >
          {isActive &&
            (session.sourceType === "MANUAL" || session.sourceType === "SLACK") && (
              <section className="notes-context-section">
                <div className="flex gap-2">
                  <input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addMessage()}
                    placeholder={
                      session.sourceType === "SLACK"
                        ? "Type what was said..."
                        : "Add a message..."
                    }
                    className="notes-inline-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={addMessage}
                    className="notes-toolbar-btn notes-toolbar-btn-primary shrink-0"
                  >
                    Add
                  </button>
                </div>
              </section>
            )}
        </NoteSourcePanel>
      }
      toolbarActions={
        <>
          <NoteDeleteButton
            sessionId={sessionId}
            title={session.title}
            onDeleted={() => setSidebarRefreshKey((key) => key + 1)}
          />
          {isActive ? (
            <button
              type="button"
              onClick={endSession}
              className="notes-toolbar-btn notes-toolbar-btn-primary"
            >
              End session
            </button>
          ) : (
            <Link href={`/notes/${sessionId}`} className="notes-toolbar-btn">
              View note
            </Link>
          )}
        </>
      }
    >
      <main className="notes-document">
        <h1 className="notes-title-display">
          {session.title ?? "Untitled session"}
        </h1>
        <NoteSourceBadge
          sourceType={session.sourceType}
          sourceRef={session.sourceRef}
          date={format(new Date(session.startedAt), "PPP")}
        />

        <article className="notes-article">
          <NoteAgentPanel
            sessionId={sessionId}
            actions={session.agentActions}
            showConfirmQueue={false}
            onConfirm={(id, payload) => handleAction(id, "confirm", payload)}
            onReject={(id) => handleAction(id, "reject")}
            onUndo={(id) => handleAction(id, "undo")}
            variant="hero"
          />
        </article>
      </main>
    </NotesShell>
  );
}
