"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  format,
  isToday,
  isYesterday,
  startOfDay,
  subDays,
} from "date-fns";

export type NoteListItem = {
  id: string;
  title: string | null;
  sourceType: "MANUAL" | "SLACK" | "MEETING" | "GITHUB";
  status: "ACTIVE" | "ENDED";
  startedAt: string;
  endedAt: string | null;
  hasSummary: boolean;
  pendingActions: number;
  autoActions: number;
  rejectedActions: number;
  githubLinks: number;
  messageCount: number;
};

type NotesListSidebarProps = {
  activeSessionId: string | null;
  onSelectNote: (item: NoteListItem) => void;
  onNewNote: () => void;
  refreshKey?: number;
};

type DateGroup = {
  key: string;
  label: string;
  items: NoteListItem[];
};

function groupNotesByDate(items: NoteListItem[]): DateGroup[] {
  const groups = new Map<string, DateGroup>();

  for (const item of items) {
    const date = new Date(item.startedAt);
    let key: string;
    let label: string;

    if (isToday(date)) {
      key = "today";
      label = "Today";
    } else if (isYesterday(date)) {
      key = "yesterday";
      label = "Yesterday";
    } else if (date >= startOfDay(subDays(new Date(), 7))) {
      key = format(date, "yyyy-MM-dd");
      label = format(date, "EEEE");
    } else {
      key = format(date, "yyyy-MM");
      label = format(date, "MMMM yyyy");
    }

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { key, label, items: [item] });
    }
  }

  const order = ["today", "yesterday"];
  return Array.from(groups.values()).sort((a, b) => {
    const aIdx = order.indexOf(a.key);
    const bIdx = order.indexOf(b.key);
    if (aIdx !== -1 || bIdx !== -1) {
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    }
    return b.key.localeCompare(a.key) * -1;
  });
}

function SlackIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.34 24a2.528 2.528 0 01-2.52-2.522v-6.313zM8.34 5.042a2.528 2.528 0 01-2.52-2.52A2.528 2.528 0 018.34 0a2.528 2.528 0 012.521 2.522v2.52H8.34zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.34a2.528 2.528 0 012.522-2.521H8.34zm6.313 2.521a2.528 2.528 0 012.521-2.521A2.528 2.528 0 0124 8.34a2.528 2.528 0 01-2.522 2.521h-2.522V8.34zm-1.271 0a2.528 2.528 0 01-2.521 2.522 2.528 2.528 0 01-2.521-2.522V2.522A2.528 2.528 0 0113.66 0a2.528 2.528 0 012.521 2.522v6.313zm2.521 8.34a2.528 2.528 0 012.521 2.522 2.528 2.528 0 01-2.521 2.522 2.527 2.527 0 01-2.521-2.522v-2.522h2.521zm0-1.271a2.527 2.527 0 01-2.521-2.52 2.527 2.527 0 012.521-2.521h6.313A2.528 2.528 0 0124 13.66a2.528 2.528 0 01-2.522 2.521h-6.313z" />
    </svg>
  );
}

function GitHubIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2C6.477 2 2 6.586 2 12.253c0 4.525 2.865 8.37 6.839 9.727.5.094.683-.22.683-.488 0-.241-.009-.878-.014-1.723-2.782.622-3.369-1.366-3.369-1.366-.454-1.174-1.11-1.487-1.11-1.487-.908-.636.069-.624.069-.624 1.004.073 1.532 1.058 1.532 1.058.892 1.561 2.341 1.11 2.91.849.091-.666.349-1.11.635-1.365-2.221-.258-4.555-1.136-4.555-5.07 0-1.12.39-2.036 1.03-2.754-.104-.258-.447-1.295.098-2.698 0 0 .84-.272 2.75 1.052A9.32 9.32 0 0112 6.86c.85.004 1.705.116 2.504.34 1.909-1.324 2.748-1.052 2.748-1.052.546 1.403.203 2.44.1 2.698.64.718 1.028 1.634 1.028 2.754 0 3.944-2.337 4.81-4.566 5.062.359.317.678.94.678 1.895 0 1.368-.012 2.47-.012 2.806 0 .27.18.586.688.486C19.138 20.618 22 16.776 22 12.253 22 6.586 17.523 2 12 2z" />
    </svg>
  );
}

function NoteIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MeetingIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M4 8.5V18a1 1 0 001 1h14a1 1 0 001-1V8.5M8 5h8l1 3H7l1-3z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12h6M9 15h4" strokeLinecap="round" />
    </svg>
  );
}

function SourceIcon({ sourceType }: { sourceType: NoteListItem["sourceType"] }) {
  switch (sourceType) {
    case "SLACK":
      return <SlackIcon className="w-3.5 h-3.5 notes-sidebar-source-slack" />;
    case "MEETING":
      return <MeetingIcon className="w-3.5 h-3.5 notes-sidebar-source-meeting" />;
    case "GITHUB":
      return <GitHubIcon className="w-3.5 h-3.5 notes-sidebar-source-github" />;
    default:
      return <NoteIcon className="w-3.5 h-3.5 notes-sidebar-source-manual" />;
  }
}

