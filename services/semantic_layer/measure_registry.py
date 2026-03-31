from __future__ import annotations

from copy import deepcopy
from typing import Any


# In-memory registry: {dataset_id: {measure_name: {expression: str}}}
_MEASURE_REGISTRY: dict[str, dict[str, dict[str, Any]]] = {}


def _normalize_dataset_id(dataset_id: str) -> str:
    return str(dataset_id or "").strip()


def _normalize_measure_name(name: str) -> str:
    return str(name or "").strip()


def _normalize_expression(expression: str) -> str:
    return str(expression or "").strip()


def set_measure(dataset_id: str, name: str, expression: str) -> dict[str, Any]:
    ds = _normalize_dataset_id(dataset_id)
    measure_name = _normalize_measure_name(name)
    expr = _normalize_expression(expression)

    if not ds:
        raise ValueError("datasetId is required")
    if not measure_name:
        raise ValueError("measure name is required")
    if not expr:
        raise ValueError("measure expression is required")

    bucket = _MEASURE_REGISTRY.setdefault(ds, {})
    bucket[measure_name] = {
        "expression": expr,
    }
    return {
        "name": measure_name,
        "expression": expr,
    }


def get_measure(dataset_id: str, name: str) -> dict[str, Any] | None:
    ds = _normalize_dataset_id(dataset_id)
    measure_name = _normalize_measure_name(name)
    if not ds or not measure_name:
        return None
    return deepcopy((_MEASURE_REGISTRY.get(ds) or {}).get(measure_name))


def list_measures(dataset_id: str) -> dict[str, dict[str, Any]]:
    ds = _normalize_dataset_id(dataset_id)
    if not ds:
        return {}
    return deepcopy(_MEASURE_REGISTRY.get(ds) or {})


def delete_measure(dataset_id: str, name: str) -> bool:
    ds = _normalize_dataset_id(dataset_id)
    measure_name = _normalize_measure_name(name)
    bucket = _MEASURE_REGISTRY.get(ds)
    if not bucket or measure_name not in bucket:
        return False
    del bucket[measure_name]
    if not bucket:
        _MEASURE_REGISTRY.pop(ds, None)
    return True


def preload_default_measures(dataset_id: str, measures: dict[str, dict[str, Any]]) -> None:
    ds = _normalize_dataset_id(dataset_id)
    if not ds:
        return
    bucket = _MEASURE_REGISTRY.setdefault(ds, {})
    for name, payload in (measures or {}).items():
        expression = str((payload or {}).get("expression") or "").strip()
        if not expression:
            continue
        bucket[str(name).strip()] = {"expression": expression}
