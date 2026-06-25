"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { InlineSpinner } from "@/components/ui/skeletons";
import type { NoteListItem } from "@/components/notes-list-sidebar";
import { navigateToNote } from "@/lib/note-navigation";
import { NotesShell } from "@/components/notes-shell";
import { NoteSourceBadge } from "@/components/note-source-badge";
import { NoteAgentPanel } from "@/components/note-agent-panel";
import { NoteDeleteButton } from "@/components/note-delete-button";

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
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
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
  const lastMatchedTextRef = useRef("");
  const MATCH_MIN_CHARS = 80;
  const MATCH_DEBOUNCE_MS = 1200;

  const markDirty = useCallback((nextTitle: string, nextContent: string) => {
    const snap = savedSnapshotRef.current;
    setIsDirty(nextTitle !== snap.title || nextContent !== snap.content);
  }, []);

  const matchIssues = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      lastMatchedTextRef.current = "";
      setMatchedIssues([]);
      return;
    }
    if (trimmed === lastMatchedTextRef.current) return;
    if (trimmed.length < MATCH_MIN_CHARS) return;

    lastMatchedTextRef.current = trimmed;
    setMatching(true);
    try {
      const res = await fetch("/api/notes/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
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
            setConfirmRefresh((n) => n + 1);
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

      if (
        !item.hasSummary &&
        item.status !== "ENDED" &&
        item.sourceType === "MANUAL"
      ) {
        setLoading(true);
        await loadSessionIntoEditor(item.id);
        setLoading(false);
        return;
      }

      navigateToNote(router, item);
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
        lastMatchedTextRef.current = fullNote.trim();
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

  const handleTitleChange = (value: string) => {
    setTitle(value);
    markDirty(value, content);
    setAwaitingProceed(false);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    markDirty(title, value);
    setAwaitingProceed(false);
    setProcessMessage(null);

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

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    initSession();
  }, [initSession]);

  useEffect(() => {
    if (!sessionId) return;

    const noteText = `${title}\n${content}`.trim();
    if (noteText.length < MATCH_MIN_CHARS) return;

    if (matchTimer.current) clearTimeout(matchTimer.current);
    matchTimer.current = setTimeout(() => {
      void matchIssues(noteText);
    }, MATCH_DEBOUNCE_MS);

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

  const hasNoteContent = Boolean(content.trim());
  const showMatchedSection = hasNoteContent;

  useEffect(() => {
    if (pendingActionCount > 0) setSidebarOpen(true);
  }, [pendingActionCount]);

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

  const handleNoteDeleted = useCallback(
    (deletedSessionId: string) => {
      if (deletedSessionId !== sessionId) return;
      setSidebarRefreshKey((key) => key + 1);
      void startFreshNote();
    },
    [sessionId]
  );

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

  const showAgentPanel =
    pendingActionCount > 0 || analyzing || awaitingProceed;

  return (
    <NotesShell
      activeSessionId={sessionId}
      sidebarRefreshKey={sidebarRefreshKey}
      contextOpen={sidebarOpen}
      onContextOpenChange={setSidebarOpen}
      onSelectNote={(item) => void handleSelectNote(item)}
      onNewNote={() => void startFreshNote()}
      onNoteDeleted={handleNoteDeleted}
      showContextToggle={false}
      aside={
        <div className="notes-aside-inner">
          <div className="notes-context-header">
            <h2 className="text-sm font-semibold">Context</h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              {hasNoteContent
                ? "Issues matched from your note"
                : "Write or paste a transcript to surface related issues"}
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
                    ? "Matching transcript to related issues…"
                    : "No matches yet — keep writing or click Analyze."}
                </p>
              )}
            </section>
          )}
        </div>
      }
      toolbarActions={
        <>
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
            {matchedIssues.length > 0 && (
              <span className="notes-toolbar-badge">{matchedIssues.length}</span>
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
            title="Match transcript to related issues and queue agent jobs"
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
          <button type="button" onClick={startFreshNote} className="notes-toolbar-btn">
            New
          </button>
          {sessionId && (
            <NoteDeleteButton
              sessionId={sessionId}
              title={title}
              redirectTo={null}
              onDeleted={() => {
                setSidebarRefreshKey((key) => key + 1);
                void startFreshNote();
              }}
            />
          )}
          <button
            type="button"
            onClick={finishNote}
            disabled={finishing || !content.trim()}
            className="notes-toolbar-btn notes-toolbar-btn-primary disabled:opacity-40"
          >
            {finishing ? "Summarizing…" : "Summarize"}
          </button>
        </>
      }
    >
      <main className="notes-document">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          className="notes-title-input"
        />
        <NoteSourceBadge
          sourceType="MANUAL"
          date={lastSavedAt ? format(lastSavedAt, "PPP") : undefined}
        />

        {sessionId && showAgentPanel && (
          <NoteAgentPanel
            sessionId={sessionId}
            analyzing={analyzing}
            awaitingProceed={awaitingProceed}
            queuedJobCount={queuedJobCount}
            processMessage={processMessage}
            refreshTrigger={confirmRefresh}
            onPendingChange={setPendingActionCount}
            onDismissProceed={() => setAwaitingProceed(false)}
            variant="hero"
          />
        )}

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onPaste={handlePaste}
          placeholder="Paste a meeting transcript — context and agent jobs appear on the right…"
          className="notes-textarea"
          spellCheck
        />
      </main>
    </NotesShell>
  );
}
