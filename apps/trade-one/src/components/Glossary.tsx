import { useState } from "react";
import { GLOSSARY } from "../data/glossary";

export function Glossary() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="section" id="glossary" aria-labelledby="gloss-title">
      <p className="section-label">Glossary peek</p>
      <h2 className="section-title" id="gloss-title">
        Speak the tape.
      </h2>
      <p className="section-desc">
        Click a term for a little more. Full tutorial lives alongside this app.
      </p>
      <div className="glossary-grid">
        {GLOSSARY.map((g, i) => (
          <button
            key={g.term}
            type="button"
            className="gloss-item"
            aria-expanded={openIndex === i}
            onClick={() => setOpenIndex((cur) => (cur === i ? null : i))}
          >
            <div className="gloss-term">{g.term}</div>
            <div className="gloss-def">{g.short}</div>
            <div className="gloss-more">{g.more}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
