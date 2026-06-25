import Link from "next/link";
import { BlazeLogo } from "@/components/blaze-logo";

const features = [
  {
    title: "Live meeting capture",
    description:
      "Granola-style notes while Slack huddles and channels unfold — structured in real time, not after the fact.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden>
        <path
          d="M4 8.5V18a1 1 0 001 1h14a1 1 0 001-1V8.5M8 5h8l1 3H7l1-3z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 12h6M9 15h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Agentic actions",
    description:
      "Calendar holds, follow-ups, and task updates run automatically when confidence is high — you stay in flow.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden>
        <path
          d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Human-in-the-loop",
    description:
      "High-risk intents land in a confirm queue. Nothing ships without your explicit approval.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden>
        <path
          d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M9 12l2 2 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "GitHub-aware notes",
    description:
      "Paste a transcript and Blaze links related PRs and issues — then suggests follow-ups.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden>
        <path
          d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Focused notepad",
    description:
      "A clean writing surface for transcripts and scratch notes — summaries and actions when you need them.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M20 20l-3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Recipes & automation",
    description:
      "Define repeatable workflows — Blaze learns your patterns and executes them on every session.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden>
        <path
          d="M4 6h16M4 12h10M4 18h14"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="18" cy="12" r="2" fill="currentColor" />
      </svg>
    ),
  },
];

const steps = [
  {
    num: "01",
    title: "Capture",
    body: "Connect Slack and start a session — huddles auto-open, messages stream in live.",
  },
  {
    num: "02",
    title: "Understand",
    body: "Blaze extracts intents, decisions, and owners into structured notes as you talk.",
  },
  {
    num: "03",
    title: "Act",
    body: "Low-risk actions execute instantly. High-risk ones wait in your confirm queue.",
  },
];

const integrations = ["Slack", "GitHub", "Google Calendar"];

