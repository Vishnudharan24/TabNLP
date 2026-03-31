from __future__ import annotations

from typing import Any

from db.db_store import list_relationships


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

    # Minimal working strategy: connect each non-base table directly to base
    # with the first matching one-to-many relationship.
    joins = []
    used = set()
    for table in referenced_tables:
        if table == base_table:
            continue

        candidate = None
        for rel in relationships:
            a = rel.get("from_table")
            b = rel.get("to_table")
            if (a == base_table and b == table) or (a == table and b == base_table):
                candidate = rel
                break

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


async def resolve_relationships(normalized_query: dict, data_model: dict, document: dict) -> dict[str, Any]:
    model_rels = data_model.get("relationships") or []
    db_rels = await list_relationships(limit=2000)

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
