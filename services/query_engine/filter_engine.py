from __future__ import annotations

from datetime import datetime
from typing import Any


def _to_number(value: Any):
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    cleaned = (
        text.replace(",", "")
        .replace("$", "")
        .replace("€", "")
        .replace("£", "")
        .replace("₹", "")
        .replace("%", "")
    )
    try:
        return float(cleaned)
    except Exception:
        return None


def _to_datetime(value: Any):
    if isinstance(value, datetime):
        return value
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception:
        return None


def _match_operator(value: Any, operator: str, expected: Any, expected_secondary: Any = None, column_type: str | None = None) -> bool:
    op = (operator or "").upper()

    if op == "IS_EMPTY":
        return value is None or str(value).strip() == ""
    if op == "IS_TRUE":
        return bool(value) is True
    if op == "IS_FALSE":
        return bool(value) is False

    if column_type in {"number", "numeric"}:
        left = _to_number(value)
        right = _to_number(expected)
        right2 = _to_number(expected_secondary)
        if left is None:
            return False
        if op == "EQUALS":
            return right is not None and left == right
        if op == "GT":
            return right is not None and left > right
        if op == "LT":
            return right is not None and left < right
        if op == "BETWEEN":
            return right is not None and right2 is not None and right <= left <= right2

    if column_type in {"date", "datetime", "timestamp"}:
        left_dt = _to_datetime(value)
        right_dt = _to_datetime(expected)
        right2_dt = _to_datetime(expected_secondary)
        if left_dt is None:
            return False
        if op == "EQUALS":
            return right_dt is not None and left_dt == right_dt
        if op == "GT":
            return right_dt is not None and left_dt > right_dt
        if op == "LT":
            return right_dt is not None and left_dt < right_dt
        if op == "BETWEEN":
            return right_dt is not None and right2_dt is not None and right_dt <= left_dt <= right2_dt

    left_text = "" if value is None else str(value).lower()
    expected_text = "" if expected is None else str(expected).lower()

    if op == "EQUALS":
        return left_text == expected_text
    if op == "CONTAINS":
        return expected_text in left_text
    if op == "STARTS_WITH":
        return left_text.startswith(expected_text)
    if op == "BETWEEN":
        return left_text >= str(expected).lower() and left_text <= str(expected_secondary).lower()

    return True


def apply_filters(rows: list[dict], filters: list[dict] | None) -> list[dict]:
    if not filters:
        return rows

    safe_filters = [f for f in (filters or []) if isinstance(f, dict) and f.get("field")]
    if not safe_filters:
        return rows

    out = []
    for row in rows:
        keep = True
        for flt in safe_filters:
            field = flt.get("field")
            filter_type = (flt.get("type") or "").lower()
            value = row.get(field)

            if filter_type == "include":
                values = [str(v) for v in (flt.get("values") or [])]
                if values and str(value) not in values:
                    keep = False
                    break
                continue

            if filter_type == "range":
                left = _to_number(value)
                min_v = _to_number(flt.get("min"))
                max_v = _to_number(flt.get("max"))
                if left is None:
                    keep = False
                    break
                if min_v is not None and left < min_v:
                    keep = False
                    break
                if max_v is not None and left > max_v:
                    keep = False
                    break
                continue

            if filter_type == "operator":
                if not _match_operator(
                    value=value,
                    operator=flt.get("operator"),
                    expected=flt.get("value"),
                    expected_secondary=flt.get("valueSecondary"),
                    column_type=flt.get("columnType"),
                ):
                    keep = False
                    break
                continue

        if keep:
            out.append(row)

    return out
