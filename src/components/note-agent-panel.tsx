"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import type { SessionAction } from "@/lib/note-source-types";
import { InlineSpinner } from "@/components/ui/skeletons";

const ActionCard = dynamic(
  () => import("@/components/action-card").then((m) => ({ default: m.ActionCard })),
  { ssr: false }
);

const NoteConfirmQueue = dynamic(
  () =>
    import("@/components/note-confirm-queue").then((m) => ({
      default: m.NoteConfirmQueue,
    })),
  { loading: () => <InlineSpinner label="Loading actions…" /> }
);

type NoteAgentPanelProps = {
  sessionId: string;
  actions?: SessionAction[];
  onConfirm?: (id: string, payload?: SessionAction["payload"]) => void;
  onReject?: (id: string) => void;
  onUndo?: (id: string) => void;
  analyzing?: boolean;
  awaitingProceed?: boolean;
  queuedJobCount?: number;
  processMessage?: string | null;
  refreshTrigger?: number;
  onPendingChange?: (count: number) => void;
  onDismissProceed?: () => void;
  showConfirmQueue?: boolean;
  variant?: "hero" | "inline";
};

export const NoteAgentPanel = memo(function NoteAgentPanel({
  sessionId,
  actions = [],
  onConfirm,
  onReject,
  onUndo,
  analyzing = false,
  awaitingProceed = false,
  queuedJobCount = 0,
  processMessage,
  refreshTrigger = 0,
  onPendingChange,
  onDismissProceed,
  showConfirmQueue = true,
  variant = "hero",
}: NoteAgentPanelProps) {
  const pending = actions.filter((a) => a.status === "PENDING");
  const completed = actions.filter((a) =>
    ["AUTO_EXECUTED", "CONFIRMED", "UNDONE", "REJECTED"].includes(a.status)
  );
  const hasContent =
    pending.length > 0 ||
    completed.length > 0 ||
    analyzing ||
    awaitingProceed;

  const wrapperClass =
    variant === "hero" ? "notes-agent-hero notes-section" : "notes-section";

  return (
    <div className={wrapperClass}>
      <h2 className="notes-section-title">Agent recommendations</h2>

      {showConfirmQueue && (
        <NoteConfirmQueue
          sessionId={sessionId}
          variant="page"
          analyzing={analyzing}
          awaitingProceed={awaitingProceed}
          queuedJobCount={queuedJobCount}
          processMessage={processMessage}
          refreshTrigger={refreshTrigger}
          onPendingChange={onPendingChange}
          onDismissProceed={onDismissProceed}
        />
      )}

      {pending.length > 0 && (
        <div className="space-y-3 mt-3">
          {pending.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onConfirm={
                onConfirm ? (id, payload) => onConfirm(id, payload) : undefined
              }
              onReject={onReject ? (id) => onReject(id) : undefined}
            />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Activity
          </h3>
          <div className="space-y-3">
            {completed.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onUndo={onUndo ? (id) => onUndo(id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {!hasContent && (
        <p className="notes-section-body text-muted mt-2">
          Blaze will suggest actions as it reads the source material.
        </p>
      )}
    </div>
  );
});
