export type CatalystStatus = "confirmed" | "rumor";
export type CatalystType = "fda" | "trial" | "ma" | "dilution";
export type FeedFilter = "all" | CatalystType | CatalystStatus;

export interface Catalyst {
  id: string;
  tickers: string[];
  status: CatalystStatus;
  types: CatalystType[];
  typeLabel: string;
  date: string;
  title: string;
  why: string;
  detail: string;
  speculation: string;
}

export interface CalendarEvent {
  date: string;
  tickers: string;
  event: string;
  note: string;
  /** Day offset from 14 Nov 2026 for timeline axis (0 = Sat 14 Nov). */
  dayOffset: number;
}

export interface GlossaryTerm {
  term: string;
  short: string;
  more: string;
}

export interface OhlcBar {
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface ChartSeries {
  ticker: string;
  last: number;
  changePct: number;
  /** Closing prices for sparkline (oldest → newest). */
  closes: number[];
  /** Compact OHLC stub for expanded pane. */
  ohlc: OhlcBar[];
}
