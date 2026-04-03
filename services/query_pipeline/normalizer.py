from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from services.semantic_layer import resolve_query_measure, MeasureResolutionError

EXPR_RE = re.compile(r"\s*(SUM|AVG|COUNT|MIN|MAX)\s*\(\s*([a-zA-Z0-9_\.\*]+)\s*\)\s*", re.IGNORECASE)


def _split_table_field(value: str) -> tuple[str | None, str]:
    text = str(value or "").strip()
    if "." not in text:
        return None, text
    table, field = text.split(".", 1)
    return (table or None), field


def _parse_simple_aggregate_expression(value: Any) -> tuple[str, str, str | None, str] | None:
    text = str(value or "").strip()
    if not text:
        return None

    parsed = EXPR_RE.fullmatch(text)
    if not parsed:
        return None

    agg = parsed.group(1).upper()
    raw = parsed.group(2)
    table, field = _split_table_field(raw)
    return agg, raw, table, field


def _normalize_dimension(d: Any) -> dict[str, Any]:
    if isinstance(d, str):
        table, field = _split_table_field(d)
        return {"field": field, "table": table}

    if isinstance(d, dict):
        raw_field = d.get("field") or ""
        table, field = _split_table_field(raw_field)
        resolved_table = d.get("table") or table
        return {"field": field, "table": resolved_table}

    return {"field": "", "table": None}


def _normalize_measure(m: Any) -> dict[str, Any]:
    if isinstance(m, str):
        parsed_measure = _parse_simple_aggregate_expression(m)
        if parsed_measure:
            agg, raw, table, field = parsed_measure
            name = f"{agg}_{field}" if field != "*" else "Count"
            return {
                "name": name,
                "expression": f"{agg}({raw})",
                "field": "__count__" if field == "*" else field,
                "table": table,
                "aggregation": "COUNT" if field == "*" else agg,
                "type": "simple",
            }
        return {"name": m, "expression": None, "field": m, "table": None, "aggregation": "COUNT", "type": "simple"}

    if not isinstance(m, dict):
        return {"name": "Count", "expression": "COUNT(*)", "field": "__count__", "table": None, "aggregation": "COUNT", "type": "simple"}

    requested_type = str(m.get("type") or "").strip().lower() or None

    expression = m.get("expression")
    if expression and isinstance(expression, str):
        parsed_measure = _parse_simple_aggregate_expression(expression)
        if parsed_measure:
            agg, raw, table, field = parsed_measure
            default_name = m.get("name") or m.get("alias") or ("Count" if field == "*" else f"{agg}_{field}")
            return {
                "name": default_name,
                "expression": expression,
                "field": "__count__" if field == "*" else field,
                "table": m.get("table") or table,
                "aggregation": "COUNT" if field == "*" else agg,
                "type": requested_type or "simple",
            }

        return {
            "name": m.get("name") or m.get("alias") or expression,
            "expression": expression,
            "field": m.get("field"),
            "table": m.get("table"),
            "aggregation": str(m.get("aggregation") or "COUNT").upper(),
            "type": requested_type or "expression",
        }

    field_raw = m.get("field") or "__count__"
    table, field = _split_table_field(field_raw)
    aggregation = str(m.get("aggregation") or "COUNT").upper()
    alias = m.get("name") or m.get("alias") or ("Count" if field == "__count__" else field)
    expression_value = expression or f"{aggregation}({field if field != '__count__' else '*'})"
    return {
        "name": alias,
        "expression": expression_value,
        "field": field,
        "table": m.get("table") or table,
        "aggregation": aggregation,
        "type": requested_type or "simple",
    }


def _normalize_filter(f: Any) -> dict[str, Any] | None:
    if not isinstance(f, dict):
        return None

    raw_field = f.get("field") or f.get("column")
    if not raw_field:
        return None

    table, field = _split_table_field(raw_field)

    # Backward compatibility with old filter shapes.
    filter_type = str(f.get("type") or "").lower().strip()
    if filter_type == "include":
        return {
            "field": field,
            "table": f.get("table") or table,
            "operator": "IN",
            "value": f.get("values") or [],
            "type": f.get("type") or "dimension",
        }

    if filter_type == "range":
        min_v = f.get("min", f.get("rangeMin"))
        max_v = f.get("max", f.get("rangeMax"))
        return {
            "field": field,
            "table": f.get("table") or table,
            "operator": "BETWEEN",
            "value": [min_v, max_v],
            "type": f.get("type") or "dimension",
        }

    if filter_type == "operator":
        return {
            "field": field,
            "table": f.get("table") or table,
            "operator": f.get("operator") or "EQUALS",
            "value": f.get("value"),
            "type": f.get("type") or "dimension",
        }

    return {
        "field": field,
        "table": f.get("table") or table,
        "operator": f.get("operator") or "EQUALS",
        "value": f.get("value"),
        "type": f.get("type") or "dimension",
    }


