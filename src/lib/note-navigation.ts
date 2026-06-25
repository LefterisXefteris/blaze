import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { NoteListItem } from "@/components/notes-list-sidebar";

export function navigateToNote(router: AppRouterInstance, item: NoteListItem) {
  if (item.hasSummary || item.status === "ENDED") {
    router.push(`/notes/${item.id}`);
    return;
  }

  if (item.sourceType !== "MANUAL") {
    router.push(`/sessions/${item.id}`);
    return;
  }

  router.push("/notes");
}
