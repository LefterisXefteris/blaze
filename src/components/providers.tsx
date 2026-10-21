"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { NavSkeleton } from "@/components/ui/skeletons";

const Nav = dynamic(() => import("./nav").then((m) => ({ default: m.Nav })), {
  loading: () => <NavSkeleton />,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isMarketing = isHome || pathname === "/login";
  const showNav = !isMarketing;

  return (
    <>
      {showNav && <Nav />}
      {isHome ? (
        children
      ) : (
        <main className={isMarketing ? "min-h-screen" : "flex-1"}>{children}</main>
      )}
    </>
  );
}
