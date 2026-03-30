from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from typing import Any
import math


SUPPORTED_CHARTS = {
    "BAR",
    "LINE",
    "AREA",
    "PIE",
    "DONUT",
    "SCATTER",
    "BUBBLE",
    "HEATMAP",
    "TREEMAP",
    "SUNBURST",
    "COMBO_BAR_LINE",
    "GAUGE",
    "SPARKLINE",
    "RADAR",
    "KPI_SINGLE",
    "TABLE",
    "ORG_TREE_STRUCTURED",
}


ROLE_REQUIREMENTS: dict[str, dict[str, Any]] = {
    "BAR": {"required": {"x": "dimension_or_time", "y": "measure"}, "helper": "Bar Chart requires 1 Dimension + 1 Measure"},
    "LINE": {"required": {"x": "time_or_dimension", "y": "measure"}, "helper": "Line Chart requires Time/Dimension + 1 Measure"},
    "AREA": {"required": {"x": "time_or_dimension", "y": "measure"}, "helper": "Area Chart requires Time/Dimension + 1 Measure"},
    "PIE": {"required": {"category": "dimension", "value": "measure_or_count"}, "helper": "Pie Chart requires 1 Category + 1 Value"},
    "DONUT": {"required": {"category": "dimension", "value": "measure_or_count"}, "helper": "Donut Chart requires 1 Category + 1 Value"},
    "SCATTER": {"required": {"x": "measure", "y": "measure"}, "helper": "Scatter Chart requires 2 Measures"},
    "BUBBLE": {"required": {"x": "measure", "y": "measure", "size": "measure"}, "helper": "Bubble Chart requires 3 Measures (X, Y, Size)"},
    "HEATMAP": {"required": {"x": "dimension", "y": "dimension", "value": "measure_or_count"}, "helper": "Heatmap requires 2 Dimensions + 1 Measure"},
    "TREEMAP": {"required": {"hierarchy": "multi_dimension", "value": "measure_or_count"}, "helper": "Treemap requires hierarchy fields + 1 value"},
    "SUNBURST": {"required": {"hierarchy": "multi_dimension", "value": "measure_or_count"}, "helper": "Sunburst requires hierarchy fields + 1 value"},
    "COMBO_BAR_LINE": {"required": {"x": "dimension_or_time", "y1": "measure", "y2": "measure"}, "helper": "Combo requires 1 X field + 2 Measures"},
    "GAUGE": {"required": {"value": "measure_or_count"}, "helper": "Gauge requires a single measure"},
    "SPARKLINE": {"required": {"time": "time", "value": "measure"}, "helper": "Sparkline requires Time + Measure"},
    "RADAR": {"required": {"dimension": "dimension", "values": "multiple_measures"}, "helper": "Radar requires 1 Dimension + multiple Measures"},
    "KPI_SINGLE": {"required": {"value": "measure_or_count"}, "helper": "KPI requires a single measure"},
    "TABLE": {"required": {}, "helper": "Table supports any fields"},
    "ORG_TREE_STRUCTURED": {"required": {"node": "dimension", "parent": "dimension", "label": "dimension_optional"}, "helper": "Org Structured requires Node + Parent"},
}


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def _to_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return float(value)

    text = str(value).strip().replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except Exception:
        return None


