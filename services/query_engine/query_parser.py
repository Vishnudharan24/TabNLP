from __future__ import annotations

import hashlib
import json
import time
from typing import Any

from db.db_store import get_dataset_for_query
from models.data_model import build_data_model
from services.query_engine.filter_engine import apply_filters
from services.query_engine.join_engine import apply_joins
from services.query_engine.aggregation_engine import (
    aggregate_rows,
    build_hierarchy,
    build_org_tree,
    validate_measures,
)

_QUERY_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_TTL_SECONDS = 45


def _canonical_query_payload(query: dict) -> str:
    return json.dumps(query, sort_keys=True, separators=(",", ":"), default=str)


def _make_cache_key(query: dict) -> str:
    payload = _canonical_query_payload(query)
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
    cache_key = _make_cache_key(query)
    cached = _cache_get(cache_key)
    if cached is not None:
        return {
            **cached,
            "cache": {"hit": True, "key": cache_key},
        }

    dataset_id = query.get("datasetId")
    if not dataset_id:
        raise ValueError("datasetId is required")

    document = await get_dataset_for_query(dataset_id)
    if not document:
        raise ValueError(f"Dataset not found for datasetId='{dataset_id}'")

    rows = document.get("data") or []
    rows = [r for r in rows if isinstance(r, dict)]

    data_model = build_data_model(document)
    column_semantic_types = {
        col["name"]: col.get("semantic_type", "categorical")
        for table in data_model.get("tables", [])
        for col in table.get("columns", [])
    }

    joins = query.get("joins") or []
    filtered = apply_filters(rows, query.get("filters") or [])
    joined = apply_joins(filtered, joins)

    mode = str(query.get("mode") or "aggregate").lower()

    if mode == "raw":
        selected_fields = [f for f in (query.get("fields") or []) if f]
        if selected_fields:
            result_rows = [{k: row.get(k) for k in selected_fields} for row in joined]
        else:
            result_rows = joined

        limit = query.get("limit")
        if isinstance(limit, int) and limit > 0:
            result_rows = result_rows[:limit]

        payload = {
            "status": "success",
            "rows": result_rows,
            "rowCount": len(result_rows),
            "sourceRowCount": len(rows),
            "filteredRowCount": len(joined),
            "dataModel": data_model,
        }
        _cache_set(cache_key, payload)
        return {
            **payload,
            "cache": {"hit": False, "key": cache_key},
        }

    if mode == "hierarchy":
        hierarchy_fields = [f for f in (query.get("hierarchy") or []) if f]
        value_field = query.get("valueField") or "__count__"
        aggregation = query.get("valueAggregation") or "COUNT"

        if value_field != "__count__":
            validate_measures(
                [{"field": value_field, "aggregation": aggregation}],
                column_semantic_types,
            )

        hierarchy = build_hierarchy(
            rows=joined,
            hierarchy_fields=hierarchy_fields,
            value_field=value_field,
            aggregation=aggregation,
        )
        payload = {
            "status": "success",
            "rows": [{"__hierarchy": hierarchy}],
            "rowCount": 1,
            "sourceRowCount": len(rows),
            "filteredRowCount": len(joined),
            "dataModel": data_model,
        }
        _cache_set(cache_key, payload)
        return {
            **payload,
            "cache": {"hit": False, "key": cache_key},
        }

    if mode == "org_tree":
        node_field = query.get("nodeField")
        parent_field = query.get("parentField")
        label_field = query.get("labelField")
        color_field = query.get("colorField")

        if not node_field or not parent_field:
            raise ValueError("org_tree mode requires nodeField and parentField")

        org_tree, org_meta = build_org_tree(
            rows=joined,
            node_field=node_field,
            parent_field=parent_field,
            label_field=label_field,
            color_field=color_field,
        )
        payload = {
            "status": "success",
            "rows": [{"__orgTree": org_tree, "__orgMeta": org_meta}],
            "rowCount": 1,
            "sourceRowCount": len(rows),
            "filteredRowCount": len(joined),
            "dataModel": data_model,
        }
        _cache_set(cache_key, payload)
        return {
            **payload,
            "cache": {"hit": False, "key": cache_key},
        }

    dimensions = [d for d in (query.get("dimensions") or []) if d]
    measures = query.get("measures") or []
    if not measures:
        measures = [{"field": "__count__", "aggregation": "COUNT", "alias": "Count"}]

    normalized_measures = []
    for m in measures:
        field = m.get("field") or "__count__"
        aggregation = str(m.get("aggregation") or "COUNT").upper()
        alias = m.get("alias") or ("Count" if field == "__count__" else field)
        normalized_measures.append(
            {
                "field": field,
                "aggregation": aggregation,
                "alias": alias,
            }
        )

    validate_measures(normalized_measures, column_semantic_types)

    aggregated = aggregate_rows(
        rows=joined,
        dimensions=dimensions,
        measures=normalized_measures,
        sort_by=query.get("sortBy"),
        sort_order=query.get("sortOrder") or "desc",
        limit=query.get("limit"),
    )

    payload = {
        "status": "success",
        "rows": aggregated,
        "rowCount": len(aggregated),
        "sourceRowCount": len(rows),
        "filteredRowCount": len(joined),
        "dataModel": data_model,
    }
    _cache_set(cache_key, payload)

    return {
        **payload,
        "cache": {"hit": False, "key": cache_key},
    }
