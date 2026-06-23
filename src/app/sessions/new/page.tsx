import dynamic from "next/dynamic";
import { FormSkeleton } from "@/components/ui/skeletons";

const NewSessionForm = dynamic(
  () => import("./form").then((m) => ({ default: m.NewSessionForm })),
  { loading: () => <FormSkeleton /> }
);

type PageProps = {
  searchParams: Promise<{ mode?: string }>;
};

export default async function NewSessionPage({ searchParams }: PageProps) {
  const { mode } = await searchParams;
  return <NewSessionForm initialMode={mode} />;
}
