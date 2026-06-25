"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  NotesListSidebar,
  type NoteListItem,
} from "@/components/notes-list-sidebar";
import { navigateToNote } from "@/lib/note-navigation";

type NotesShellProps = {
  activeSessionId: string | null;
  toolbarActions?: ReactNode;
  aside?: ReactNode;
  defaultContextOpen?: boolean;
  contextOpen?: boolean;
  onContextOpenChange?: (open: boolean) => void;
  sidebarRefreshKey?: number;
  onSelectNote?: (item: NoteListItem) => void;
  onNewNote?: () => void;
  onNoteDeleted?: (sessionId: string) => void;
  showContextToggle?: boolean;
  children: ReactNode;
};

export function NotesShell({
  activeSessionId,
  toolbarActions,
  aside,
  defaultContextOpen = true,
  contextOpen: controlledContextOpen,
  onContextOpenChange,
  sidebarRefreshKey = 0,
  onSelectNote: onSelectNoteOverride,
  onNewNote: onNewNoteOverride,
  onNoteDeleted: onNoteDeletedOverride,
  showContextToggle = true,
  children,
}: NotesShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [listSidebarOpen, setListSidebarOpen] = useState(false);
  const [internalContextOpen, setInternalContextOpen] = useState(defaultContextOpen);
  const contextOpen = controlledContextOpen ?? internalContextOpen;

  const setContextOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(contextOpen) : value;
      if (onContextOpenChange) onContextOpenChange(next);
      else setInternalContextOpen(next);
    },
    [contextOpen, onContextOpenChange]
  );

  const handleSelectNote = useCallback(
    (item: NoteListItem) => {
      if (item.id === activeSessionId) return;
      if (onSelectNoteOverride) {
        onSelectNoteOverride(item);
        return;
      }
      navigateToNote(router, item);
    },
    [activeSessionId, router, onSelectNoteOverride]
  );

  const handleNoteDeleted = useCallback(
    (deletedSessionId: string) => {
      onNoteDeletedOverride?.(deletedSessionId);
      if (deletedSessionId === activeSessionId && pathname !== "/notes") {
        router.replace("/notes");
      }
    },
    [activeSessionId, onNoteDeletedOverride, pathname, router]
  );

  return (
    <div className="notes-page min-h-[calc(100vh-3.5rem)]">
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
                <path
                  fillRule="evenodd"
                  d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5.25A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <span className="text-foreground font-medium truncate">Notes</span>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {toolbarActions}
            {aside && showContextToggle && (
              <button
                type="button"
                onClick={() => setContextOpen((v) => !v)}
                className="notes-toolbar-btn hidden lg:inline-flex"
                aria-label="Toggle context panel"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5.25A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.25zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      <div
        className={`notes-shell notes-shell-with-list ${
          listSidebarOpen ? "notes-shell-list-open" : ""
        } ${contextOpen && aside ? "notes-shell-with-context" : ""}`}
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
          activeSessionId={activeSessionId}
          onSelectNote={(item) => {
            setListSidebarOpen(false);
            handleSelectNote(item);
          }}
          onNewNote={() => {
            setListSidebarOpen(false);
            if (onNewNoteOverride) onNewNoteOverride();
            else router.push("/notes");
          }}
          onNoteDeleted={handleNoteDeleted}
          refreshKey={sidebarRefreshKey}
        />

        <div
          className={`notes-layout ${
            contextOpen && aside ? "notes-layout-with-aside" : ""
          }`}
        >
          {children}
          {contextOpen && aside && <aside className="notes-aside">{aside}</aside>}
        </div>
      </div>
    </div>
  );
}
