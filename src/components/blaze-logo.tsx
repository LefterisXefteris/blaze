"use client";

import Link from "next/link";
import { useId } from "react";

type BlazeLogoProps = {
  size?: number;
  linked?: boolean;
  href?: string;
  className?: string;
  badge?: boolean;
  animated?: boolean;
};

export function BlazeLogo({
  size = 40,
  linked = true,
  href = "/",
  className = "",
  badge = false,
  animated = true,
}: BlazeLogoProps) {
  const uid = useId().replace(/:/g, "");
  const motionClass = animated ? "blaze-logo--animated" : "";

  const mark = (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`blaze-logo shrink-0 block ${motionClass}`}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={`${uid}-flame`}
          x1="0"
          y1="60"
          x2="55"
          y2="5"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#8b1a1a" />
          <stop offset="40%" stopColor="#c45c26" />
          <stop offset="100%" stopColor="#f0a84d" />
        </linearGradient>
        <radialGradient
          id={`${uid}-glow`}
          cx="42"
          cy="52"
          r="38"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#e59535" stopOpacity="0.45" />
          <stop offset="65%" stopColor="#c45c26" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#c45c26" stopOpacity="0" />
        </radialGradient>
        <filter
          id={`${uid}-mascot`}
          x="-8%"
          y="-8%"
          width="116%"
          height="116%"
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix
            type="matrix"
            values="
              0.82 0.22 0.06 0 0.06
              0.08 1.12 0.18 0 0.1
              0.04 0.28 0.82 0 0.05
              0    0    0    1 0"
          />
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.05" intercept="0.03" />
            <feFuncG type="linear" slope="1.18" intercept="0.05" />
            <feFuncB type="linear" slope="0.92" intercept="0.02" />
          </feComponentTransfer>
        </filter>
      </defs>

      <ellipse
        className="blaze-logo__glow"
        cx="42"
        cy="54"
        rx="36"
        ry="18"
        fill={`url(#${uid}-glow)`}
      />

      <g className="blaze-logo__flame blaze-logo__flame--back">
        <path
          d="M4 58 C2 48 3 34 8 22 C12 12 20 6 28 10 C32 4 38 6 42 14 C44 8 48 10 50 16 C54 10 58 14 60 22 C62 32 58 44 52 52 C46 58 38 62 28 60 C18 58 10 62 4 58 Z"
          fill={`url(#${uid}-flame)`}
          opacity="0.42"
        />
      </g>

      <g className="blaze-logo__flame blaze-logo__flame--mid">
        <path
          d="M8 56 C6 46 8 34 14 24 C18 16 24 12 30 16 C34 10 38 12 40 18 C42 14 46 16 48 22 C50 30 48 40 42 48 C36 54 28 56 20 54 C14 56 10 58 8 56 Z"
          fill={`url(#${uid}-flame)`}
          opacity="0.28"
        />
      </g>

      <path
        className="blaze-logo__body-glow"
        d="M36 36 L64 30 L70 46 L68 64 L54 70 L38 60 Z"
        fill="#5a8f72"
        opacity="0.42"
      />

      <g className="blaze-logo__mascot" filter={`url(#${uid}-mascot)`}>
        <image
          href="/blaze-logo.png"
          x="0"
          y="0"
          width="100"
          height="100"
          preserveAspectRatio="xMidYMid meet"
        />
      </g>

      <g className="blaze-logo__flame blaze-logo__flame--front">
        <path
          d="M6 52 C4 44 6 36 10 28 C12 22 16 18 20 20 C18 14 22 12 26 16 C24 10 28 8 32 14 C30 8 34 6 38 12 C36 8 40 10 42 16 C44 12 48 16 50 24 C52 32 48 42 40 48 C32 52 22 54 14 52 C10 54 8 54 6 52 Z"
          fill={`url(#${uid}-flame)`}
          opacity="0.16"
        />
      </g>

      <g
        className="blaze-logo__face"
        stroke="#edf5ef"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="46.5" y1="47.5" x2="50.5" y2="45.5" />
        <line x1="52.5" y1="45.5" x2="56.5" y2="43.5" />
        <path d="M48.5 51.5 Q52.5 53.5 57 50.5" />
        <line x1="49.5" y1="54.5" x2="56.5" y2="54.5" />
      </g>

      <circle
        className="blaze-logo__ember blaze-logo__ember--1"
        cx="8"
        cy="38"
        r="2.2"
        fill="#f0a84d"
      />

      <g transform="translate(74, 36)">
        <g className="blaze-logo__blast">
          <rect
            className="blaze-logo__sound blaze-logo__sound--1"
            x="0"
            y="8"
            width="5"
            height="2.2"
            rx="0.6"
            fill="#d4a574"
          />
          <rect
            className="blaze-logo__sound blaze-logo__sound--2"
            x="6"
            y="5"
            width="7"
            height="2.2"
            rx="0.6"
            fill="#e59535"
          />
          <rect
            className="blaze-logo__sound blaze-logo__sound--3"
            x="14"
            y="2"
            width="9"
            height="2.2"
            rx="0.6"
            fill="#f0a84d"
          />
        </g>
      </g>
    </svg>
  );

  const wrapped = badge ? (
    <span className="logo-badge inline-flex">{mark}</span>
  ) : (
    mark
  );

  const classes = `inline-flex items-center ${className}`.trim();

  if (linked) {
    return (
      <Link
        href={href}
        className={`${classes} blaze-logo-link hover:opacity-95 transition-opacity`}
        aria-label="Blaze home"
      >
        {wrapped}
      </Link>
    );
  }

  return <div className={classes}>{wrapped}</div>;
}
