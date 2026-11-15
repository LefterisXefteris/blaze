import { useState } from "react";
import { CATALYSTS } from "../data/catalysts";
import type { FeedFilter } from "../data/types";
import { CatalystRow } from "./CatalystRow";
import { TapeStrip } from "./TapeStrip";

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "fda", label: "FDA / PDUFA" },
  { id: "trial", label: "Trial" },
  { id: "ma", label: "M&A" },
  { id: "dilution", label: "Dilution" },
  { id: "confirmed", label: "Confirmed" },
  { id: "rumor", label: "Rumor" },
];

function matchesFilter(filter: FeedFilter, types: string[], status: string) {
  if (filter === "all") return true;
  if (filter === "confirmed" || filter === "rumor") return status === filter;
  return types.includes(filter);
}

export function Feed() {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = CATALYSTS.filter((c) =>
    matchesFilter(filter, c.types, c.status),
  );

  return (
    <section className="section section-feed" id="feed" aria-labelledby="feed-title">
      <p className="section-label">Blotter · catalyst tape</p>
      <h2 className="section-title" id="feed-title">
        Charts first. Thesis on tap.
      </h2>
      <p className="section-desc">
        Sample prices + sparklines (not live). Tap a row for candles and the
        trader angle.
      </p>

      <TapeStrip />

      <div className="feed-toolbar" role="toolbar" aria-label="Filter catalysts">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`filter-chip${filter === f.id ? " active" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="blotter-head" aria-hidden="true">
        <span>Symbol</span>
        <span>Last / Δ</span>
        <span>Catalyst</span>
        <span>Chart</span>
      </div>

      <div className="feed blotter" role="list">
        {visible.map((c) => (
          <CatalystRow
            key={c.id}
            catalyst={c}
            open={openId === c.id}
            onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
          />
        ))}
      </div>
    </section>
  );
}
