import type { CalendarEvent } from "./types";

/** dayOffset: days from Sat 14 Nov 2026 (timeline axis origin). */
export const CALENDAR: CalendarEvent[] = [
  {
    date: "Sat 14 Nov 2026",
    tickers: "SMMT",
    event: "Ivonescimab BLA decision",
    note: "Binary; OS debate · Fri–Mon window",
    dayOffset: 0,
  },
  {
    date: "Sat 14 Nov 2026",
    tickers: "CYTK",
    event: "MYQORZO sNDA (MAPLE-HCM)",
    note: "Label expansion",
    dayOffset: 0,
  },
  {
    date: "Sat 22 Nov 2026",
    tickers: "CAPR",
    event: "Deramiocel DMD",
    note: "Extended from Aug",
    dayOffset: 8,
  },
  {
    date: "Thu 27 Nov 2026",
    tickers: "BBIO",
    event: "BBP-418 LGMD2I/R9",
    note: "Priority Review",
    dayOffset: 13,
  },
  {
    date: "Fri 30 Nov 2026",
    tickers: "VRTX",
    event: "Povetacicept IgAN",
    note: "Accelerated approval path",
    dayOffset: 16,
  },
  {
    date: "YE 2026",
    tickers: "MRNA / MRK",
    event: "Intismeran BLA filing target",
    note: "Filing ≠ approval",
    dayOffset: 47,
  },
  {
    date: "Q1 2027",
    tickers: "AZN",
    event: "Tozorakimab COPD FDA decision",
    note: "Priority review",
    dayOffset: 90,
  },
];
