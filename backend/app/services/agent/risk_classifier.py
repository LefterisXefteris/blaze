from typing import Any

from app.types import DEFAULT_RISK_BY_INTENT

NEVER_AUTO_PATTERNS = [
    r"fire\s+(him|her|them)",
    r"terminate",
    r"lawsuit",
    r"confidential",
    r"password",
    r"delete\s+all",
]

import re


def classify_risk(intent: dict[str, Any]) -> str:
    text = f"{intent.get('title', '')} {intent.get('description', '')}".lower()

    for pattern in NEVER_AUTO_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return "high"

    if float(intent.get("confidence", 0)) < 0.6:
        return "high"

    return intent.get("risk") or DEFAULT_RISK_BY_INTENT.get(intent.get("type", ""), "high")
