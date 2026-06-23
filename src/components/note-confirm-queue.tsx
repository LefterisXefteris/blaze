"use client";

import { useCallback, useEffect, useState } from "react";
import { ActionCard } from "@/components/action-card";

type ActionPayload = {
  title?: string;
  description?: string;
  body?: string;
  summary?: string;
  steps?: string[];
  suggestedAction?: string;
  draftFollowUp?: string;
  repo?: string;
  issueNumber?: number;
  labels?: string[];
};

type NoteAction = {
  id: string;
  intentType: string;
  riskLevel: string;
  status: string;
  payload: ActionPayload;
  result?: { url?: string } | null;
  undoExpiresAt?: string | null;
  createdAt: string;
};

type NoteConfirmQueueProps = {
  sessionId: string;
  variant?: "sidebar" | "page";
  analyzing?: boolean;
  awaitingProceed?: boolean;
  queuedJobCount?: number;
  processMessage?: string | null;
  refreshTrigger?: number;
  onPendingChange?: (count: number) => void;
  onDismissProceed?: () => void;
};

export function NoteConfirmQueue({
  sessionId,
  variant = "page",
  analyzing = false,
  awaitingProceed = false,
  queuedJobCount = 0,
  processMessage,
  refreshTrigger = 0,
  onPendingChange,
  onDismissProceed,
}: NoteConfirmQueueProps) {
  const [actions, setActions] = useState<NoteAction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/notes/actions?session_id=${sessionId}`);
    if (res.ok) {
      const data: NoteAction[] = await res.json();
      setActions(data);
      onPendingChange?.(data.filter((a) => a.status === "PENDING").length);
    }
    setLoading(false);
  }, [sessionId, onPendingChange]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, refreshTrigger]);

  const handleAction = async (
    actionId: string,
    operation: string,
    payload?: ActionPayload
  ) => {
    await fetch("/api/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, operation, payload }),
    });
    await load();
    if (operation === "confirm" || operation === "reject") {
      onDismissProceed?.();
    }
  };

  const pending = actions.filter((a) => a.status === "PENDING");
  const completed = actions.filter((a) =>
    ["AUTO_EXECUTED", "CONFIRMED", "UNDONE", "REJECTED"].includes(a.status)
  );

  const showSidebarBlock =
    variant === "sidebar" &&
    (pending.length > 0 || analyzing || awaitingProceed);

  const showPageBlock =
    variant === "page" && (pending.length > 0 || completed.length > 0);

  if (loading) return null;
  if (variant === "sidebar" && !showSidebarBlock) return null;
  if (variant === "page" && !showPageBlock) return null;

  const titleClass =
    variant === "sidebar" ? "notes-context-section-title" : "text-lg font-medium";
  const sectionClass =
    variant === "sidebar"
      ? "notes-agent-section notes-context-section"
      : "mb-8";

  return (
    <section className={sectionClass}>
      <div className={variant === "sidebar" ? "flex items-center justify-between mb-2" : "mb-4"}>
        <div>
          <h2 className={titleClass}>Confirm queue</h2>
          {variant === "page" && (
            <p className="text-sm text-muted mt-1">
              Actions inferred from your note — approve before Blaze executes them
            </p>
          )}
        </div>
        {variant === "sidebar" && analyzing && (
          <span className="text-xs text-muted animate-pulse">
            {queuedJobCount > 0 ? `Queuing ${queuedJobCount}…` : "Reading…"}
          </span>
        )}
      </div>

      {variant === "sidebar" && processMessage && pending.length > 0 && (
        <p className="text-xs text-muted mb-3 leading-relaxed">{processMessage}</p>
      )}

      {variant === "sidebar" && awaitingProceed && !analyzing && pending.length > 0 && (
        <div className="notes-proceed-prompt mb-3">
          <p className="text-sm leading-relaxed">
            Approve actions suggested from your note for linked issues.
          </p>
        </div>
      )}

      {variant === "sidebar" && analyzing && (
        <p className="text-xs text-muted mb-3 leading-relaxed">
          Analyzing your note against linked issues…
        </p>
      )}

      {variant === "sidebar" &&
        !analyzing &&
        pending.length === 0 &&
        awaitingProceed && (
          <p className="text-xs text-muted mb-3 leading-relaxed">
            No actions were suggested for this note.
          </p>
        )}

      {pending.length > 0 && (
        <div className="space-y-3">
          {pending.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onConfirm={(id, payload) => handleAction(id, "confirm", payload)}
              onReject={(id) => handleAction(id, "reject")}
            />
          ))}
        </div>
      )}

      {variant === "sidebar" && awaitingProceed && pending.length > 0 && !analyzing && onDismissProceed && (
        <button
          type="button"
          onClick={onDismissProceed}
          className="notes-toolbar-btn w-full mt-3 justify-center"
        >
          Not now
        </button>
      )}

      {variant === "page" && completed.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-muted mb-3">Activity</h3>
          <div className="space-y-3">
            {completed.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onUndo={(id) => handleAction(id, "undo")}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
