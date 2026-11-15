import type { KeyboardEvent } from "react";
import type { Catalyst } from "../data/types";
import { chartFor } from "../data/charts";
import { Sparkline } from "./Sparkline";
import { MiniCandles } from "./MiniCandles";

interface CatalystRowProps {
  catalyst: Catalyst;
  open: boolean;
  onToggle: () => void;
}

export function CatalystRow({ catalyst, open, onToggle }: CatalystRowProps) {
  const chart = chartFor(catalyst.id);
  const up = (chart?.changePct ?? 0) >= 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <article
      className={`blotter-row${open ? " open" : ""}`}
      role="listitem"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={onKeyDown}
    >
      <div className="blotter-main">
        <div className="blotter-symbol">
          <span className="blotter-ticker">
            {chart?.ticker ?? catalyst.tickers[0]}
          </span>
          {catalyst.tickers.length > 1 && (
            <span className="blotter-pair">+{catalyst.tickers.slice(1).join(" ")}</span>
          )}
        </div>

        <div className="blotter-quote">
          {chart ? (
            <>
              <span className="blotter-last">{chart.last.toFixed(2)}</span>
              <span className={`blotter-chg ${up ? "up" : "down"}`}>
                {up ? "+" : ""}
                {chart.changePct.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="blotter-chg muted">—</span>
          )}
        </div>

        <div className="blotter-badges">
          <span
            className={`tag ${catalyst.status === "confirmed" ? "tag-confirmed" : "tag-rumor"}`}
          >
            {catalyst.status === "confirmed" ? "Confirmed" : "Rumor"}
          </span>
          <span className="tag tag-type">{catalyst.typeLabel}</span>
          {catalyst.types.includes("dilution") && (
            <span className="tag tag-dilution">Dilution</span>
          )}
        </div>

        <div className="blotter-chart">
          {chart && (
            <Sparkline
              values={chart.closes}
              width={128}
              height={40}
              positive={up}
            />
          )}
        </div>
      </div>

      <div className="blotter-copy">
        <h3 className="catalyst-title">{catalyst.title}</h3>
        <div className="blotter-meta">
          <p className="catalyst-why">{catalyst.why}</p>
          <time className="catalyst-date">{catalyst.date}</time>
        </div>
      </div>

      <div className="catalyst-detail">
        <div className="catalyst-detail-inner">
          {chart && (
            <div className="chart-pane">
              <div className="chart-pane-head">
                <span className="detail-label">Session stub (sample)</span>
                <span className={`blotter-chg ${up ? "up" : "down"}`}>
                  {chart.ticker} {chart.last.toFixed(2)} ({up ? "+" : ""}
                  {chart.changePct.toFixed(2)}%)
                </span>
              </div>
              <MiniCandles bars={chart.ohlc} />
            </div>
          )}
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
