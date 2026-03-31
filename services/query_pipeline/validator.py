from __future__ import annotations

from services.query_pipeline.errors import QueryEngineError
from services.measure_engine.expression_parser import parse_expression


_ALLOWED_AGG = {"SUM", "AVG", "COUNT", "MIN", "MAX", "GROUP_BY"}


def validate_query(normalized_query: dict, data_model: dict | None = None):
    dataset_id = normalized_query.get("datasetId")
    if not dataset_id:
        raise QueryEngineError("INVALID_QUERY", "datasetId is required")

    dimensions = normalized_query.get("dimensions") or []
    measures = normalized_query.get("measures") or []

    if not dimensions and not measures:
        raise QueryEngineError("INVALID_QUERY", "Query requires at least one dimension or measure")

    for idx, dim in enumerate(dimensions):
        if not dim.get("field"):
            raise QueryEngineError("INVALID_QUERY", f"Dimension at index {idx} is missing field")

    for idx, measure in enumerate(measures):
        measure_type = str(measure.get("type") or "simple").lower()
        agg = str(measure.get("aggregation") or "COUNT").upper()
        if agg not in _ALLOWED_AGG:
            raise QueryEngineError(
                "INVALID_QUERY",
                f"Unsupported aggregation '{agg}'",
                {"index": idx, "allowedAggregations": sorted(_ALLOWED_AGG)},
            )

        if measure_type == "expression":
            expression = measure.get("expression")
            if not expression or not str(expression).strip():
                raise QueryEngineError(
                    "INVALID_QUERY",
                    "Expression measure requires a non-empty expression",
                    {"index": idx, "measure": measure.get("name")},
                )
            try:
                parse_expression(expression)
            except Exception as exc:
                raise QueryEngineError(
                    "INVALID_QUERY",
                    f"Invalid measure expression: {expression}",
                    {"index": idx, "error": str(exc)},
                )

        if measure_type == "simple":
            field = measure.get("field")
            if not field and agg != "COUNT":
                raise QueryEngineError(
                    "INVALID_QUERY",
                    "Simple measure requires field",
                    {"index": idx},
                )

    sort = normalized_query.get("sort") or {}
    order = str(sort.get("order") or "desc").lower()
    if order not in {"asc", "desc"}:
        raise QueryEngineError("INVALID_QUERY", "sort.order must be 'asc' or 'desc'")

    limit = normalized_query.get("limit")
    if limit is not None:
        try:
            limit_value = int(limit)
        except Exception:
            raise QueryEngineError("INVALID_QUERY", "limit must be an integer")
        if limit_value <= 0:
            raise QueryEngineError("INVALID_QUERY", "limit must be greater than 0")
        normalized_query["limit"] = limit_value
