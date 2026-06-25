"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { NotesShell } from "@/components/notes-shell";
import { NoteSourceBadge } from "@/components/note-source-badge";
import { NoteSourcePanel } from "@/components/note-source-panel";
import { NoteAgentPanel } from "@/components/note-agent-panel";
import { NoteDeleteButton } from "@/components/note-delete-button";
import { useSessionStream } from "@/hooks/use-session-stream";
import type { LinkedPriorityItem } from "@/lib/note-source-types";
import type { RelatedContext, StreamAction, StreamMessage } from "@/lib/session-stream-types";

type SessionData = {
  id: string;
  title: string | null;
  status: string;
  userNotes: string;
  liveSummary: string;
  sourceType: string;
  sourceRef: string | null;
  startedAt: string;
  messages: StreamMessage[];
  agentActions: StreamAction[];
  priorityItems?: LinkedPriorityItem[];
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
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [initialRelatedContext, setInitialRelatedContext] = useState<RelatedContext | null>(
    null
  );

  const fetchRelatedContext = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/context`);
    if (res.ok) {
      setInitialRelatedContext(await res.json());
    }
  }, [sessionId]);

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      setSession(data);
      setUserNotes(data.userNotes ?? "");
    }
    setLoading(false);
  }, [sessionId]);

  const streamHandlers = useMemo(
    () => ({
      onInit: (data: {
        messages: StreamMessage[];
        actions: StreamAction[];
        userNotes: string;
        liveSummary: string;
      }) => {
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
      },
      onMessages: (msgs: StreamMessage[]) => {
        setSession((prev) =>
          prev ? { ...prev, messages: [...prev.messages, ...msgs] } : prev
        );
      },
      onActions: (actions: StreamAction[]) => {
        setSession((prev) =>
          prev
            ? { ...prev, agentActions: [...actions, ...prev.agentActions] }
            : prev
        );
      },
      onEnd: () => {
        fetchSession().then(() => router.push(`/notes/${sessionId}`));
      },
    }),
    [fetchSession, router, sessionId]
  );

  const { liveSummary, relatedContext, remoteUserNotes } = useSessionStream(
    sessionId,
    session?.status === "ACTIVE",
    streamHandlers
  );

  useEffect(() => {
    fetchSession();
    fetchRelatedContext();
  }, [fetchSession, fetchRelatedContext]);

  useEffect(() => {
    if (remoteUserNotes !== null) {
      setUserNotes(remoteUserNotes);
    }
  }, [remoteUserNotes]);

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
    payload?: StreamAction["payload"]
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

  const displayLiveSummary = liveSummary || session.liveSummary || "";
  const displayRelatedContext = relatedContext ?? initialRelatedContext;

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
            liveSummary={displayLiveSummary || undefined}
            userNotes={userNotes}
            scratchEditable
            onScratchChange={setUserNotes}
            onScratchSave={saveNotes}
          >
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
              <RelatedContextPanel relatedContext={displayRelatedContext} />
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
          liveSummary={displayLiveSummary || undefined}
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
