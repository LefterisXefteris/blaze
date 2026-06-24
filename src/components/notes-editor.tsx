"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { getCaretCoordinates } from "@/lib/caret-coords";
import { InlineSpinner } from "@/components/ui/skeletons";
import {
  NotesListSidebar,
  type NoteListItem,
} from "@/components/notes-list-sidebar";

const NoteConfirmQueue = dynamic(
  () =>
    import("@/components/note-confirm-queue").then((m) => ({
      default: m.NoteConfirmQueue,
    })),
  { loading: () => <InlineSpinner label="Loading actions…" /> }
);

type MatchedIssue = {
  id: string;
  repo: string;
  externalId: string;
  externalUrl: string;
  itemType: string;
  title: string;
  reason: string;
  priority: number;
  aiSummary: string | null;
  sessionId: string | null;
  matchReason: string;
  similarity?: number;
  excerpt?: string;
  excerptStart?: number;
  excerptEnd?: number;
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
  aiSummary: string | null;
};

type MentionRange = { start: number; end: number; query: string };

function getMentionRange(text: string, cursor: number): MentionRange | null {
  const before = text.slice(0, cursor);
  const match = before.match(/(?:^|[\s\n])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[1];
  return { start: cursor - query.length - 1, end: cursor, query };
}

function filterPriorityItems(items: PriorityItem[], query: string): PriorityItem[] {
  const q = query.toLowerCase().trim();
  const sorted = [...items].sort((a, b) => a.priority - b.priority);
  if (!q) return sorted.slice(0, 8);

  return sorted
    .filter((item) => {
      const haystack = `${item.externalId} ${item.title} ${item.repo}`.toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, 8);
}

const PRIORITY_DOT: Record<number, string> = {
  1: "notes-priority-dot-p1",
  2: "notes-priority-dot-p2",
  3: "notes-priority-dot-p3",
};

const REASON_LABELS: Record<string, string> = {
  assigned: "Assigned",
  mentioned: "Mentioned",
  review_requested: "Review",
  manual: "Imported",
  entity_match: "PR reference",
  semantic: "Topic match",
};

const MATCH_REASON_LABELS: Record<string, string> = {
  entity_match: "PR reference",
  semantic: "Topic match",
  explicit: "Linked",
};

const SESSION_KEY = "blaze-notes-session-id";

function GitHubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 2C6.477 2 2 6.586 2 12.253c0 4.525 2.865 8.37 6.839 9.727.5.094.683-.22.683-.488 0-.241-.009-.878-.014-1.723-2.782.622-3.369-1.366-3.369-1.366-.454-1.174-1.11-1.487-1.11-1.487-.908-.636.069-.624.069-.624 1.004.073 1.532 1.058 1.532 1.058.892 1.561 2.341 1.11 2.91.849.091-.666.349-1.11.635-1.365-2.221-.258-4.555-1.136-4.555-5.07 0-1.12.39-2.036 1.03-2.754-.104-.258-.447-1.295.098-2.698 0 0 .84-.272 2.75 1.052A9.32 9.32 0 0112 6.86c.85.004 1.705.116 2.504.34 1.909-1.324 2.748-1.052 2.748-1.052.546 1.403.203 2.44.1 2.698.64.718 1.028 1.634 1.028 2.754 0 3.944-2.337 4.81-4.566 5.062.359.317.678.94.678 1.895 0 1.368-.012 2.47-.012 2.806 0 .27.18.586.688.486C19.138 20.618 22 16.776 22 12.253 22 6.586 17.523 2 12 2z"
        fill="currentColor"
      />
    </svg>
  );
}

