from __future__ import annotations

import asyncio
import atexit
from concurrent.futures import ProcessPoolExecutor
import hashlib
import json
import os
import time
from collections import OrderedDict
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

_QUERY_CACHE: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
_IN_FLIGHT_BY_KEY: dict[str, asyncio.Future] = {}
_CACHE_TTL_SECONDS = int(os.getenv("QUERY_CACHE_TTL_SECONDS", "45"))
_CACHE_MAX_ENTRIES = max(1, int(os.getenv("QUERY_CACHE_MAX_ENTRIES", "256")))
_PROCESS_POOL_ENABLED = str(os.getenv("QUERY_PROCESS_POOL_ENABLED", "false")).strip().lower() in {"1", "true", "yes", "on"}
_PROCESS_POOL_MIN_ROWS = max(1, int(os.getenv("QUERY_PROCESS_POOL_MIN_ROWS", "200000")))
_PROCESS_POOL_WORKERS = max(1, int(os.getenv("QUERY_PROCESS_POOL_WORKERS", str(max(1, (os.cpu_count() or 2) - 1)))))
_PROCESS_POOL_EXECUTOR: ProcessPoolExecutor | None = None
_RUNTIME_STATS = {
    "cacheHits": 0,
    "cacheMisses": 0,
    "inFlightHits": 0,
    "processPoolRuns": 0,
    "singleProcessRuns": 0,
}


def _now_seconds() -> float:
    return time.time()


def _cache_prune_expired(now_seconds: float | None = None):
    now_ts = _now_seconds() if now_seconds is None else now_seconds
    expired_keys = []
    for key, item in _QUERY_CACHE.items():
        if (now_ts - item["created_at"]) > _CACHE_TTL_SECONDS:
            expired_keys.append(key)
    for key in expired_keys:
        _QUERY_CACHE.pop(key, None)


def _canonical_query_payload(query: dict) -> str:
    return json.dumps(query, sort_keys=True, separators=(",", ":"), default=str)


def _make_cache_key(normalized_query: dict, dataset_version: str, owner_user_id: str) -> str:
    payload = _canonical_query_payload({
        "query": normalized_query,
        "dataset_version": dataset_version,
        "owner_user_id": owner_user_id,
    })
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_get(key: str):
    _cache_prune_expired()
    item = _QUERY_CACHE.get(key)
    if not item:
        _RUNTIME_STATS["cacheMisses"] += 1
        return None
    _RUNTIME_STATS["cacheHits"] += 1
    _QUERY_CACHE.move_to_end(key)
    return item["value"]


def _cache_set(key: str, value: dict):
    _cache_prune_expired()
    _QUERY_CACHE[key] = {
        "created_at": _now_seconds(),
        "value": value,
    }
    _QUERY_CACHE.move_to_end(key)

    while len(_QUERY_CACHE) > _CACHE_MAX_ENTRIES:
        _QUERY_CACHE.popitem(last=False)


def _get_process_pool_executor() -> ProcessPoolExecutor | None:
    global _PROCESS_POOL_EXECUTOR
    if not _PROCESS_POOL_ENABLED:
        return None
    if _PROCESS_POOL_EXECUTOR is None:
        _PROCESS_POOL_EXECUTOR = ProcessPoolExecutor(max_workers=_PROCESS_POOL_WORKERS)
    return _PROCESS_POOL_EXECUTOR


def _shutdown_process_pool():
    global _PROCESS_POOL_EXECUTOR
    if _PROCESS_POOL_EXECUTOR is not None:
        _PROCESS_POOL_EXECUTOR.shutdown(wait=False, cancel_futures=True)
        _PROCESS_POOL_EXECUTOR = None


atexit.register(_shutdown_process_pool)


def _execute_query_stage_in_worker(
    document: dict,
    normalized_query: dict,
    relationship_plan: dict,
    filter_context: dict,
    semantic_types: dict,
) -> dict:
    execution_result = execute_aggregation(
        document=document,
        normalized_query=normalized_query,
        relationship_plan=relationship_plan,
        filter_context=filter_context,
        semantic_types=semantic_types,
    )

    return evaluate_measures(execution_result, normalized_query)


def get_query_runtime_stats() -> dict[str, Any]:
    _cache_prune_expired()
    return {
        "cache": {
            "size": len(_QUERY_CACHE),
            "maxEntries": _CACHE_MAX_ENTRIES,
            "ttlSeconds": _CACHE_TTL_SECONDS,
            "hits": int(_RUNTIME_STATS.get("cacheHits") or 0),
            "misses": int(_RUNTIME_STATS.get("cacheMisses") or 0),
            "inFlightHits": int(_RUNTIME_STATS.get("inFlightHits") or 0),
        },
        "processPool": {
            "enabled": _PROCESS_POOL_ENABLED,
            "minRows": _PROCESS_POOL_MIN_ROWS,
            "workers": _PROCESS_POOL_WORKERS,
            "runs": int(_RUNTIME_STATS.get("processPoolRuns") or 0),
        },
        "singleProcess": {
            "runs": int(_RUNTIME_STATS.get("singleProcessRuns") or 0),
        },
        "inFlight": {
            "active": len(_IN_FLIGHT_BY_KEY),
        },
    }


