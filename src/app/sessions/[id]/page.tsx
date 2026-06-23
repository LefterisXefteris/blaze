import dynamic from "next/dynamic";
import { SessionViewSkeleton } from "@/components/ui/skeletons";

const SessionView = dynamic(
  () =>
    import("@/components/session-view").then((m) => ({ default: m.SessionView })),
  { loading: () => <SessionViewSkeleton /> }
);

type PageProps = { params: Promise<{ id: string }> };

export default async function SessionPage({ params }: PageProps) {
  const { id } = await params;
  return <SessionView sessionId={id} />;
}