function ProductPreview() {
  return (
    <div className="landing-preview relative mx-auto max-w-lg w-full">
      <div className="landing-preview-glow" aria-hidden />
      <div className="vscode-frame">
        <div className="vscode-activity-bar" aria-hidden>
          <svg className="vscode-activity-icon vscode-activity-icon-active" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 5h6v14H3V5zm8 0h10v3H11V5zm0 5h10v3H11v-3zm0 5h10v4H11v-4z" />
          </svg>
          <svg className="vscode-activity-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <svg className="vscode-activity-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 3v12M18 9v12M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="vscode-main">
          <div className="vscode-tab-bar">
            <div className="vscode-tab vscode-tab-active">
              <span className="text-blaze-orange">JS</span>
              main.js
            </div>
          </div>
          <div className="vscode-editor">
            <div className="vscode-line">
              <span className="vscode-line-num">1</span>
              <span className="vscode-line-code">
                <span className="syntax-cmt">{"// Blaze agent — auto-act on intents"}</span>
              </span>
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">2</span>
              <span className="vscode-line-code">
                <span className="syntax-kw">const</span> <span className="syntax-fn">btn</span> <span className="syntax-op">=</span> <span className="syntax-fn">document</span><span className="syntax-op">.</span><span className="syntax-fn">getElementById</span><span className="syntax-op">(</span><span className="syntax-str">&apos;capture&apos;</span><span className="syntax-op">);</span>
              </span>
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">3</span>
              <span className="vscode-line-code">
                <span className="syntax-kw">let</span> <span className="syntax-fn">count</span> <span className="syntax-op">=</span> <span className="syntax-num">0</span><span className="syntax-op">;</span>
              </span>
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">4</span>
              <span className="vscode-line-code" />
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">5</span>
              <span className="vscode-line-code">
                <span className="syntax-kw">function</span> <span className="syntax-fn">render</span><span className="syntax-op">() {"{"}</span>
              </span>
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">6</span>
              <span className="vscode-line-code">
                {"  "}<span className="syntax-fn">btn</span><span className="syntax-op">.</span><span className="syntax-fn">textContent</span> <span className="syntax-op">=</span> <span className="syntax-str">&quot;Captured $&#123;count&#125;&quot;</span><span className="syntax-op">;</span>
              </span>
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">7</span>
              <span className="vscode-line-code">
                <span className="syntax-op">{"}"}</span>
              </span>
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">8</span>
              <span className="vscode-line-code" />
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">9</span>
              <span className="vscode-line-code">
                <span className="syntax-fn">btn</span><span className="syntax-op">.</span><span className="syntax-fn">addEventListener</span><span className="syntax-op">(</span><span className="syntax-str">&apos;click&apos;</span><span className="syntax-op">, () =&gt; {"{"}</span>
              </span>
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">10</span>
              <span className="vscode-line-code">
                {"  "}<span className="syntax-kw">if</span> <span className="syntax-op">(</span><span className="syntax-fn">count</span> <span className="syntax-op">&lt;</span> <span className="syntax-num">10</span><span className="syntax-op">) count++;</span>
              </span>
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">11</span>
              <span className="vscode-line-code">
                {"  "}<span className="syntax-fn">render</span><span className="syntax-op">();</span>
              </span>
            </div>
            <div className="vscode-line">
              <span className="vscode-line-num">12</span>
              <span className="vscode-line-code">
                <span className="syntax-op">{"});"}</span>
              </span>
            </div>
          </div>
          <div className="vscode-status-bar">
            <span>main.js</span>
            <span>JavaScript</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="landing-page min-h-screen">
      <header className="landing-nav fixed top-0 inset-x-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BlazeLogo size={44} href="/" />
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="landing-nav-link">
              Features
            </a>
            <a href="#how-it-works" className="landing-nav-link">
              How it works
            </a>
            <a href="#integrations" className="landing-nav-link">
              Integrations
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="landing-nav-link hidden sm:inline">
              Sign in
            </Link>
            <Link href="/login" className="landing-cta-sm">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-hero relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
        <div className="landing-orb landing-orb-1" aria-hidden />
        <div className="landing-orb landing-orb-2" aria-hidden />
        <div className="landing-grid-bg" aria-hidden />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="landing-fade-up">
              <div className="landing-badge mb-6">
                <span className="landing-badge-dot" />
                Agentic AI · Built for 2026
              </div>
              <h1 className="landing-headline">
                Conversations that{" "}
                <span className="landing-gradient-text">ignite action</span>
              </h1>
              <p className="landing-subhead mt-6 max-w-lg">
                Blaze captures meetings in real time, understands intent, and
                executes — calendar holds, follow-ups, triage — with human
                oversight where it counts.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mt-10">
                <Link href="/login" className="landing-cta-primary">
                  Start for free
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Link>
                <a href="#how-it-works" className="landing-cta-secondary">
                  See how it works
                </a>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-10 text-sm text-white/40">
                {integrations.map((name) => (
                  <span key={name} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-blaze-orange/60" />
                    {name}
                  </span>
                ))}
              </div>
            </div>

            <div className="landing-fade-up landing-fade-up-delay hidden sm:block">
              <ProductPreview />
            </div>
          </div>
        </div>
      </section>

      <section id="integrations" className="landing-strip py-6 border-y border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-sm text-white/35 tracking-wide">
            Connects with the tools your team already uses
          </p>
        </div>
      </section>

      <section id="features" className="landing-features py-24 sm:py-32">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="landing-section-label">Capabilities</p>
            <h2 className="landing-section-title mt-3">
              An agent that works while you talk
            </h2>
            <p className="landing-section-desc mt-4">
              From live capture to autonomous execution — every layer designed
              for teams who move fast and think clearly.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature) => (
              <article key={feature.title} className="landing-feature-card">
                <div className="landing-feature-icon">{feature.icon}</div>
                <h3 className="text-base font-semibold mt-4">{feature.title}</h3>
                <p className="text-sm text-muted mt-2 leading-relaxed">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="landing-how py-24 sm:py-32">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="landing-section-label landing-section-label-dark">
              Workflow
            </p>
            <h2 className="landing-section-title landing-section-title-dark mt-3">
              Three steps. Zero friction.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-6">
            {steps.map((step, i) => (
              <div key={step.num} className="landing-step relative">
                {i < steps.length - 1 && (
                  <div
                    className="landing-step-connector hidden md:block"
                    aria-hidden
                  />
                )}
                <span className="landing-step-num">{step.num}</span>
                <h3 className="text-lg font-semibold text-white mt-4">
                  {step.title}
                </h3>
                <p className="text-sm text-white/50 mt-2 leading-relaxed">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-final-cta py-24 sm:py-32">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="landing-cta-panel text-center">
            <BlazeLogo size={56} linked={false} className="mx-auto mb-6" />
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Ready to put your meetings on{" "}
              <span className="page-heading-accent">fire</span>?
            </h2>
            <p className="text-muted mt-3 max-w-md mx-auto">
              Sign in with Google, connect Slack, and capture your first
              session in minutes.
            </p>
            <Link href="/login" className="landing-cta-primary inline-flex mt-8">
              Get started free
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer py-8 border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BlazeLogo size={32} href="/" />
            <span className="text-sm text-muted">
              Agentic AI note-taking
            </span>
          </div>
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} Blaze. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
