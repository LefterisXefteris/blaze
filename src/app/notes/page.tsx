import dynamic from "next/dynamic";
import { NotesEditorSkeleton } from "@/components/ui/skeletons";

const NotesEditor = dynamic(
  () =>
    import("@/components/notes-editor").then((m) => ({ default: m.NotesEditor })),
  { loading: () => <NotesEditorSkeleton /> }
);

export default function NotesPage() {
  return <NotesEditor />;
}
