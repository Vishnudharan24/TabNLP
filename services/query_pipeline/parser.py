from __future__ import annotations

from typing import Any

from services.query_pipeline.errors import QueryEngineError


def parse_query(payload: dict[str, Any] | None) -> dict[str, Any]:
    if payload is None:
        raise QueryEngineError("INVALID_QUERY", "Query payload is required")

    if not isinstance(payload, dict):
        raise QueryEngineError("INVALID_QUERY", "Query payload must be an object", {"receivedType": str(type(payload))})

    dataset_id = payload.get("datasetId")
    if not dataset_id or not str(dataset_id).strip():
        raise QueryEngineError("INVALID_QUERY", "datasetId is required")

    return payload
