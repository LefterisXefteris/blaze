"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { formatDistanceToNow } from "date-fns";

const ActionCard = dynamic(
  () => import("@/components/action-card").then((m) => ({ default: m.ActionCard })),
  { ssr: false }
);

type AgentAction = {
  id: string;
  intentType: string;
  status: string;
  payload: {
    title?: string;
    summary?: string;
    steps?: string[];
    suggestedAction?: string;
    draftFollowUp?: string;
    body?: string;
    repo?: string;
    issueNumber?: number;
  };
  result?: { url?: string } | null;
};

type PriorityItem = {
  id: string;
  repo: string;
  externalId: string;
  externalUrl: string;
  itemType: string;
  title: string;
  reason: string;
  priority: number;
  status: string;
  aiSummary: string | null;
  sessionId: string | null;
  createdAt: string;
  session: {
    id: string;
    title: string | null;
    agentActions?: AgentAction[];
  } | null;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned" },
  { key: "mentioned", label: "Mentioned" },
  { key: "review_requested", label: "Review requested" },
];

const PRIORITY_LABELS: Record<number, string> = {
  1: "P1",
  2: "P2",
  3: "P3",
};

export default function InboxPage() {
  const [items, setItems] = useState<PriorityItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = async () => {
    const url =
      filter === "all"
        ? "/api/github/inbox"
        : `/api/github/inbox?reason=${filter}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setItems(data);
      if (!selectedId && data.length > 0) setSelectedId(data[0].id);
    }
  };

  const syncMentions = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/github/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.error ?? "Sync failed");
        return;
      }
      setSyncMessage(
        data.synced > 0
          ? `Synced ${data.synced} mention${data.synced === 1 ? "" : "s"}`
          : "No new mentions found"
      );
      await load();
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    syncMentions();
  }, []);

  useEffect(() => {
    load();
  }, [filter]);

  const selected = items.find((i) => i.id === selectedId);

  const updateItem = async (
    id: string,
    data: { status?: string; priority?: number; snoozedUntil?: string }
  ) => {
    await fetch("/api/priority", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    load();
  };

  const handleAction = async (
    actionId: string,
    operation: string,
    payload?: AgentAction["payload"]
  ) => {
    await fetch("/api/actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, operation, payload }),
    });
    load();
  };

  const selectedActions = selected?.session?.agentActions ?? [];
  const ackAction = selectedActions.find(
    (a) => a.intentType === "GITHUB_ACK_COMMENT"
  );
  const nextStepsAction = selectedActions.find(
    (a) => a.intentType === "GITHUB_NEXT_STEPS"
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="text-muted text-sm mt-1">
            GitHub assignments, mentions, and review requests
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sessions/new"
            className="text-sm px-3 py-1.5 btn-secondary"
          >
            Import issue URL
          </Link>
          <button
            onClick={syncMentions}
            disabled={syncing}
            className="text-sm px-3 py-1.5 btn-primary rounded-md disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync mentions"}
          </button>
        </div>
      </div>
      {syncMessage && (
        <p className="text-sm text-muted mb-4">{syncMessage}</p>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-sm rounded-md capitalize ${
              filter === f.key
                ? "btn-primary"
                : "border border-border bg-surface text-muted hover:border-blaze-orange/30"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[500px]">
        <div className="card overflow-hidden">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted">No GitHub items yet</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full text-left px-4 py-3 border-b border-border last:border-0 card-hover transition-colors ${
                  selectedId === item.id
                    ? "bg-surface-elevated border-l-2 border-l-blaze-orange/50"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      item.priority === 1
                        ? "badge-priority"
                        : "badge-muted"
                    }`}
                  >
                    {PRIORITY_LABELS[item.priority] ?? "P2"}
                  </span>
                  <span className="text-xs text-muted">{item.repo}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded badge-flame capitalize">
                    {item.reason.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="font-medium text-sm mt-1 line-clamp-1">{item.title}</p>
                <p className="text-xs text-muted mt-0.5">
                  {formatDistanceToNow(new Date(item.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="card p-4">
          {!selected ? (
            <p className="text-sm text-muted">Select an item</p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-muted">
                    {selected.itemType === "pull_request" ? "PR" : "Issue"}
                  </span>
                  <span className="text-xs text-muted">{selected.repo}</span>
                </div>
                <h2 className="text-lg font-semibold mt-1">{selected.title}</h2>
                <a
                  href={selected.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-link hover:underline mt-1 inline-block"
                >
                  Open on GitHub
                </a>
              </div>

              {selected.aiSummary && (
                <div>
                  <h3 className="text-sm font-medium text-muted mb-1">
                    AI summary
                  </h3>
                  <p className="text-sm">{selected.aiSummary}</p>
                </div>
              )}

              {selected.reason === "mentioned" && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted">
                    Agent actions
                  </h3>
                  {ackAction ? (
                    <div className="text-sm card p-3">
                      {ackAction.status === "AUTO_EXECUTED" ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="badge-success px-2 py-0.5 rounded text-xs">
                            Ack posted on GitHub
                          </span>
                          {ackAction.result?.url && (
                            <a
                              href={ackAction.result.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-link hover:underline"
                            >
                              View comment
                            </a>
                          )}
                        </div>
                      ) : ackAction.status === "FAILED" ? (
                        <span className="text-blaze-red">
                          Failed to post ack — check GitHub token permissions
                        </span>
                      ) : (
                        <span className="text-muted">Posting ack...</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Sync mentions again to run the agent on this item
                    </p>
                  )}
                  {nextStepsAction && (
                    <ActionCard
                      action={{
                        ...nextStepsAction,
                        riskLevel: "HIGH",
                        createdAt: selected.createdAt,
                      }}
                      onConfirm={(id, payload) =>
                        handleAction(id, "confirm", payload)
                      }
                      onReject={(id) => handleAction(id, "reject")}
                    />
                  )}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3].map((p) => (
                  <button
                    key={p}
                    onClick={() => updateItem(selected.id, { priority: p })}
                    className={`text-xs px-2 py-1 rounded border ${
                      selected.priority === p
                        ? "btn-primary border-primary"
                        : "border-border"
                    }`}
                  >
                    P{p}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 flex-wrap pt-2">
                <button
                  onClick={() => updateItem(selected.id, { status: "done" })}
                  className="text-sm px-3 py-1.5 btn-primary rounded-md"
                >
                  Mark done
                </button>
                <button
                  onClick={() =>
                    updateItem(selected.id, {
                      snoozedUntil: new Date(
                        Date.now() + 86400000
                      ).toISOString(),
                    })
                  }
                  className="text-sm px-3 py-1.5 btn-secondary"
                >
                  Snooze 1 day
                </button>
                {selected.session && (
                  <Link
                    href={`/sessions/${selected.session.id}`}
                    className="text-sm px-3 py-1.5 btn-secondary"
                  >
                    View session
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
