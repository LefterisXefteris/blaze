"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BlazeLogo } from "@/components/blaze-logo";

const links = [
  { href: "/notes", label: "Notes" },
  { href: "/settings", label: "Connections" },
  { href: "/recipes", label: "Recipes" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="nav-header sticky top-0 z-50 relative">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <BlazeLogo size={48} href="/notes" />
          <nav className="hidden sm:flex items-center gap-4">
            {links.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== "/notes" && pathname.startsWith(`${link.href}/`)) ||
                (link.href === "/notes" && pathname.startsWith("/notes"));
              return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${
                  isActive
                    ? "nav-link-active"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
            })}
          </nav>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