def _is_date_like(value: Any) -> bool:
    if value is None or value == "":
        return False
    if isinstance(value, datetime):
        return True
    text = str(value).strip()
    if not text:
        return False

    for fmt in (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            datetime.strptime(text[:19], fmt)
            return True
        except Exception:
            continue

    try:
        datetime.fromisoformat(text.replace("Z", "+00:00"))
        return True
    except Exception:
        return False


def profile_columns(columns: list[dict[str, Any]], data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    safe_columns = columns or []
    rows = data or []
    results: list[dict[str, Any]] = []

    for col in safe_columns:
        name = str(col.get("name") or "").strip()
        if not name:
            continue

        values = [row.get(name) for row in rows if name in row]
        non_null_values = [v for v in values if not _is_blank(v)]
        null_count = len(values) - len(non_null_values)
        unique_count = len({str(v) for v in non_null_values})
        total_non_null = max(1, len(non_null_values))
        unique_ratio = unique_count / total_non_null

        numeric_count = sum(1 for v in non_null_values if _to_number(v) is not None)
        date_count = sum(1 for v in non_null_values if _is_date_like(v))
        numeric_ratio = numeric_count / total_non_null
        date_ratio = date_count / total_non_null

        declared = str(col.get("type") or "").lower()

        if unique_ratio > 0.95 and unique_count > 1:
            field_type = "id"
        elif declared == "number" or numeric_ratio >= 0.9:
            field_type = "measure"
        elif declared in {"date", "datetime"} or date_ratio >= 0.9:
            field_type = "time"
        else:
            field_type = "dimension"

        results.append(
            {
                "column_name": name,
                "type": field_type,
                "unique_count": unique_count,
                "null_count": null_count,
                "sample_values": [str(v) for v in non_null_values[:5]],
                "numeric_ratio": round(numeric_ratio, 4),
                "date_ratio": round(date_ratio, 4),
            }
        )

    return results


def recommend_chart(columns: list[dict[str, Any]], data: list[dict[str, Any]]) -> dict[str, Any]:
    profile = profile_columns(columns, data)
    dims = [c for c in profile if c["type"] == "dimension"]
    measures = [c for c in profile if c["type"] == "measure"]
    times = [c for c in profile if c["type"] == "time"]

    scores: list[dict[str, Any]] = []

    def add(chart: str, score: int, reason: str) -> None:
        scores.append({"chart": chart, "score": score, "reason": reason})

    if len(dims) >= 1 and len(measures) >= 1:
        add("BAR", 90, "1 dimension + 1 measure")
        add("PIE", 75, "category + value")
    if len(times) >= 1 and len(measures) >= 1:
        add("LINE", 95, "time + measure")
        add("AREA", 90, "time + measure trend")
        add("SPARKLINE", 88, "compact trend")
    if len(measures) >= 2:
        add("SCATTER", 85, "2 measures")
    if len(measures) >= 3:
        add("BUBBLE", 83, "3 measures")
    if len(dims) >= 1 and len(measures) >= 2:
        add("RADAR", 75, "1 dimension + many measures")
        add("COMBO_BAR_LINE", 80, "dimension + two measures")
    if len(dims) >= 2 and len(measures) >= 1:
        add("HEATMAP", 78, "2 dimensions + measure")
        add("TREEMAP", 80, "hierarchy candidate")
        add("SUNBURST", 80, "hierarchy candidate")

    if len(measures) >= 1:
        add("KPI_SINGLE", 60, "single KPI")
        add("GAUGE", 60, "single KPI gauge")

    add("TABLE", 50, "always valid")

    ranked = sorted(scores, key=lambda item: item["score"], reverse=True)
    unique_ranked: list[dict[str, Any]] = []
    seen = set()
    for item in ranked:
        chart = item["chart"]
        if chart in seen:
            continue
        seen.add(chart)
        unique_ranked.append(item)

    top = unique_ranked[0]["chart"] if unique_ranked else "TABLE"
    return {
        "profile": profile,
        "recommendations": unique_ranked,
        "top_chart": top,
    }


def _safe_agg_for_field(field_type: str, preferred: str | None) -> str:
    pref = (preferred or "").upper()

    if field_type == "id":
        return "COUNT"

    if field_type == "measure":
        if pref in {"SUM", "AVG", "MIN", "MAX", "COUNT"}:
            return pref
        return "SUM"

    if pref in {"GROUP_BY", "COUNT"}:
        return pref
    return "GROUP_BY"


def generate_chart_config(chart_type: str, columns: list[dict[str, Any]], data: list[dict[str, Any]], selected_fields: dict[str, Any] | None = None) -> dict[str, Any]:
    selected_fields = selected_fields or {}
    normalized_chart = (chart_type or "BAR").upper().strip()
    if normalized_chart not in SUPPORTED_CHARTS:
        normalized_chart = "BAR"

    profile = profile_columns(columns, data)
    by_type: dict[str, list[str]] = defaultdict(list)
    profile_by_name = {item["column_name"]: item for item in profile}
    for item in profile:
        by_type[item["type"]].append(item["column_name"])

    dimensions = by_type["dimension"]
    measures = by_type["measure"]
    times = by_type["time"]

    pick_dimension = selected_fields.get("dimension") or (dimensions[0] if dimensions else (times[0] if times else ""))
    pick_time = selected_fields.get("time") or (times[0] if times else "")
    pick_measure = (selected_fields.get("measures") or [measures[0] if measures else "__count__"])[:]

    assignments: list[dict[str, Any]] = []

    def push(field: str, role: str, preferred_agg: str | None = None) -> None:
        if not field:
            return
        if any(a["field"] == field and a["role"] == role for a in assignments):
            return
        field_type = profile_by_name.get(field, {}).get("type", "dimension")
        aggregation = _safe_agg_for_field(field_type, preferred_agg)
        assignments.append({
            "field": field,
            "role": role,
            "aggregation": aggregation if role in {"x", "y", "value", "size"} else None,
        })

    if normalized_chart in {"BAR", "LINE", "AREA", "SPARKLINE"}:
        x = pick_time if normalized_chart == "SPARKLINE" and pick_time else (pick_time or pick_dimension)
        push(x, "time" if x in times else "x")
        push(pick_measure[0], "y", "SUM")
    elif normalized_chart in {"PIE", "DONUT"}:
        push(pick_dimension, "legend")
        push(pick_measure[0], "value", "COUNT")
    elif normalized_chart == "SCATTER":
        y = pick_measure[1] if len(pick_measure) > 1 else (measures[1] if len(measures) > 1 else pick_measure[0])
        push(pick_measure[0], "x", "AVG")
        push(y, "y", "AVG")
    elif normalized_chart == "BUBBLE":
        y = pick_measure[1] if len(pick_measure) > 1 else (measures[1] if len(measures) > 1 else pick_measure[0])
        size = pick_measure[2] if len(pick_measure) > 2 else (measures[2] if len(measures) > 2 else y)
        push(pick_measure[0], "x", "AVG")
        push(y, "y", "AVG")
        push(size, "size", "SUM")
    elif normalized_chart == "HEATMAP":
        d2 = dimensions[1] if len(dimensions) > 1 else dimensions[0] if dimensions else ""
        push(dimensions[0] if dimensions else pick_dimension, "x")
        push(d2, "y")
        push(pick_measure[0], "value", "SUM")
    elif normalized_chart in {"TREEMAP", "SUNBURST"}:
        for d in dimensions[:3]:
            push(d, "hierarchy")
        push(pick_measure[0], "value", "SUM")
    elif normalized_chart == "COMBO_BAR_LINE":
        m2 = pick_measure[1] if len(pick_measure) > 1 else (measures[1] if len(measures) > 1 else pick_measure[0])
        push(pick_time or pick_dimension, "x")
        push(pick_measure[0], "y", "SUM")
        push(m2, "y", "AVG")
    elif normalized_chart in {"GAUGE", "KPI_SINGLE"}:
        push(pick_measure[0], "value", "SUM")
    elif normalized_chart == "RADAR":
        push(pick_dimension, "legend")
        for m in (pick_measure or measures)[:4]:
            push(m, "y", "AVG")
    elif normalized_chart == "ORG_TREE_STRUCTURED":
        node = dimensions[0] if dimensions else ""
        parent = dimensions[1] if len(dimensions) > 1 else ""
        label = dimensions[2] if len(dimensions) > 2 else node
        push(node, "node")
        push(parent, "parent")
        push(label, "label")
    else:
        # TABLE or fallback
        push(pick_dimension, "x")
        push(pick_measure[0], "y", "SUM")

    return {
        "chart_type": normalized_chart,
        "requirements": ROLE_REQUIREMENTS.get(normalized_chart, ROLE_REQUIREMENTS["BAR"]),
        "profile": profile,
        "assignments": assignments,
    }


def aggregate_for_chart(data: list[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any]:
    rows = data or []
    assignments = config.get("assignments") or []
    sort_order = str(config.get("sort_order") or "desc").lower()
    top_n = int(config.get("top_n") or 0)

    role_map: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in assignments:
        role_map[str(item.get("role") or "")].append(item)

    x_field = (role_map.get("time") or role_map.get("x") or [{"field": "__all__"}])[0].get("field")
    value_assignment = (role_map.get("value") or role_map.get("y") or [{"field": "__count__", "aggregation": "COUNT"}])[0]
    value_field = value_assignment.get("field") or "__count__"
    aggregation = str(value_assignment.get("aggregation") or "COUNT").upper()

    grouped: dict[str, dict[str, Any]] = defaultdict(lambda: {"name": "", "count": 0, "sum": 0.0, "min": math.inf, "max": -math.inf})

    for row in rows:
        key = "All" if x_field == "__all__" else str(row.get(x_field) if row.get(x_field) is not None else "Unknown")
        bucket = grouped[key]
        bucket["name"] = key
        bucket["count"] += 1

        num = _to_number(row.get(value_field)) if value_field != "__count__" else 1.0
        if num is None:
            continue
        bucket["sum"] += num
        bucket["min"] = min(bucket["min"], num)
        bucket["max"] = max(bucket["max"], num)

    output: list[dict[str, Any]] = []
    for bucket in grouped.values():
        if aggregation == "COUNT":
            value = bucket["count"]
        elif aggregation == "AVG":
            value = bucket["sum"] / bucket["count"] if bucket["count"] else 0
        elif aggregation == "MIN":
            value = 0 if bucket["min"] is math.inf else bucket["min"]
        elif aggregation == "MAX":
            value = 0 if bucket["max"] is -math.inf else bucket["max"]
        else:
            value = bucket["sum"]

        output.append({"name": bucket["name"], "value": value})

    output.sort(key=lambda item: item["value"], reverse=(sort_order != "asc"))

    if top_n and len(output) > top_n:
        keep = output[:top_n]
        others = output[top_n:]
        others_value = sum(item["value"] for item in others)
        keep.append({"name": "Others", "value": others_value})
        output = keep

    return {
        "status": "success",
        "rows": output,
        "meta": {
            "x_field": x_field,
            "value_field": value_field,
            "aggregation": aggregation,
            "row_count": len(rows),
        },
    }
