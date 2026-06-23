import dynamic from "next/dynamic";
import { InboxSkeleton } from "@/components/ui/skeletons";

const InboxClient = dynamic(() => import("./inbox-client"), {
  loading: () => <InboxSkeleton />,
});

export default function InboxPage() {
  return <InboxClient />;
}
