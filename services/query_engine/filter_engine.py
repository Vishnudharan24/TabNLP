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


def _match_operator(value: Any, operator: str, expected: Any) -> bool:
    op = (operator or "").upper()
    op = {
        "=": "EQUALS",
        "==": "EQUALS",
        "!=": "NOT_EQUALS",
        "<>": "NOT_EQUALS",
        ">": "GT",
        ">=": "GTE",
        "<": "LT",
        "<=": "LTE",
    }.get(op, op)

    if op == "IS_EMPTY":
        return value is None or str(value).strip() == ""
    if op == "IS_TRUE":
        return bool(value) is True
    if op == "IS_FALSE":
        return bool(value) is False

    if op in {"IN", "NOT_IN"}:
        expected_values = expected if isinstance(expected, list) else [expected]
        expected_set = {str(v).strip().lower() for v in expected_values if v is not None}
        left_text = "" if value is None else str(value).strip().lower()
        if op == "IN":
            return left_text in expected_set if expected_set else True
        return left_text not in expected_set if expected_set else True

    if op in {"BETWEEN", "NOT_BETWEEN"}:
        bounds = expected if isinstance(expected, list) else []
        if len(bounds) < 2:
            return True
        left_num = _to_number(value)
        min_num = _to_number(bounds[0])
        max_num = _to_number(bounds[1])
        if left_num is not None and min_num is not None and max_num is not None:
            in_range = min_num <= left_num <= max_num
            return in_range if op == "BETWEEN" else not in_range

        left_dt = _to_datetime(value)
        min_dt = _to_datetime(bounds[0])
        max_dt = _to_datetime(bounds[1])
        if left_dt is not None and min_dt is not None and max_dt is not None:
            in_range = min_dt <= left_dt <= max_dt
            return in_range if op == "BETWEEN" else not in_range

        left_text = "" if value is None else str(value).lower()
        lower = str(bounds[0]).lower()
        upper = str(bounds[1]).lower()
        in_range = lower <= left_text <= upper
        return in_range if op == "BETWEEN" else not in_range

    left_num = _to_number(value)
    right_num = _to_number(expected)
    if left_num is not None and right_num is not None:
        if op in {"EQUALS", "EQ"}:
            return left_num == right_num
        if op in {"NOT_EQUALS", "NE"}:
            return left_num != right_num
        if op in {"GT", "GREATER_THAN"}:
            return left_num > right_num
        if op in {"GTE", "GREATER_THAN_OR_EQUALS"}:
            return left_num >= right_num
        if op in {"LT", "LESS_THAN"}:
            return left_num < right_num
        if op in {"LTE", "LESS_THAN_OR_EQUALS"}:
            return left_num <= right_num

    left_dt = _to_datetime(value)
    right_dt = _to_datetime(expected)
    if left_dt is not None and right_dt is not None:
        if op in {"EQUALS", "EQ"}:
            return left_dt == right_dt
        if op in {"NOT_EQUALS", "NE"}:
            return left_dt != right_dt
        if op in {"GT", "GREATER_THAN"}:
            return left_dt > right_dt
        if op in {"GTE", "GREATER_THAN_OR_EQUALS"}:
            return left_dt >= right_dt
        if op in {"LT", "LESS_THAN"}:
            return left_dt < right_dt
        if op in {"LTE", "LESS_THAN_OR_EQUALS"}:
            return left_dt <= right_dt

    left_text = "" if value is None else str(value).lower()
    expected_text = "" if expected is None else str(expected).lower()

    if op in {"EQUALS", "EQ"}:
        return left_text == expected_text
    if op in {"NOT_EQUALS", "NE"}:
        return left_text != expected_text
    if op == "CONTAINS":
        return expected_text in left_text
    if op == "STARTS_WITH":
        return left_text.startswith(expected_text)
    if op == "ENDS_WITH":
        return left_text.endswith(expected_text)

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
            value = row.get(field)

            if not _match_operator(
                value=value,
                operator=flt.get("operator"),
                expected=flt.get("value"),
            ):
                keep = False
                break

        if keep:
            out.append(row)

    return out
