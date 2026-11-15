/** Full-bleed atmospheric chart plane — visual anchor, not a UI card. */
export function HeroChart() {
  return (
    <svg
      className="hero-chart"
      viewBox="0 0 1200 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3dcea8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3dcea8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="heroStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3dcea8" stopOpacity="0.15" />
          <stop offset="45%" stopColor="#3dcea8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#e8b86d" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* soft baseline grid */}
      {[120, 220, 320, 420, 520].map((y) => (
        <line
          key={y}
          x1="40"
          x2="1160"
          y1={y}
          y2={y}
          stroke="rgba(140,168,190,0.08)"
          strokeWidth="1"
        />
      ))}
      <path
        className="hero-chart-area"
        d="M40 480 C 140 470, 180 390, 260 400 S 380 520, 460 480 S 580 300, 680 320 S 820 460, 920 380 S 1040 220, 1160 240 L 1160 640 L 40 640 Z"
        fill="url(#heroFill)"
      />
      <path
        className="hero-chart-line"
        d="M40 480 C 140 470, 180 390, 260 400 S 380 520, 460 480 S 580 300, 680 320 S 820 460, 920 380 S 1040 220, 1160 240"
        fill="none"
        stroke="url(#heroStroke)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* candle stubs as texture */}
      {[
        [180, 360, 420],
        [320, 410, 480],
        [520, 300, 390],
        [740, 280, 360],
        [980, 210, 290],
      ].map(([x, top, bot], i) => (
        <g key={i} className="hero-candle" opacity="0.35">
          <line
            x1={x}
            x2={x}
            y1={top - 24}
            y2={bot + 18}
            stroke="#3dcea8"
            strokeWidth="1"
          />
          <rect
            x={x - 7}
            y={top}
            width="14"
            height={bot - top}
            fill={i % 2 === 0 ? "#3dcea8" : "#e07a7a"}
            opacity="0.55"
          />
        </g>
      ))}
    </svg>
  );
}
