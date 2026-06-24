"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { InlineSpinner } from "@/components/ui/skeletons";

const ActionCard = dynamic(
  () => import("./action-card").then((m) => ({ default: m.ActionCard })),
  { ssr: false }
);

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
  messages: Message[];
  agentActions: Action[];
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

function LiveNotesPanel({
  liveSummary,
  isRecording,
}: {
  liveSummary: string;
  isRecording: boolean;
}) {
  return (
    <div className="card p-5 min-h-[280px]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Live notes</h2>
        {isRecording && (
          <span className="flex items-center gap-1.5 text-xs badge-flame px-2 py-1 rounded-full">
            <span className="landing-live-dot w-2 h-2" />
            Recording
          </span>
        )}
      </div>
      {liveSummary ? (
        <div className="text-sm leading-relaxed whitespace-pre-wrap prose-muted">
          {liveSummary.split("\n").map((line, i) => {
            if (line.startsWith("**") && line.endsWith("**")) {
              return (
                <p key={i} className="font-semibold text-foreground mt-2 first:mt-0">
                  {line.replace(/\*\*/g, "")}
                </p>
              );
            }
            if (line.startsWith("• ") || line.startsWith("- ")) {
              return (
                <p key={i} className="pl-1 text-foreground">
                  {line}
                </p>
              );
            }
            if (line.trim() === "") return <br key={i} />;
            return (
              <p key={i} className="text-foreground">
                {line}
              </p>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Notes will appear here as the conversation unfolds — like Granola, Blaze
          listens and summarizes for you.
        </p>
      )}
    </div>
  );
}

export function SessionView({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [userNotes, setUserNotes] = useState("");
  const [liveSummary, setLiveSummary] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [loading, setLoading] = useState(true);
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
    await fetch(`/api/sessions/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speaker: "You", content: newMessage }),
    });
    setNewMessage("");
    fetchSession();
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
    await fetch("/api/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, operation, payload }),
    });
    fetchSession();
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold">
              {session.title ?? "Untitled session"}
            </h1>
            {session.sourceType === "SLACK" && (
              <span className="text-xs px-2 py-1 rounded-full badge-muted">
                Slack
              </span>
            )}
            {session.sourceType === "MEETING" && (
              <span className="text-xs px-2 py-1 rounded-full badge-flame">
                Meeting
              </span>
            )}
            {isActive && isMeetingCapture && (
              <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full badge-flame">
                <span className="landing-live-dot w-2 h-2" />
                Capturing
              </span>
            )}
          </div>
          <p className="text-sm text-muted mt-1">
            {session.sourceType} · {session.messages.length} messages
            {session.sourceRef ? ` · ${session.sourceRef}` : ""}
          </p>
          {session.sourceType === "GITHUB" && session.sourceRef && (
            <Link
              href="/inbox"
              className="text-xs text-link hover:underline mt-1 inline-block"
            >
              View in inbox
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          {isActive && (
            <button onClick={endSession} className="px-4 py-2 text-sm btn-secondary">
              {isMeetingCapture ? "End meeting & save notes" : "End session"}
            </button>
          )}
          {!isActive && (
            <Link
              href={`/notes/${sessionId}`}
              className="px-4 py-2 text-sm btn-primary rounded-md hover:opacity-90"
            >
              View note
            </Link>
          )}
        </div>
      </div>

      {isMeetingCapture && isActive ? (
        <div className="space-y-6">
          <LiveMicCapture
            sessionId={sessionId}
            onTranscript={fetchSession}
            autoStart={session.sourceType === "SLACK"}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <LiveNotesPanel liveSummary={liveSummary} isRecording={isActive} />
            <RelatedContextPanel relatedContext={relatedContext} />
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Your notes</h2>
                <button
                  onClick={saveNotes}
                  className="text-xs text-muted hover:text-foreground"
                >
                  Save
                </button>
              </div>
              <textarea
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                onBlur={saveNotes}
                placeholder="Jot down anything Blaze should remember — your notes shape the final summary."
                className="w-full h-[240px] px-3 py-2 text-sm border border-border rounded-lg bg-surface resize-none"
              />
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="text-sm text-muted hover:text-foreground mb-2"
            >
              {showTranscript ? "Hide" : "Show"} transcript ({session.messages.length})
            </button>
            {showTranscript && (
              <div className="card max-h-[400px] overflow-y-auto">
                {session.messages.length === 0 ? (
                  <p className="p-4 text-sm text-muted">
                    No transcript yet — click <strong>Start listening</strong> above,
                    or type in Slack / the box below.
                  </p>
                ) : (
                  session.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="px-4 py-3 border-b border-border-subtle last:border-0"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{msg.speaker}</span>
                        <span className="text-xs text-muted">
                          {format(new Date(msg.sentAt), "HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm mt-0.5">{msg.content}</p>
                    </div>
                  ))
                )}
              </div>
            )}
            {session.sourceType === "SLACK" && isActive && (
              <div className="flex gap-2">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMessage()}
                  placeholder="Type what was said (voice isn't captured)..."
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-surface"
                />
                <button
                  onClick={addMessage}
                  className="px-4 py-2 text-sm btn-primary rounded-md"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {session.agentActions.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-2">
                Suggested actions
              </h2>
              <div className="space-y-2">
                {session.agentActions.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    onConfirm={
                      action.status === "PENDING"
                        ? (id, payload) => handleAction(id, "confirm", payload)
                        : undefined
                    }
                    onReject={
                      action.status === "PENDING"
                        ? (id) => handleAction(id, "reject")
                        : undefined
                    }
                    onUndo={(id) => handleAction(id, "undo")}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
              Transcript
            </h2>
            <div className="card min-h-[400px] max-h-[600px] overflow-y-auto">
              {session.messages.length === 0 ? (
                <p className="p-4 text-sm text-muted">
                  {session.sourceType === "SLACK"
                    ? "No transcript yet — start listening above, or type in Slack."
                    : "No messages yet"}
                </p>
              ) : (
                session.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="px-4 py-3 border-b border-border-subtle last:border-0"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{msg.speaker}</span>
                      <span className="text-xs text-muted">
                        {format(new Date(msg.sentAt), "HH:mm")}
                      </span>
                    </div>
                    <p className="text-sm mt-0.5">{msg.content}</p>
                  </div>
                ))
              )}
            </div>

            {isActive && (session.sourceType === "MANUAL" || session.sourceType === "SLACK") && (
              <div className="flex gap-2">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMessage()}
                  placeholder={
                    session.sourceType === "SLACK"
                      ? "Type what was said (Blaze can't hear voice yet)..."
                      : "Add a message (simulates conversation)..."
                  }
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-surface"
                />
                <button
                  onClick={addMessage}
                  className="px-4 py-2 text-sm btn-primary rounded-md"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {isActive && liveSummary && (
              <LiveNotesPanel liveSummary={liveSummary} isRecording={isActive} />
            )}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
                  Scratch notes
                </h2>
                {isActive && (
                  <button
                    onClick={saveNotes}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    Save
                  </button>
                )}
              </div>
              <textarea
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                onBlur={saveNotes}
                disabled={!isActive}
                placeholder="Jot down key points..."
                className="w-full h-32 px-3 py-2 text-sm border border-border rounded-lg bg-surface resize-none"
              />
            </div>

            <div>
              <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-2">
                Agent actions
              </h2>
              <div className="space-y-2">
                {session.agentActions.length === 0 ? (
                  <p className="text-sm text-muted">
                    Actions will appear here as the agent detects intents
                  </p>
                ) : (
                  session.agentActions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      onConfirm={
                        action.status === "PENDING"
                          ? (id, payload) => handleAction(id, "confirm", payload)
                          : undefined
                      }
                      onReject={
                        action.status === "PENDING"
                          ? (id) => handleAction(id, "reject")
                          : undefined
                      }
                      onUndo={(id) => handleAction(id, "undo")}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
