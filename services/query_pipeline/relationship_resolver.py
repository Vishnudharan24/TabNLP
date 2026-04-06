from __future__ import annotations

import asyncio
import os
import time
from typing import Any

from db.db_store import list_relationships

_REL_CACHE_TTL_SECONDS = max(1, int(os.getenv("QUERY_RELATIONSHIP_CACHE_TTL_SECONDS", "30")))
_REL_CACHE_STATE: dict[str, Any] = {
    "expires_at": 0.0,
    "items": [],
}
_REL_CACHE_LOCK = asyncio.Lock()


def _dedupe_relationships(items: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for rel in items:
        key = (
            rel.get("from_table"),
            rel.get("from_column"),
            rel.get("to_table"),
            rel.get("to_column"),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(rel)
    return out


def _referenced_tables(query: dict, default_table: str) -> set[str]:
    tables = {default_table}

    for dim in query.get("dimensions") or []:
        if dim.get("table"):
            tables.add(dim["table"])

    for m in query.get("measures") or []:
        if m.get("table"):
            tables.add(m["table"])

    for f in query.get("filters") or []:
        if f.get("table"):
            tables.add(f["table"])

    return {t for t in tables if t}


def _build_join_plan(referenced_tables: set[str], base_table: str, relationships: list[dict]) -> list[dict]:
    if len(referenced_tables) <= 1:
        return []

    rel_index: dict[tuple[str, str], list[dict]] = {}
    for rel in relationships:
        a = rel.get("from_table")
        b = rel.get("to_table")
        if not a or not b:
            continue
        rel_index.setdefault((a, b), []).append(rel)
        rel_index.setdefault((b, a), []).append(rel)

    # Minimal working strategy: connect each non-base table directly to base
    # with the first matching one-to-many relationship.
    joins = []
    used = set()
    for table in referenced_tables:
        if table == base_table:
            continue

        linked = rel_index.get((base_table, table)) or []
        candidate = linked[0] if linked else None

        if not candidate:
            continue

        rel_key = (
            candidate.get("from_table"),
            candidate.get("from_column"),
            candidate.get("to_table"),
            candidate.get("to_column"),
        )
        if rel_key in used:
            continue
        used.add(rel_key)
        joins.append(candidate)

    return joins


async def _get_cached_relationships() -> list[dict]:
    now = time.time()
    cached_items = _REL_CACHE_STATE.get("items")
    if now < float(_REL_CACHE_STATE.get("expires_at") or 0.0) and isinstance(cached_items, list):
        return cached_items

    async with _REL_CACHE_LOCK:
        now = time.time()
        cached_items = _REL_CACHE_STATE.get("items")
        if now < float(_REL_CACHE_STATE.get("expires_at") or 0.0) and isinstance(cached_items, list):
            return cached_items

        db_rels = await list_relationships(limit=2000)
        safe_list = db_rels if isinstance(db_rels, list) else []
        _REL_CACHE_STATE["items"] = safe_list
        _REL_CACHE_STATE["expires_at"] = now + _REL_CACHE_TTL_SECONDS
        return safe_list


async def resolve_relationships(normalized_query: dict, data_model: dict, document: dict) -> dict[str, Any]:
    model_rels = data_model.get("relationships") or []
    db_rels = await _get_cached_relationships()

    relationships = _dedupe_relationships([
        *(model_rels if isinstance(model_rels, list) else []),
        *(db_rels if isinstance(db_rels, list) else []),
        *((normalized_query.get("joins") or []) if isinstance(normalized_query.get("joins") or [], list) else []),
    ])

    base_table = (
        (data_model.get("tables") or [{}])[0].get("name")
        or document.get("source_key")
        or "dataset"
    )

    referenced_tables = _referenced_tables(normalized_query, base_table)
    join_plan = _build_join_plan(referenced_tables, base_table, relationships)

    return {
        "baseTable": base_table,
        "referencedTables": sorted(referenced_tables),
        "relationships": relationships,
        "joins": join_plan,
    }
