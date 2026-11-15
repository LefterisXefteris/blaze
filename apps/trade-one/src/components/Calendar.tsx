import { CALENDAR } from "../data/calendar";

const AXIS_MAX = 90;

export function Calendar() {
  const offsetCounts = new Map<number, number>();

  return (
    <section className="section" id="calendar" aria-labelledby="cal-title">
      <p className="section-label">Near-term calendar</p>
      <h2 className="section-title" id="cal-title">
        Dates on the axis.
      </h2>
      <p className="section-desc">
        PDUFA / company targets plotted from 14 Nov 2026. Weekend goals often
        resolve Fri or Mon.
      </p>

      <div className="cal-chart" aria-label="Catalyst timeline chart">
        <div className="cal-axis-labels">
          <span>14 Nov</span>
          <span>22 Nov</span>
          <span>30 Nov</span>
          <span>YE</span>
          <span>Q1’27</span>
        </div>
        <div className="cal-axis">
          <div className="cal-axis-line" />
          {CALENDAR.map((row) => {
            const stack = offsetCounts.get(row.dayOffset) ?? 0;
            offsetCounts.set(row.dayOffset, stack + 1);
            const left = Math.min(
              96,
              Math.max(2, (row.dayOffset / AXIS_MAX) * 100 + stack * 3.2),
            );
            return (
              <div
                key={`${row.tickers}-${row.date}-${row.event}`}
                className="cal-marker"
                style={{ left: `${left}%` }}
                title={`${row.tickers}: ${row.event}`}
              >
                <span className="cal-marker-stem" />
                <span className="cal-marker-dot" />
                <span className="cal-marker-tag">
                  {row.tickers.split(" / ")[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="cal-list">
        {CALENDAR.map((row) => (
          <div key={`${row.tickers}-${row.date}`} className="cal-row">
            <div className="cal-date">{row.date}</div>
            <div className="cal-event">
              <strong>{row.tickers}</strong>
              {row.event}
              <span className="cal-note">{row.note}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
