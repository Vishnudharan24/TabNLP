from __future__ import annotations

from typing import Any


def build_filter_context(normalized_query: dict, relationship_plan: dict) -> dict[str, Any]:
    return {
        "filters": normalized_query.get("filters") or [],
        "dimensions": normalized_query.get("dimensions") or [],
        "relationships": relationship_plan.get("relationships") or [],
        "joins": relationship_plan.get("joins") or [],
        "referencedTables": relationship_plan.get("referencedTables") or [],
    }