function sourceLabel(sourceType: NoteListItem["sourceType"]) {
  switch (sourceType) {
    case "SLACK":
      return "Slack";
    case "MEETING":
      return "Meeting";
    case "GITHUB":
      return "GitHub";
    default:
      return "Notes";
  }
}

function StatusIcon({ item }: { item: NoteListItem }) {
  if (item.hasSummary || item.status === "ENDED") {
    return (
      <span className="notes-sidebar-status notes-sidebar-status-done" aria-label="Summarized">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (item.pendingActions > 0) {
    return (
      <span className="notes-sidebar-status notes-sidebar-status-pending" aria-label="Needs approval">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (item.status === "ACTIVE") {
    return (
      <span className="notes-sidebar-status notes-sidebar-status-active" aria-label="In progress">
        <span className="notes-sidebar-status-dot" />
      </span>
    );
  }

  return (
    <span className="notes-sidebar-status notes-sidebar-status-idle" aria-label="Draft">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
        <circle cx="12" cy="12" r="9" />
      </svg>
    </span>
  );
}

function NoteListRow({
  item,
  isActive,
  onSelect,
}: {
  item: NoteListItem;
  isActive: boolean;
  onSelect: (item: NoteListItem) => void;
}) {
  const title = item.title?.trim() || "Untitled";
  const hasStats =
    item.autoActions > 0 ||
    item.pendingActions > 0 ||
    item.githubLinks > 0 ||
    item.messageCount > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`notes-sidebar-item ${isActive ? "notes-sidebar-item-active" : ""}`}
    >
      <StatusIcon item={item} />
      <span className="notes-sidebar-item-body">
        <span className="notes-sidebar-item-title">{title}</span>
        {hasStats ? (
          <span className="notes-sidebar-item-meta">
            {item.autoActions > 0 && (
              <span className="notes-sidebar-stat notes-sidebar-stat-auto">
                +{item.autoActions}
              </span>
            )}
            {item.pendingActions > 0 && (
              <span className="notes-sidebar-stat notes-sidebar-stat-pending">
                {item.pendingActions} pending
              </span>
            )}
            {item.githubLinks > 0 && (
              <span className="notes-sidebar-stat notes-sidebar-stat-github">
                <GitHubIcon className="w-3 h-3" />
                {item.githubLinks}
              </span>
            )}
            {item.messageCount > 0 && item.sourceType !== "MANUAL" && (
              <span className="notes-sidebar-stat notes-sidebar-stat-muted">
                {item.messageCount} msgs
              </span>
            )}
          </span>
        ) : (
          <span className="notes-sidebar-item-meta notes-sidebar-item-source">
            <SourceIcon sourceType={item.sourceType} />
            <span>{sourceLabel(item.sourceType)}</span>
          </span>
        )}
      </span>
    </button>
  );
}

export function NotesListSidebar({
  activeSessionId,
  onSelectNote,
  onNewNote,
  refreshKey = 0,
}: NotesListSidebarProps) {
  const [items, setItems] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async (nextOffset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/notes/list?limit=30&offset=${nextOffset}`);
      if (!res.ok) return;
      const data = await res.json();
      setItems((prev) =>
        append ? [...prev, ...(data.items ?? [])] : (data.items ?? [])
      );
      setHasMore(Boolean(data.hasMore));
      setOffset(nextOffset + (data.items?.length ?? 0));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(0, false);
  }, [load, refreshKey]);

  const groups = useMemo(() => groupNotesByDate(items), [items]);

  return (
    <aside className="notes-sidebar">
      <div className="notes-sidebar-header">
        <h2 className="notes-sidebar-heading">All notes</h2>
        <button
          type="button"
          onClick={onNewNote}
          className="notes-sidebar-new"
          title="New note"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
        </button>
      </div>

      <div className="notes-sidebar-scroll">
        {loading && items.length === 0 ? (
          <div className="notes-sidebar-loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="notes-sidebar-skeleton">
                <div className="skeleton h-4 w-4 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-full" />
                  <div className="skeleton h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="notes-sidebar-empty">No notes yet. Start writing or capture a Slack huddle.</p>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="notes-sidebar-group">
              <h3 className="notes-sidebar-group-label">{group.label}</h3>
              <ul className="notes-sidebar-list">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NoteListRow
                      item={item}
                      isActive={item.id === activeSessionId}
                      onSelect={onSelectNote}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {hasMore && !loading && (
          <button
            type="button"
            onClick={() => void load(offset, true)}
            disabled={loadingMore}
            className="notes-sidebar-more"
          >
            {loadingMore ? "Loading…" : "More"}
          </button>
        )}
      </div>

      <div className="notes-sidebar-footer">
        <Link href="/sessions/new" className="notes-sidebar-footer-link">
          Import session
        </Link>
      </div>
    </aside>
  );
}