def normalize_query(parsed: dict[str, Any], data_model: dict[str, Any] | None = None) -> dict[str, Any]:
    dims_payload = parsed.get("dimensions") or []
    if not dims_payload and parsed.get("hierarchy"):
        dims_payload = parsed.get("hierarchy")

    dimensions = [_normalize_dimension(d) for d in dims_payload]
    dimensions = [d for d in dimensions if d.get("field")]

    dataset_id = parsed.get("datasetId")
    measures_payload = parsed.get("measures") or []
    semantic_measures_used: list[str] = []

    # Backward compatibility with old hierarchy payload.
    if not measures_payload and parsed.get("valueField"):
        measures_payload = [{
            "field": parsed.get("valueField"),
            "aggregation": parsed.get("valueAggregation") or "COUNT",
        }]

    # Backward compatibility with old org payload.
    chart_type = parsed.get("chartType")
    mode = str(parsed.get("mode") or "").lower()
    if not chart_type and mode:
        if mode == "hierarchy":
            chart_type = "SUNBURST"
        elif mode == "org_tree":
            chart_type = "ORG_CHART"
        elif mode == "raw":
            chart_type = "TABLE"

    if not dimensions and mode == "org_tree":
        dimensions = [
            _normalize_dimension(parsed.get("nodeField")),
            _normalize_dimension(parsed.get("parentField")),
            _normalize_dimension(parsed.get("labelField")),
            _normalize_dimension(parsed.get("colorField")),
        ]
        dimensions = [d for d in dimensions if d.get("field")]

    resolved_measure_payloads = []
    for raw_measure in measures_payload:
        candidate = raw_measure if isinstance(raw_measure, dict) else {"expression": raw_measure} if isinstance(raw_measure, str) else raw_measure
        if isinstance(candidate, dict):
            try:
                resolved, used_semantic = resolve_query_measure(dataset_id, candidate)
                if used_semantic and resolved.get("name"):
                    semantic_measures_used.append(str(resolved.get("name")))
                    for dep in (resolved.get("_semantic_dependencies") or []):
                        semantic_measures_used.append(str(dep))
                resolved_measure_payloads.append(resolved)
            except MeasureResolutionError as exc:
                raise ValueError(str(exc))
        else:
            resolved_measure_payloads.append(candidate)

    measures = [_normalize_measure(m) for m in resolved_measure_payloads]
    if not measures and (str(chart_type).upper() != "TABLE"):
        measures = [{
            "name": "Count",
            "expression": "COUNT(*)",
            "field": "__count__",
            "table": None,
            "aggregation": "COUNT",
        }]

    filters = [_normalize_filter(f) for f in (parsed.get("filters") or [])]
    filters = [f for f in filters if f]

    sort = parsed.get("sort") or {
        "field": parsed.get("sortBy"),
        "order": parsed.get("sortOrder") or "desc",
    }
    if not sort.get("field"):
        sort["field"] = measures[0]["name"] if measures else (dimensions[0]["field"] if dimensions else "Count")

    request_meta = parsed.get("meta") or {}
    normalized_meta = {
        "requestId": request_meta.get("requestId") or str(uuid.uuid4()),
        "timestamp": request_meta.get("timestamp") or datetime.now(timezone.utc).isoformat(),
    }

    return {
        "datasetId": dataset_id,
        "chartType": str(chart_type or "").upper() or None,
        "dimensions": dimensions,
        "measures": measures,
        "semanticMeasuresUsed": list(dict.fromkeys(semantic_measures_used)),
        "filters": filters,
        "sort": {
            "field": sort.get("field"),
            "order": str(sort.get("order") or "desc").lower(),
        },
        "limit": parsed.get("limit"),
        "joins": parsed.get("joins") or [],
        "meta": normalized_meta,
        "_compat": {
            "mode": mode,
            "fields": parsed.get("fields") or [],
        },
    }
