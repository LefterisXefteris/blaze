import { useEffect, useState } from "react";

const TABS = [
  { id: "feed", href: "#feed", label: "Feed" },
  { id: "calendar", href: "#calendar", label: "Calendar" },
  { id: "glossary", href: "#glossary", label: "Glossary" },
] as const;

export function MobileNav() {
  const [active, setActive] = useState("feed");

  useEffect(() => {
    const sections = TABS.map((t) => document.getElementById(t.id)).filter(
      Boolean,
    ) as HTMLElement[];

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.35, 0.6] },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="mobile-nav" aria-label="App sections">
      {TABS.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className={`mobile-nav-tab${active === tab.id ? " active" : ""}`}
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
