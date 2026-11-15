import { TAPE } from "../data/charts";
import { Sparkline } from "./Sparkline";

export function TapeStrip() {
  return (
    <div className="tape-strip" aria-label="Mock tape — sample prices">
      <span className="tape-label">SAMPLE TAPE</span>
      <div className="tape-track">
        {TAPE.map((s) => {
          const up = s.changePct >= 0;
          return (
            <div key={s.ticker} className="tape-item">
              <span className="tape-ticker">{s.ticker}</span>
              <span className="tape-last">{s.last.toFixed(2)}</span>
              <span className={`tape-chg ${up ? "up" : "down"}`}>
                {up ? "+" : ""}
                {s.changePct.toFixed(2)}%
              </span>
              <Sparkline
                values={s.closes.slice(-16)}
                width={72}
                height={22}
                positive={up}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
