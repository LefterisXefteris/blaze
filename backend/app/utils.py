import enum
import re
from datetime import date, datetime
from typing import Any

from sqlalchemy.inspection import inspect as sa_inspect

from app.config import get_settings


def app_origin() -> str:
    return get_settings().app_url


def parse_manual_transcript(text: str) -> list[dict[str, str]]:
    lines = [line for line in text.split("\n") if line.strip()]
    messages: list[dict[str, str]] = []

    for line in lines:
        match = re.match(r"^([^:]{1,40}):\s*(.+)$", line)
        if match:
            messages.append({"speaker": match.group(1).strip(), "content": match.group(2).strip()})
        elif messages:
            messages[-1]["content"] += " " + line.strip()
        else:
            messages.append({"speaker": "Unknown", "content": line.strip()})

    return messages


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    return str(value)


def serialize_model(obj: Any, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {}
    mapper = sa_inspect(obj).mapper

    for attr in mapper.column_attrs:
        column_name = attr.columns[0].name
        value = _json_safe(getattr(obj, attr.key))
        data[column_name] = value

    if extra:
        data.update(extra)
    return data
