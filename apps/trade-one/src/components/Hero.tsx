export function Hero() {
  return (
    <header className="hero hero-compact" id="top">
      <div className="hero-bg" aria-hidden="true" />
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-orb" aria-hidden="true" />

      <nav className="nav" aria-label="Primary">
        <span className="nav-meta">
          <span className="live-dot" aria-hidden="true" />
          Terminal · research ~14 Nov 2026
        </span>
        <div className="nav-links">
          <a href="#feed">Feed</a>
          <a href="#calendar">Calendar</a>
          <a href="#glossary">Glossary</a>
        </div>
      </nav>

      <div className="hero-body">
        <h1 className="brand">
          Trade <em>one</em>
        </h1>
        <p className="hero-headline">Pharma tape. Catalysts with charts.</p>
        <p className="hero-sub">
          Blotter-style radar of FDA dates, trial hits, and dilution risk —
          price context beside the “why.”
        </p>
        <div className="cta-group">
          <a className="cta-primary" href="#feed">
            Open the blotter
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <a className="cta-ghost" href="#calendar">
            Catalyst timeline
          </a>
        </div>
        <p className="hero-footnote">
          Not financial advice · Sample charts · Seeded 14 Nov 2026
        </p>
      </div>
    </header>
  );
}
