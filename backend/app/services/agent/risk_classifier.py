"""Backward-compatible re-export — use app.policy.rules instead."""

from app.policy.rules import classify_risk

__all__ = ["classify_risk"]
