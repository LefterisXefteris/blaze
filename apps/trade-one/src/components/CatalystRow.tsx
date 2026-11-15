import type { KeyboardEvent } from "react";
import type { Catalyst } from "../data/types";

interface CatalystRowProps {
  catalyst: Catalyst;
  open: boolean;
  onToggle: () => void;
}

export function CatalystRow({ catalyst, open, onToggle }: CatalystRowProps) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <article
      className={`catalyst${open ? " open" : ""}`}
      role="listitem"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={onKeyDown}
    >
      <div className="catalyst-body">
        <div className="catalyst-top">
          <div className="tickers">
            {catalyst.tickers.map((t) => (
              <span key={t} className="ticker">
                {t}
              </span>
            ))}
          </div>
          <span
            className={`tag ${catalyst.status === "confirmed" ? "tag-confirmed" : "tag-rumor"}`}
          >
            {catalyst.status === "confirmed" ? "Confirmed" : "Rumor"}
          </span>
          <span className="tag tag-type">{catalyst.typeLabel}</span>
          {catalyst.types.includes("dilution") && (
            <span className="tag tag-dilution">Dilution risk</span>
          )}
        </div>
        <h3 className="catalyst-title">{catalyst.title}</h3>
        <p className="catalyst-why">{catalyst.why}</p>
        <p className="expand-hint">Click for why traders care · speculation</p>
      </div>
      <time className="catalyst-date">{catalyst.date}</time>
      <div className="catalyst-detail">
        <div className="catalyst-detail-inner">
          <div className="detail-block">
            <div className="detail-label">Why traders care</div>
            <p>{catalyst.detail}</p>
          </div>
          <div className="detail-block">
            <div className="detail-label">Speculation angle</div>
            <p>{catalyst.speculation}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