function PriorityInboxRow({
  item,
  onInsert,
}: {
  item: PriorityItem;
  onInsert: (item: PriorityItem) => void;
}) {
  const dotClass = PRIORITY_DOT[item.priority] ?? PRIORITY_DOT[2];

  return (
    <button
      type="button"
      onClick={() => onInsert(item)}
      className="notes-inbox-row w-full text-left group"
      title={`Insert ${item.externalId}`}
    >
      <span className={`notes-priority-dot shrink-0 ${dotClass}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm truncate group-hover:text-foreground transition-colors">
          {item.title}
        </span>
        <span className="block text-xs text-muted truncate mt-0.5">
          {item.externalId}
          <span className="mx-1.5 opacity-40">·</span>
          {REASON_LABELS[item.reason] ?? item.reason}
        </span>
      </span>
    </button>
  );
}

function IssueChip({ issue }: { issue: MatchedIssue }) {
  const dotClass = PRIORITY_DOT[issue.priority] ?? PRIORITY_DOT[2];
  const matchLabel =
    MATCH_REASON_LABELS[issue.matchReason] ??
    (issue.similarity ? `${Math.round(issue.similarity * 100)}% match` : null);

  return (
    <a
      href={issue.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="notes-issue-chip group"
    >
      <span className={`notes-priority-dot ${dotClass}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate group-hover:text-foreground transition-colors">
          {issue.title}
        </p>
        <p className="text-xs text-muted truncate mt-0.5">
          {issue.externalId}
          <span className="mx-1.5 opacity-40">·</span>
          {REASON_LABELS[issue.reason] ?? issue.reason}
          {matchLabel && (
            <>
              <span className="mx-1.5 opacity-40">·</span>
              {matchLabel}
            </>
          )}
        </p>
        {issue.excerpt && (
          <p className="text-xs text-muted mt-1.5 line-clamp-2 leading-relaxed opacity-80">
            “{issue.excerpt}”
          </p>
        )}
      </div>
      <GitHubIcon className="w-3.5 h-3.5 text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

function MentionMenu({
  items,
  selectedIndex,
  onSelect,
  onHighlight,
  position,
}: {
  items: PriorityItem[];
  selectedIndex: number;
  onSelect: (item: PriorityItem) => void;
  onHighlight: (index: number) => void;
  position: { top: number; left: number };
}) {
  const menu = (
    <div
      className="notes-mention-menu"
      style={{ top: position.top, left: position.left }}
      role="listbox"
      aria-label="Link issue from priority list"
    >
      <div className="notes-mention-menu-header">
        <span>Link to issue</span>
        <span className="text-muted font-normal">↑↓ navigate · ↵ select</span>
      </div>

      {items.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted">
          No matching issues.{" "}
          <Link href="/inbox" className="text-link hover:underline">
            Open inbox
          </Link>
        </p>
      ) : (
        <ul className="py-1 max-h-72 overflow-y-auto">
          {items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                className={`notes-mention-item ${
                  index === selectedIndex ? "notes-mention-item-active" : ""
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item);
                }}
                onMouseEnter={() => onHighlight(index)}
              >
                <span className="notes-mention-icon">
                  <GitHubIcon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm truncate">{item.title}</span>
                  <span className="block text-xs text-muted truncate mt-0.5">
                    {item.externalId}
                  </span>
                </span>
                <span
                  className={`notes-priority-dot shrink-0 ${PRIORITY_DOT[item.priority] ?? PRIORITY_DOT[2]}`}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}

export function NotesEditor() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [matchedIssues, setMatchedIssues] = useState<MatchedIssue[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [awaitingProceed, setAwaitingProceed] = useState(false);
  const [matching, setMatching] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [listSidebarOpen, setListSidebarOpen] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [priorityItems, setPriorityItems] = useState<PriorityItem[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [pendingActionCount, setPendingActionCount] = useState(0);
  const [confirmRefresh, setConfirmRefresh] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [processMessage, setProcessMessage] = useState<string | null>(null);
  const [queuedJobCount, setQueuedJobCount] = useState(0);

  const matchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSnapshotRef = useRef({ title: "", content: "" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingProcessRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const markDirty = useCallback((nextTitle: string, nextContent: string) => {
    const snap = savedSnapshotRef.current;
    setIsDirty(nextTitle !== snap.title || nextContent !== snap.content);
  }, []);

  const matchIssues = useCallback(async (text: string) => {
    if (!text.trim()) {
      setMatchedIssues([]);
      return;
    }
    setMatching(true);
    try {
      const res = await fetch("/api/notes/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = await res.json();
        setMatchedIssues(data.items ?? []);
      }
    } finally {
      setMatching(false);
    }
  }, []);

  const pollForActions = useCallback(
    async (expectedCount: number, sid: string) => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);

      let attempts = 0;
      const maxAttempts = 20;

      pollTimerRef.current = setInterval(async () => {
        attempts += 1;
        setConfirmRefresh((n) => n + 1);
        const res = await fetch(`/api/notes/actions?session_id=${sid}`);
        if (res.ok) {
          const actions = await res.json();
          const pending = actions.filter((a: { status: string }) => a.status === "PENDING");
          if (pending.length >= expectedCount || attempts >= maxAttempts) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setAnalyzing(false);
            setAwaitingProceed(pending.length > 0);
            setPendingActionCount(pending.length);
          }
        } else if (attempts >= maxAttempts) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setAnalyzing(false);
        }
      }, 1500);
    },
    []
  );

  const saveNote = useCallback(
    async (sid: string, noteTitle: string, noteContent: string): Promise<boolean> => {
      setSaveState("saving");
      const res = await fetch(`/api/sessions/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: noteTitle.trim() || "Untitled",
          userNotes: noteContent,
        }),
      });
      if (!res.ok) {
        setSaveState("idle");
        return false;
      }
      savedSnapshotRef.current = { title: noteTitle, content: noteContent };
      setIsDirty(false);
      setLastSavedAt(new Date());
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
      setSidebarRefreshKey((n) => n + 1);
      return true;
    },
    []
  );

  const processTranscript = useCallback(
    async (sid: string, noteTitle: string, noteText: string) => {
      if (!noteText.trim()) return;

      setAnalyzing(true);
      setAwaitingProceed(false);
      setProcessMessage(null);
      setSidebarOpen(true);

      const ok = await saveNote(sid, noteTitle, noteText);
      if (!ok) {
        setAnalyzing(false);
        return;
      }

      try {
        const res = await fetch("/api/notes/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            title: noteTitle,
            text: noteText,
          }),
        });

        if (!res.ok) {
          setAnalyzing(false);
          return;
        }

        const data = await res.json();
        setMatchedIssues(data.items ?? []);
        setQueuedJobCount(data.queued ?? 0);
        setProcessMessage(data.message ?? null);

        if ((data.queued ?? 0) > 0) {
          pollForActions(data.queued, sid);
        } else {
          setAnalyzing(false);
        }
      } catch {
        setAnalyzing(false);
      }
    },
    [saveNote, pollForActions]
  );

  const refreshPendingCount = useCallback(async (sid?: string) => {
    const id = sid ?? sessionId;
    if (!id) return;
    const res = await fetch(`/api/notes/actions?session_id=${id}`);
    if (res.ok) {
      const actions = await res.json();
      setPendingActionCount(
        actions.filter((a: { status: string }) => a.status === "PENDING").length
      );
    }
  }, [sessionId]);

  const initSession = useCallback(async () => {
    const storedId = localStorage.getItem(SESSION_KEY);

    if (storedId) {
      const res = await fetch(`/api/sessions/${storedId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "ACTIVE" && data.sourceType === "MANUAL") {
          setSessionId(data.id);
          const t = data.title ?? "";
          setTitle(t === "Untitled note" || t === "Untitled" ? "" : t);
          setContent(data.userNotes ?? "");
          savedSnapshotRef.current = {
            title: t === "Untitled note" || t === "Untitled" ? "" : t,
            content: data.userNotes ?? "",
          };
          setIsDirty(false);
          setLoading(false);
          if (data.userNotes) matchIssues(data.userNotes);
          refreshPendingCount(data.id);
          return;
        }
      }
      localStorage.removeItem(SESSION_KEY);
    }

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled", sourceType: "MANUAL" }),
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem(SESSION_KEY, data.id);
      setSessionId(data.id);
    }
    setLoading(false);
  }, [matchIssues, refreshPendingCount]);

  const loadPriorityItems = useCallback(async () => {
    const res = await fetch("/api/github/inbox");
    if (res.ok) setPriorityItems(await res.json());
  }, []);

  const loadSessionIntoEditor = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) return false;

      const data = await res.json();
      localStorage.setItem(SESSION_KEY, data.id);
      setSessionId(data.id);
      const t = data.title ?? "";
      const normalizedTitle =
        t === "Untitled note" || t === "Untitled" ? "" : t;
      setTitle(normalizedTitle);
      setContent(data.userNotes ?? "");
      savedSnapshotRef.current = {
        title: normalizedTitle,
        content: data.userNotes ?? "",
      };
      setIsDirty(false);
      setMatchedIssues([]);
      setAwaitingProceed(false);
      setProcessMessage(null);
      setLastSavedAt(null);
      if (data.userNotes) {
        void matchIssues(data.userNotes);
      }
      void refreshPendingCount(data.id);
      return true;
    },
    [matchIssues, refreshPendingCount]
  );

  const handleSelectNote = useCallback(
    async (item: NoteListItem) => {
      if (item.id === sessionId) return;

      if (item.hasSummary || item.status === "ENDED") {
        router.push(`/notes/${item.id}`);
        return;
      }

      if (item.sourceType !== "MANUAL") {
        router.push(`/sessions/${item.id}`);
        return;
      }

      setLoading(true);
      await loadSessionIntoEditor(item.id);
      setLoading(false);
    },
    [sessionId, router, loadSessionIntoEditor]
  );

  const analyzeAllLinked = useCallback(
    async (issues: MatchedIssue[], noteTitle: string, noteText: string) => {
      if (!sessionId || !noteText.trim() || issues.length === 0) return;
      setAnalyzing(true);
      setAwaitingProceed(true);
      setSidebarOpen(true);
      try {
        for (const issue of issues) {
          await fetch("/api/notes/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              priorityItemId: issue.id,
              title: noteTitle,
              text: noteText,
            }),
          });
        }
        await refreshPendingCount();
        setConfirmRefresh((n) => n + 1);
      } finally {
        setAnalyzing(false);
      }
    },
    [sessionId, refreshPendingCount]
  );

  const handleSave = useCallback(async () => {
    if (!sessionId) return;
    const fullNote = [title, content].filter(Boolean).join("\n");
    if (!fullNote.trim()) return;

    const ok = await saveNote(sessionId, title, content);
    if (!ok) return;

    let issues = matchedIssues;
    if (issues.length === 0) {
      setMatching(true);
      try {
        const res = await fetch("/api/notes/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: fullNote }),
        });
        if (res.ok) {
          const data = await res.json();
          issues = data.items ?? [];
          setMatchedIssues(issues);
        }
      } finally {
        setMatching(false);
      }
    }

    if (issues.length > 0) {
      await analyzeAllLinked(issues, title, fullNote);
    } else {
      setAwaitingProceed(false);
    }
  }, [sessionId, title, content, matchedIssues, saveNote, analyzeAllLinked]);

  const filteredMentionItems = mentionRange
    ? filterPriorityItems(priorityItems, mentionRange.query)
    : [];

  const updateMentionMenu = useCallback((text: string, cursor: number) => {
    const range = getMentionRange(text, cursor);
    if (!range) {
      setMentionOpen(false);
      setMentionRange(null);
      return;
    }
    setMentionRange(range);
    setMentionOpen(true);
    setMentionIndex(0);
    if (textareaRef.current) {
      const coords = getCaretCoordinates(textareaRef.current, cursor);
      const menuWidth = 340;
      const left = Math.min(
        Math.max(12, coords.left),
        window.innerWidth - menuWidth - 12
      );
      setMentionPosition({ top: coords.top + coords.height + 6, left });
    }
  }, []);

  const insertIssueRef = useCallback(
    (item: PriorityItem) => {
      const insert = `${item.externalId} `;
      const el = textareaRef.current;
      const cursor = el?.selectionStart ?? content.length;
      const newContent = content.slice(0, cursor) + insert + content.slice(cursor);
      setContent(newContent);
      markDirty(title, newContent);

      const cursorPos = cursor + insert.length;
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.selectionStart = cursorPos;
        el.selectionEnd = cursorPos;
      });
    },
    [content, title, markDirty]
  );

  const insertMention = useCallback(
    (item: PriorityItem) => {
      if (!mentionRange) return;
      const insert = `${item.externalId} `;
      const newContent =
        content.slice(0, mentionRange.start) + insert + content.slice(mentionRange.end);
      setContent(newContent);
      setMentionOpen(false);
      setMentionRange(null);

      const cursorPos = mentionRange.start + insert.length;

      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.selectionStart = cursorPos;
        el.selectionEnd = cursorPos;
      });
    },
    [content, mentionRange]
  );

  const handleTitleChange = (value: string) => {
    setTitle(value);
    markDirty(value, content);
    setAwaitingProceed(false);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setContent(value);
    markDirty(title, value);
    setAwaitingProceed(false);
    setProcessMessage(null);
    updateMentionMenu(value, cursor);

    if (pendingProcessRef.current && sessionId) {
      pendingProcessRef.current = false;
      void processTranscript(sessionId, title, value);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    const lineCount = pasted.split("\n").length;
    if (pasted.trim().length >= 120 || lineCount >= 3) {
      pendingProcessRef.current = true;
    }
  };

  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionOpen || filteredMentionItems.length === 0) {
      if (e.key === "Escape" && mentionOpen) {
        setMentionOpen(false);
        setMentionRange(null);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % filteredMentionItems.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex(
        (i) => (i - 1 + filteredMentionItems.length) % filteredMentionItems.length
      );
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filteredMentionItems[mentionIndex]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setMentionOpen(false);
      setMentionRange(null);
    }
  };

  const handleContentClick = () => {
    const el = textareaRef.current;
    if (!el) return;
    updateMentionMenu(el.value, el.selectionStart ?? el.value.length);
  };

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    initSession();
    loadPriorityItems();
  }, [initSession, loadPriorityItems]);

  useEffect(() => {
    if (!sessionId) return;

    if (matchTimer.current) clearTimeout(matchTimer.current);
    matchTimer.current = setTimeout(() => {
      matchIssues(`${title}\n${content}`);
    }, 800);

    return () => {
      if (matchTimer.current) clearTimeout(matchTimer.current);
    };
  }, [sessionId, title, content, matchIssues]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  const sortedInbox = [...priorityItems].sort((a, b) => a.priority - b.priority);
  const hasNoteContent = Boolean(content.trim());
  const showMatchedSection = hasNoteContent;

  useEffect(() => {
    if (pendingActionCount > 0) setSidebarOpen(true);
  }, [pendingActionCount]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionRange?.query]);

  useEffect(() => {
    if (!mentionOpen || !textareaRef.current || mentionRange === null) return;

    const reposition = () => {
      const el = textareaRef.current;
      if (!el) return;
      const cursor = el.selectionStart ?? mentionRange.end;
      const coords = getCaretCoordinates(el, cursor);
      const menuWidth = 340;
      const left = Math.min(
        Math.max(12, coords.left),
        window.innerWidth - menuWidth - 12
      );
      setMentionPosition({ top: coords.top + coords.height + 6, left });
    };

    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [mentionOpen, mentionRange, content]);

  const startFreshNote = async () => {
    localStorage.removeItem(SESSION_KEY);
    setTitle("");
    setContent("");
    setMatchedIssues([]);
    setPendingActionCount(0);
    setConfirmRefresh((n) => n + 1);
    savedSnapshotRef.current = { title: "", content: "" };
    setIsDirty(false);
    setAwaitingProceed(false);
    setLastSavedAt(null);
    setSessionId(null);
    setLoading(true);
    setSidebarRefreshKey((n) => n + 1);
    await initSession();
  };

  const finishNote = async () => {
    if (!sessionId) return;
    setFinishing(true);
    const ok = await saveNote(sessionId, title, content);
    if (!ok) {
      setFinishing(false);
      return;
    }
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    });
    if (res.ok) {
      localStorage.removeItem(SESSION_KEY);
      setSidebarRefreshKey((n) => n + 1);
      router.push(`/notes/${sessionId}`);
    } else {
      setFinishing(false);
    }
  };

  if (loading) {
    return (
      <div className="notes-page min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <p className="text-muted text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="notes-page min-h-[calc(100vh-3.5rem)]">
      {/* Top bar — Notion-style */}
      <header className="notes-toolbar">
        <div className="notes-toolbar-inner notes-toolbar-inner-wide">
          <nav className="flex items-center gap-2 text-sm text-muted min-w-0">
            <button
              type="button"
              onClick={() => setListSidebarOpen((v) => !v)}
              className="notes-toolbar-btn lg:hidden"
              aria-label="Toggle notes list"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
                <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5.25A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-foreground font-medium truncate">Notes</span>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className="notes-save-indicator"
              data-state={saveState}
              data-dirty={isDirty ? "true" : "false"}
            >
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Saved"}
              {saveState === "idle" && isDirty && "Unsaved changes"}
              {saveState === "idle" && !isDirty && lastSavedAt && (
                <span className="hidden sm:inline">
                  Saved {formatDistanceToNow(lastSavedAt, { addSuffix: true })}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="notes-toolbar-btn hidden lg:inline-flex"
              aria-label="Toggle context panel"
            >
              <GitHubIcon className="w-4 h-4" />
              {(matchedIssues.length > 0 || sortedInbox.length > 0) && (
                <span className="notes-toolbar-badge">
                  {matchedIssues.length || sortedInbox.length}
                </span>
              )}
            </button>
            {pendingActionCount > 0 && (
              <span className="notes-toolbar-badge notes-toolbar-badge-agent hidden sm:inline-flex">
                {pendingActionCount} to approve
              </span>
            )}
            <button
              type="button"
              onClick={() => sessionId && void processTranscript(sessionId, title, content)}
              disabled={analyzing || !content.trim() || !sessionId}
              className="notes-toolbar-btn hidden sm:inline-flex disabled:opacity-40"
              title="Match transcript to priority inbox and queue agent jobs"
            >
              {analyzing ? "Analyzing…" : "Analyze"}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveState === "saving" || (!isDirty && !content.trim())}
              className="notes-toolbar-btn notes-toolbar-btn-save disabled:opacity-40"
              title="Save (⌘S)"
            >
              {saveState === "saving" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={startFreshNote}
              className="notes-toolbar-btn"
            >
              New
            </button>
            <button
              type="button"
              onClick={finishNote}
              disabled={finishing || !content.trim()}
              className="notes-toolbar-btn notes-toolbar-btn-primary disabled:opacity-40"
            >
              {finishing ? "Summarizing…" : "Summarize"}
            </button>
          </div>
        </div>
      </header>

      <div
        className={`notes-shell notes-shell-with-list ${
          listSidebarOpen ? "notes-shell-list-open" : ""
        } ${sidebarOpen ? "notes-shell-with-context" : ""}`}
      >
        {listSidebarOpen && (
          <button
            type="button"
            className="notes-sidebar-backdrop lg:hidden"
            aria-label="Close notes list"
            onClick={() => setListSidebarOpen(false)}
          />
        )}
        <NotesListSidebar
          activeSessionId={sessionId}
          onSelectNote={(item) => {
            setListSidebarOpen(false);
            void handleSelectNote(item);
          }}
          onNewNote={() => {
            setListSidebarOpen(false);
            void startFreshNote();
          }}
          refreshKey={sidebarRefreshKey}
        />

        <div
          className={`notes-layout ${
            sidebarOpen ? "notes-layout-with-aside" : ""
          }`}
        >
        {/* Document column */}
        <main className="notes-document">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            className="notes-title-input"
          />
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onPaste={handlePaste}
            onKeyDown={handleContentKeyDown}
            onClick={handleContentClick}
            onKeyUp={handleContentClick}
            placeholder="Paste a meeting transcript — context and agent jobs appear on the right…"
            className="notes-textarea"
            spellCheck
          />

        </main>

        {sidebarOpen && (
          <aside className="notes-aside">
            <div className="notes-aside-inner">
              <div className="notes-context-header">
                <h2 className="text-sm font-semibold">Context</h2>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  {hasNoteContent
                    ? "Matched from your note and priority inbox"
                    : "Your priority inbox — paste a transcript to match issues"}
                </p>
              </div>

              {showMatchedSection && (
                <section className="notes-context-section">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="notes-context-section-title">From your note</h3>
                    {matching && (
                      <span className="text-xs text-muted animate-pulse">Matching…</span>
                    )}
                  </div>

                  {matchedIssues.length > 0 ? (
                    <div className="space-y-1">
                      {processMessage && (
                        <p className="text-xs text-muted mb-2 leading-relaxed">{processMessage}</p>
                      )}
                      {matchedIssues.map((issue) => (
                        <IssueChip key={issue.id} issue={issue} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted leading-relaxed py-1">
                      {analyzing
                        ? "Matching transcript to your priority inbox…"
                        : "No matches yet — keep writing or click Analyze."}
                    </p>
                  )}
                </section>
              )}

              {sessionId && (
                <NoteConfirmQueue
                  sessionId={sessionId}
                  variant="sidebar"
                  analyzing={analyzing}
                  awaitingProceed={awaitingProceed}
                  queuedJobCount={queuedJobCount}
                  processMessage={processMessage}
                  refreshTrigger={confirmRefresh}
                  onPendingChange={setPendingActionCount}
                  onDismissProceed={() => setAwaitingProceed(false)}
                />
              )}

              <section className="notes-context-section">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="notes-context-section-title">Priority inbox</h3>
                  <Link href="/inbox" className="text-xs text-link hover:underline">
                    View all
                  </Link>
                </div>

                {sortedInbox.length > 0 ? (
                  <div className="space-y-0.5">
                    {sortedInbox.slice(0, 8).map((item) => (
                      <PriorityInboxRow
                        key={item.id}
                        item={item}
                        onInsert={insertIssueRef}
                      />
                    ))}
                    <p className="text-xs text-muted mt-2 leading-relaxed">
                      Click an issue to insert a reference, or type @ in your note.
                    </p>
                  </div>
                ) : (
                  <div className="notes-aside-empty py-2">
                    <p className="text-sm text-muted leading-relaxed">Inbox is clear.</p>
                    <Link href="/inbox" className="text-xs text-link hover:underline mt-2 inline-block">
                      Open inbox
                    </Link>
                  </div>
                )}
              </section>
            </div>
          </aside>
        )}
        </div>
      </div>

      {mentionOpen && (
        <MentionMenu
          items={filteredMentionItems}
          selectedIndex={mentionIndex}
          onSelect={insertMention}
          onHighlight={setMentionIndex}
          position={mentionPosition}
        />
      )}
    </div>
  );
}
