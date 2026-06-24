const PLACEHOLDER_MARKERS = [
  "change-me-to-a-long-random-string",
  "YOUR_PASSWORD",
  "aws-0-REGION",
];

export function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

export function localSetupIssues(): string[] {
  const issues: string[] = [];
  const db = process.env.DATABASE_URL;
  const jwtSecret = process.env.BLAZE_JWT_SECRET;

  if (looksLikePlaceholder(db)) {
    issues.push(
      "DATABASE_URL is not set — use Docker Postgres: postgresql://lefteris:lefteris@localhost:5432/lefteris_os"
    );
  }

  if (!jwtSecret?.trim()) {
    issues.push("BLAZE_JWT_SECRET is not set");
  } else if (looksLikePlaceholder(jwtSecret)) {
    issues.push("BLAZE_JWT_SECRET looks like a placeholder");
  }

  return issues;
}

export function localSetupHint(): string {
  return "Start Docker, run npm run db:setup once, and set BLAZE_JWT_SECRET in .env to any random string you generate (openssl rand -base64 32).";
}
