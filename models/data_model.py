from __future__ import annotations

from datetime import datetime
from typing import Any


def _looks_like_id(name: str) -> bool:
    lowered = (name or "").strip().lower()
    return any(
        token in lowered
        for token in ("_id", " id", "id_", "identifier", "uuid", "code", "sku", "key")
    ) or lowered == "id"


def _is_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    if not isinstance(value, str):
        return False
    text = value.strip()
    if not text:
        return False
    cleaned = (
        text.replace(",", "")
        .replace("$", "")
        .replace("€", "")
        .replace("£", "")
        .replace("₹", "")
        .replace("%", "")
    )
    try:
        float(cleaned)
        return True
    except Exception:
        return False


def _is_datetime(value: Any) -> bool:
    if isinstance(value, datetime):
        return True
    if not isinstance(value, str):
        return False
    text = value.strip()
    if not text:
        return False
    # avoid misclassifying pure numerics as date
    if _is_number(text):
        return False
    try:
        datetime.fromisoformat(text.replace("Z", "+00:00"))
        return True
    except Exception:
        return False


def infer_column_semantic_type(name: str, declared_type: str | None, values: list[Any]) -> str:
    sample = [v for v in values if v is not None and str(v).strip() != ""][:500]
    if not sample:
        return "categorical"

    unique_ratio = len({str(v) for v in sample}) / max(1, len(sample))
    number_ratio = sum(1 for v in sample if _is_number(v)) / max(1, len(sample))
    date_ratio = sum(1 for v in sample if _is_datetime(v)) / max(1, len(sample))

    declared = (declared_type or "").lower().strip()

    if _looks_like_id(name) or unique_ratio >= 0.98:
        return "id"

    if declared in {"number", "numeric", "int", "float"} or number_ratio >= 0.9:
        return "numeric"

    if declared in {"date", "datetime", "timestamp"} or date_ratio >= 0.9:
        return "date"

    return "categorical"


def build_data_model(document: dict) -> dict:
    metadata = (document or {}).get("metadata") or {}
    rows = (document or {}).get("data") or []
    columns = list(metadata.get("columns") or [])

    inferred = {}
    for col in columns:
        values = [row.get(col) for row in rows if isinstance(row, dict)]
        declared_type = (metadata.get("column_types") or {}).get(col)
        inferred[col] = infer_column_semantic_type(col, declared_type, values)

    numeric_measures = [col for col, sem in inferred.items() if sem == "numeric"]

    table_name = (
        document.get("source_key")
        or document.get("source_id")
        or metadata.get("source_id")
        or "dataset"
    )

    return {
        "tables": [
            {
                "name": table_name,
                "columns": [
                    {
                        "name": col,
                        "declared_type": (metadata.get("column_types") or {}).get(col, "string"),
                        "semantic_type": inferred.get(col, "categorical"),
                    }
                    for col in columns
                ],
            }
        ],
        "relationships": metadata.get("relationships") or [],
        "measures": [
            {
                "name": f"sum_{field}",
                "field": field,
                "aggregation": "SUM",
            }
            for field in numeric_measures
        ],
    }
