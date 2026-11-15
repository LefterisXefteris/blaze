import type { OhlcBar } from "../data/types";

interface MiniCandlesProps {
  bars: OhlcBar[];
  width?: number;
  height?: number;
}

export function MiniCandles({ bars, width = 280, height = 88 }: MiniCandlesProps) {
  if (!bars.length) return null;

  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = max - min || 1;
  const padY = 4;
  const slot = width / bars.length;
  const bodyW = Math.max(2, slot * 0.45);

  const y = (v: number) =>
    padY + ((max - v) / range) * (height - padY * 2);

  return (
    <svg
      className="mini-candles"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((b, i) => {
        const cx = i * slot + slot / 2;
        const up = b.c >= b.o;
        const color = up ? "var(--accent)" : "var(--danger)";
        const top = y(Math.max(b.o, b.c));
        const bot = y(Math.min(b.o, b.c));
        const bodyH = Math.max(1, bot - top);
        return (
          <g key={i}>
            <line
              x1={cx}
              x2={cx}
              y1={y(b.h)}
              y2={y(b.l)}
              stroke={color}
              strokeWidth="1"
              opacity="0.85"
            />
            <rect
              x={cx - bodyW / 2}
              y={top}
              width={bodyW}
              height={bodyH}
              fill={color}
              opacity="0.9"
            />
          </g>
        );
      })}
    </svg>
  );
}
