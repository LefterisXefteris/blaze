import type { Intent } from "@/lib/types";
import { DEFAULT_RISK_BY_INTENT } from "@/lib/types";

const NEVER_AUTO_PATTERNS = [
  /fire\s+(him|her|them)/i,
  /terminate/i,
  /lawsuit/i,
  /confidential/i,
  /password/i,
  /delete\s+all/i,
];

export function classifyRisk(intent: Intent): "low" | "high" {
  const text = `${intent.title} ${intent.description ?? ""}`.toLowerCase();

  for (const pattern of NEVER_AUTO_PATTERNS) {
    if (pattern.test(text)) {
      return "high";
    }
  }

  if (intent.confidence < 0.6) {
    return "high";
  }

  return intent.risk ?? DEFAULT_RISK_BY_INTENT[intent.type];
}
