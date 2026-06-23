import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

const LandingPage = dynamic(
  () =>
    import("@/components/landing-page").then((m) => ({ default: m.LandingPage })),
  {
    loading: () => (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block h-8 w-8 rounded-full border-2 border-border border-t-primary animate-spin" />
      </div>
    ),
  }
);

export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/notes");
  }

  return <LandingPage />;
}
