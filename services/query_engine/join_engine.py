from __future__ import annotations


def apply_joins(base_rows: list[dict], joins: list[dict] | None = None) -> list[dict]:
    """
    Placeholder for future multi-table support.

    Current implementation is intentionally passthrough to keep
    existing single-dataset behavior stable.
    """
    _ = joins
    return base_rows
