import { CALENDAR } from "../data/calendar";

export function Calendar() {
  return (
    <section className="section" id="calendar" aria-labelledby="cal-title">
      <p className="section-label">Near-term calendar</p>
      <h2 className="section-title" id="cal-title">
        Dates worth a watchlist.
      </h2>
      <p className="section-desc">
        FDA PDUFA / company-stated targets. Weekend goal dates often resolve Fri
        or Mon.
      </p>
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
