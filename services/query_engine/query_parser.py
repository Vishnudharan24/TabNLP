from __future__ import annotations

import hashlib
import json
import time
from typing import Any

from db.db_store import get_dataset_for_query
from models.data_model import build_data_model
from services.query_pipeline import (
    parse_query,
    normalize_query,
    validate_query,
    resolve_relationships,
    build_filter_context,
    execute_aggregation,
    evaluate_measures,
    format_response,
)

_QUERY_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_TTL_SECONDS = 45


def _canonical_query_payload(query: dict) -> str:
    return json.dumps(query, sort_keys=True, separators=(",", ":"), default=str)


def _make_cache_key(normalized_query: dict, dataset_version: str) -> str:
    payload = _canonical_query_payload({
        "query": normalized_query,
        "dataset_version": dataset_version,
    })
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_get(key: str):
    item = _QUERY_CACHE.get(key)
    if not item:
        return None
    if (time.time() - item["created_at"]) > _CACHE_TTL_SECONDS:
        _QUERY_CACHE.pop(key, None)
        return None
    return item["value"]


def _cache_set(key: str, value: dict):
    _QUERY_CACHE[key] = {
        "created_at": time.time(),
        "value": value,
    }


async def run_query(query: dict) -> dict:
    started_at = time.perf_counter()

    parsed_query = parse_query(query)

    document = await get_dataset_for_query(parsed_query.get("datasetId"))
    if not document:
        dataset_id = parsed_query.get("datasetId")
        raise ValueError(f"Dataset not found for datasetId='{dataset_id}'")

    data_model = build_data_model(document)
    normalized_query = normalize_query(parsed_query, data_model)
    validate_query(normalized_query, data_model)

    dataset_version = str(document.get("version") or document.get("ingested_at") or "latest")
    cache_key = _make_cache_key(normalized_query, dataset_version)
    cached = _cache_get(cache_key)
    if cached is not None:
        execution_ms = int((time.perf_counter() - started_at) * 1000)
        response = dict(cached)
        response.setdefault("meta", {})
        response["meta"]["executionTimeMs"] = execution_ms
        response["meta"]["cacheHit"] = True
        return response

    relationship_plan = await resolve_relationships(normalized_query, data_model, document)
    filter_context = build_filter_context(normalized_query, relationship_plan)

    semantic_types = {}
    for table in data_model.get("tables", []):
        table_name = table.get("name")
        for col in table.get("columns", []):
            name = col.get("name")
            semantic = col.get("semantic_type", "categorical")
            if name:
                semantic_types[name] = semantic
                if table_name:
                    semantic_types[f"{table_name}.{name}"] = semantic

    execution_result = execute_aggregation(
        document=document,
        normalized_query=normalized_query,
        relationship_plan=relationship_plan,
        filter_context=filter_context,
        semantic_types=semantic_types,
    )

    execution_result = evaluate_measures(execution_result, normalized_query)

    execution_ms = int((time.perf_counter() - started_at) * 1000)
    response = format_response(
        execution_result=execution_result,
        normalized_query=normalized_query,
        execution_time_ms=execution_ms,
        cache_hit=False,
        data_model=data_model,
    )

    _cache_set(cache_key, response)
    return response
