from __future__ import annotations

from typing import Any


def format_response(
    execution_result: dict,
    normalized_query: dict,
    execution_time_ms: int,
    cache_hit: bool,
    data_model: dict,
) -> dict[str, Any]:
    return {
        "status": "success",
        "columns": execution_result.get("columns") or [],
        "rows": execution_result.get("rows") or [],
        "rowCount": len(execution_result.get("rows") or []),
        "sourceRowCount": execution_result.get("sourceRowCount", 0),
        "filteredRowCount": execution_result.get("filteredRowCount", 0),
        "dataModel": data_model,
        "meta": {
            "requestId": (normalized_query.get("meta") or {}).get("requestId"),
            "timestamp": (normalized_query.get("meta") or {}).get("timestamp"),
            "dimensionFields": execution_result.get("dimensionFields") or [],
            "measureFields": execution_result.get("measureFields") or [],
            "computedMeasures": execution_result.get("computedMeasures") or [],
            "semanticMeasuresUsed": normalized_query.get("semanticMeasuresUsed") or [],
            "types": execution_result.get("types") or {},
            "executionTimeMs": execution_time_ms,
            "cacheHit": cache_hit,
        },
    }