async def run_query(query: dict, owner_user_id: str) -> dict:
    started_at = time.perf_counter()
    stage_timings_ms: dict[str, int] = {}

    def mark_stage(name: str, started: float):
        stage_timings_ms[name] = int((time.perf_counter() - started) * 1000)

    stage_started = time.perf_counter()
    parsed_query = parse_query(query)
    mark_stage("parse", stage_started)

    stage_started = time.perf_counter()
    document = await get_dataset_for_query(parsed_query.get("datasetId"), owner_user_id=owner_user_id)
    mark_stage("datasetFetch", stage_started)
    if not document:
        dataset_id = parsed_query.get("datasetId")
        raise ValueError(f"Dataset not found for datasetId='{dataset_id}'")

    stage_started = time.perf_counter()
    data_model = build_data_model(document)
    mark_stage("dataModelBuild", stage_started)

    stage_started = time.perf_counter()
    normalized_query = normalize_query(parsed_query, data_model)
    mark_stage("normalize", stage_started)

    stage_started = time.perf_counter()
    validate_query(normalized_query, data_model)
    mark_stage("validate", stage_started)

    dataset_version = str(document.get("version") or document.get("ingested_at") or "latest")
    cache_key = _make_cache_key(normalized_query, dataset_version, owner_user_id)
    cached = _cache_get(cache_key)
    if cached is not None:
        execution_ms = int((time.perf_counter() - started_at) * 1000)
        response = dict(cached)
        response.setdefault("meta", {})
        response["meta"]["executionTimeMs"] = execution_ms
        response["meta"]["cacheHit"] = True
        response["meta"]["cacheSource"] = "result-cache"
        response["meta"]["stageTimingsMs"] = {
            **(response["meta"].get("stageTimingsMs") or {}),
            **stage_timings_ms,
            "total": execution_ms,
        }
        return response

    in_flight = _IN_FLIGHT_BY_KEY.get(cache_key)
    if in_flight is not None:
        _RUNTIME_STATS["inFlightHits"] += 1
        shared_response = await in_flight
        execution_ms = int((time.perf_counter() - started_at) * 1000)
        response = dict(shared_response)
        response.setdefault("meta", {})
        response["meta"]["executionTimeMs"] = execution_ms
        response["meta"]["cacheHit"] = True
        response["meta"]["cacheSource"] = "in-flight"
        response["meta"]["stageTimingsMs"] = {
            **(response["meta"].get("stageTimingsMs") or {}),
            **stage_timings_ms,
            "total": execution_ms,
        }
        return response

    loop = asyncio.get_running_loop()
    own_future = loop.create_future()
    _IN_FLIGHT_BY_KEY[cache_key] = own_future

    try:
        stage_started = time.perf_counter()
        relationship_plan = await resolve_relationships(normalized_query, data_model, document)
        mark_stage("relationshipResolve", stage_started)

        stage_started = time.perf_counter()
        filter_context = build_filter_context(normalized_query, relationship_plan)
        mark_stage("filterContext", stage_started)

        stage_started = time.perf_counter()
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
        mark_stage("semanticTypeBuild", stage_started)

        metadata = document.get("metadata") if isinstance(document.get("metadata"), dict) else {}
        source_rows = int(metadata.get("row_count") or 0)
        use_process_pool = _PROCESS_POOL_ENABLED and source_rows >= _PROCESS_POOL_MIN_ROWS

        if use_process_pool:
            stage_started = time.perf_counter()
            executor = _get_process_pool_executor()
            if executor is None:
                use_process_pool = False
            else:
                _RUNTIME_STATS["processPoolRuns"] += 1
                loop = asyncio.get_running_loop()
                execution_result = await loop.run_in_executor(
                    executor,
                    _execute_query_stage_in_worker,
                    document,
                    normalized_query,
                    relationship_plan,
                    filter_context,
                    semantic_types,
                )
                mark_stage("aggregationAndMeasureWorker", stage_started)

        if not use_process_pool:
            _RUNTIME_STATS["singleProcessRuns"] += 1
            stage_started = time.perf_counter()
            execution_result = execute_aggregation(
                document=document,
                normalized_query=normalized_query,
                relationship_plan=relationship_plan,
                filter_context=filter_context,
                semantic_types=semantic_types,
            )
            mark_stage("aggregationExecute", stage_started)

            stage_started = time.perf_counter()
            execution_result = evaluate_measures(execution_result, normalized_query)
            mark_stage("measureEvaluate", stage_started)

        execution_ms = int((time.perf_counter() - started_at) * 1000)
        stage_started = time.perf_counter()
        response = format_response(
            execution_result=execution_result,
            normalized_query=normalized_query,
            execution_time_ms=execution_ms,
            cache_hit=False,
            data_model=data_model,
        )
        mark_stage("responseFormat", stage_started)

        response.setdefault("meta", {})
        response["meta"]["stageTimingsMs"] = {
            **stage_timings_ms,
            "total": execution_ms,
        }
        response["meta"]["processPool"] = {
            "enabled": _PROCESS_POOL_ENABLED,
            "used": bool(use_process_pool),
            "minRows": _PROCESS_POOL_MIN_ROWS,
            "workers": _PROCESS_POOL_WORKERS,
            "sourceRows": source_rows,
        }

        _cache_set(cache_key, response)
        if not own_future.done():
            own_future.set_result(response)
        return response
    except Exception as exc:
        if not own_future.done():
            own_future.set_exception(exc)
        raise
    finally:
        _IN_FLIGHT_BY_KEY.pop(cache_key, None)
