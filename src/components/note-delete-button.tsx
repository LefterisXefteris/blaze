"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSession } from "@/lib/api";

type NoteDeleteButtonProps = {
  sessionId: string;
  title?: string | null;
  onDeleted?: () => void;
  redirectTo?: string | null;
  variant?: "toolbar" | "sidebar";
  className?: string;
};

function TrashIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function NoteDeleteButton({
  sessionId,
  title,
  onDeleted,
  redirectTo = "/notes",
  variant = "toolbar",
  className = "",
}: NoteDeleteButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    const displayTitle = title?.trim() || "Untitled";
    const confirmed = window.confirm(
      `Delete "${displayTitle}"? This permanently removes the note and all related messages.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const ok = await deleteSession(sessionId);
      if (!ok) {
        window.alert("Could not delete this note. Try again.");
        return;
      }

      onDeleted?.();
      if (redirectTo) router.replace(redirectTo);
    } finally {
      setDeleting(false);
    }
  };

  if (variant === "sidebar") {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void handleDelete();
        }}
        disabled={deleting}
        className={`notes-sidebar-delete ${className}`.trim()}
        aria-label={`Delete ${title?.trim() || "note"}`}
        title="Delete note"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      disabled={deleting}
      className={`notes-toolbar-btn notes-toolbar-btn-danger ${className}`.trim()}
      title="Delete note"
    >
      <TrashIcon className="w-4 h-4" />
      <span className="hidden sm:inline">{deleting ? "Deleting…" : "Delete"}</span>
    </button>
  );
}
