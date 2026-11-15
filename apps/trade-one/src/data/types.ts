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
}

export interface GlossaryTerm {
  term: string;
  short: string;
  more: string;
}
