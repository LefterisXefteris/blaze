"use client";

import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

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

type Action = {
  id: string;
  intentType: string;
  riskLevel: string;
  status: string;
  payload: ActionPayload;
  result?: {
    url?: string;
    type?: string;
    status?: string;
    path?: string;
    cursor?: { opened?: boolean; method?: string; errors?: string[] };
    cursorRules?: { written?: boolean; path?: string };
  } | null;
  undoExpiresAt?: string | null;
  createdAt: string;
};

export function ActionCard({
  action,
  onConfirm,
  onReject,
  onUndo,
  showSession = false,
  sessionTitle,
}: {
  action: Action;
  onConfirm?: (id: string, payload?: ActionPayload) => void;
  onReject?: (id: string) => void;
  onUndo?: (id: string) => void;
  showSession?: boolean;
  sessionTitle?: string;
}) {
  const payload = action.payload;
  const isGitHubComment = action.intentType === "GITHUB_COMMENT";
  const isGitHubLabel = action.intentType === "GITHUB_LABEL";
  const isGitHubNextSteps = action.intentType === "GITHUB_NEXT_STEPS";
  const isGitHubAck = action.intentType === "GITHUB_ACK_COMMENT";

  const [editBody, setEditBody] = useState(
    action.payload.body ?? action.payload.description ?? ""
  );
  const [editFollowUp, setEditFollowUp] = useState(
    action.payload.draftFollowUp ?? action.payload.summary ?? ""
  );
  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    action.payload.labels ?? []
  );

  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const copyHandoff = async () => {
    try {
      const res = await fetch(`/api/actions/${action.id}/handoff`);
      if (!res.ok) throw new Error("Failed to load handoff");
      const data = await res.json();
      await navigator.clipboard.writeText(data.markdown ?? "");
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2000);
    }
  };

  const handoffPath =
    action.result?.type === "coding_handoff" && action.result?.path
      ? String(action.result.path)
      : null;
  const workspacePath =
    action.result?.type === "coding_handoff" && action.result?.workspaceRoot
      ? String(action.result.workspaceRoot)
      : action.result?.type === "coding_handoff" && action.result?.cursorDelivery?.workspaceRoot
        ? String(action.result.cursorDelivery.workspaceRoot)
        : null;

  const cursorOpened =
    action.result?.type === "coding_handoff" && action.result?.cursor?.opened;
  const cursorMethod =
    action.result?.type === "coding_handoff" && action.result?.cursor?.method;
  const cursorRulesPath =
    action.result?.type === "coding_handoff" && action.result?.cursorRules?.path
      ? String(action.result.cursorRules.path)
      : null;

  const canUndo =
    (action.status === "AUTO_EXECUTED" || action.status === "CONFIRMED") &&
    action.undoExpiresAt &&
    new Date(action.undoExpiresAt) > new Date();

  const statusColors: Record<string, string> = {
    PENDING: "badge-flame",
    AUTO_EXECUTED: "badge-auto",
    CONFIRMED: "badge-confirm",
    REJECTED: "badge-muted",
    UNDONE: "badge-muted",
    FAILED: "badge-priority",
  };

  const confirmLabel = isGitHubNextSteps
    ? payload.suggestedAction === "follow_up_comment"
      ? "Post follow-up & approve"
      : payload.suggestedAction === "mark_done"
        ? "Mark done in inbox"
        : payload.suggestedAction === "handoff_coding"
          ? "Hand off to coding agent"
          : "Hand off to coding agent"
    : isGitHubComment
      ? "Post to GitHub"
      : isGitHubLabel
        ? "Apply labels"
        : "Confirm";

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono uppercase text-muted">
              {action.intentType.replace(/_/g, " ")}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${statusColors[action.status] ?? "badge-muted"}`}
            >
              {action.status.replace(/_/g, " ")}
            </span>
            {action.riskLevel === "HIGH" && !isGitHubAck && (
              <span className="text-xs px-2 py-0.5 rounded-full badge-flame">
                needs approval
              </span>
            )}
          </div>
          <h3 className="font-medium mt-1">{payload.title ?? "Untitled action"}</h3>
          {payload.repo && (
            <p className="text-xs text-muted mt-1">
              {payload.repo}
              {payload.issueNumber ? `#${payload.issueNumber}` : ""}
            </p>
          )}
          {payload.summary && isGitHubNextSteps && (
            <p className="text-sm text-muted mt-1">{payload.summary}</p>
          )}
          {payload.description && !isGitHubComment && !isGitHubNextSteps && (
            <p className="text-sm text-muted mt-1">{payload.description}</p>
          )}
          {handoffPath && (
            <p className="text-xs text-muted mt-2 font-mono break-all">
              Handoff: {handoffPath}
            </p>
          )}
          {workspacePath && (
            <p className="text-xs text-muted mt-1 font-mono break-all">
              Workspace: {workspacePath}
            </p>
          )}
          {cursorOpened && cursorMethod && (
            <p className="text-xs text-muted mt-1">
              Opened in Cursor via {cursorMethod}
            </p>
          )}
          {cursorRulesPath && (
            <p className="text-xs text-muted mt-1 font-mono break-all">
              Cursor rule: {cursorRulesPath}
            </p>
          )}
          {isGitHubAck && action.status === "AUTO_EXECUTED" && action.result?.url && (
            <a
              href={action.result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-link hover:underline mt-1 inline-block"
            >
              View ack on GitHub
            </a>
          )}
          {showSession && sessionTitle && (
            <p className="text-xs text-muted mt-1">Session: {sessionTitle}</p>
          )}
        </div>
        <span className="text-xs text-muted whitespace-nowrap">
          {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
        </span>
      </div>

      {isGitHubNextSteps && payload.steps && payload.steps.length > 0 && (
        <ol className="text-sm list-decimal list-inside space-y-1 text-muted">
          {payload.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      {action.status === "PENDING" && isGitHubComment && (
        <textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          rows={4}
          className="w-full text-sm px-3 py-2 border border-border rounded-md bg-surface"
          placeholder="Edit comment before posting..."
        />
      )}

      {action.status === "PENDING" &&
        isGitHubNextSteps &&
        payload.suggestedAction === "follow_up_comment" && (
          <textarea
            value={editFollowUp}
            onChange={(e) => setEditFollowUp(e.target.value)}
            rows={4}
            className="w-full text-sm px-3 py-2 border border-border rounded-md bg-surface"
            placeholder="Edit follow-up comment before posting..."
          />
        )}

      {action.status === "PENDING" && isGitHubLabel && payload.labels && (
        <div className="flex gap-2 flex-wrap">
          {payload.labels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() =>
                setSelectedLabels((prev) =>
                  prev.includes(label)
                    ? prev.filter((l) => l !== label)
                    : [...prev, label]
                )
              }
              className={`text-xs px-2 py-1 rounded-full border ${
                selectedLabels.includes(label)
                  ? "btn-primary border-primary"
                  : "border-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1 flex-wrap">
        {action.status === "PENDING" && isGitHubNextSteps && (
          <button
            type="button"
            onClick={() => void copyHandoff()}
            className="text-sm px-3 py-1.5 btn-secondary"
          >
            {copyState === "copied"
              ? "Copied!"
              : copyState === "error"
                ? "Copy failed"
                : "Copy context"}
          </button>
        )}
        {action.status === "PENDING" && onConfirm && onReject && (
          <>
            <button
              onClick={() =>
                onConfirm(action.id, {
                  ...payload,
                  ...(isGitHubComment ? { body: editBody } : {}),
                  ...(isGitHubNextSteps ? { draftFollowUp: editFollowUp } : {}),
                  ...(isGitHubLabel ? { labels: selectedLabels } : {}),
                })
              }
              className="text-sm px-3 py-1.5 btn-primary rounded-md hover:opacity-90"
            >
              {confirmLabel}
            </button>
            <button
              onClick={() => onReject(action.id)}
              className="text-sm px-3 py-1.5 btn-secondary"
            >
              Dismiss
            </button>
          </>
        )}
        {canUndo && onUndo && (
          <button
            onClick={() => onUndo(action.id)}
            className="text-sm px-3 py-1.5 btn-secondary"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
