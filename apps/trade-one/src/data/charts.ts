import type { ChartSeries, OhlcBar } from "./types";

/** Deterministic seeded series — mock tape, not live quotes. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seriesFromSeed(
  seed: string,
  start: number,
  points: number,
  drift: number,
  vol: number,
): number[] {
  let s = hash(seed);
  const out: number[] = [];
  let price = start;
  for (let i = 0; i < points; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const r = (s / 0xffffffff) * 2 - 1;
    price = Math.max(0.5, price * (1 + drift + r * vol));
    out.push(Number(price.toFixed(2)));
  }
  return out;
}

function ohlcFromCloses(closes: number[]): OhlcBar[] {
  const bars: OhlcBar[] = [];
  for (let i = 1; i < closes.length; i++) {
    const o = closes[i - 1];
    const c = closes[i];
    const mid = (o + c) / 2;
    const span = Math.abs(c - o) + mid * 0.012;
    bars.push({
      o,
      c,
      h: Number((Math.max(o, c) + span * 0.55).toFixed(2)),
      l: Number((Math.min(o, c) - span * 0.45).toFixed(2)),
    });
  }
  return bars.slice(-14);
}

function build(
  ticker: string,
  start: number,
  drift: number,
  vol: number,
): ChartSeries {
  const closes = seriesFromSeed(`${ticker}-tape`, start, 28, drift, vol);
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2] ?? last;
  const changePct = Number((((last - prev) / prev) * 100).toFixed(2));
  return {
    ticker,
    last,
    changePct,
    closes,
    ohlc: ohlcFromCloses(closes),
  };
}

/** Primary tape series keyed by catalyst id (lead ticker chart). */
export const CHARTS: Record<string, ChartSeries> = {
  "mrna-mrk": build("MRNA", 48.2, 0.004, 0.028),
  "azn-imfinzi": build("AZN", 82.4, 0.0012, 0.012),
  "azn-rytm": build("RYTM", 98.5, 0.006, 0.035),
  smmt: build("SMMT", 22.1, -0.002, 0.045),
  cytk: build("CYTK", 61.3, 0.0015, 0.022),
  capr: build("CAPR", 14.8, -0.003, 0.055),
  bbio: build("BBIO", 54.6, 0.002, 0.03),
  vrtx: build("VRTX", 428.0, 0.0008, 0.014),
  "azn-toz": build("AZN", 83.1, 0.001, 0.011),
};

export function chartFor(catalystId: string): ChartSeries | undefined {
  return CHARTS[catalystId];
}

/** Tape strip: unique lead tickers for the terminal header. */
export const TAPE: ChartSeries[] = [
  CHARTS["mrna-mrk"],
  CHARTS["azn-imfinzi"],
  CHARTS.smmt,
  CHARTS.cytk,
  CHARTS.capr,
  CHARTS.bbio,
  CHARTS.vrtx,
  CHARTS["azn-rytm"],
];
