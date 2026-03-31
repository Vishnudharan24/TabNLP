from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from services.semantic_layer.measure_registry import list_measures, get_measure


_TOKEN_SPLIT_RE = re.compile(r"[^A-Za-z0-9_\.]+")


@dataclass
class ResolutionResult:
    expression: str
    dependencies: list[str]


class MeasureResolutionError(ValueError):
    pass


def _extract_candidate_names(expression: str) -> set[str]:
    tokens = [t.strip() for t in _TOKEN_SPLIT_RE.split(str(expression or "")) if t.strip()]
    return set(tokens)


def _replace_measure_tokens(expression: str, replacements: dict[str, str]) -> str:
    # Longest-first replacement avoids partial collisions.
    ordered = sorted(replacements.keys(), key=len, reverse=True)
    out = str(expression)

    for name in ordered:
        pattern = re.compile(rf"(?<![A-Za-z0-9_\.]){re.escape(name)}(?![A-Za-z0-9_\.])")
        out = pattern.sub(f"({replacements[name]})", out)

    return out


def _build_dependency_graph(dataset_id: str, measures: dict[str, dict[str, Any]]) -> dict[str, set[str]]:
    names = set(measures.keys())
    graph: dict[str, set[str]] = {}

    for measure_name, payload in measures.items():
        expression = str((payload or {}).get("expression") or "")
        candidates = _extract_candidate_names(expression)
        deps = {c for c in candidates if c in names and c != measure_name}
        graph[measure_name] = deps

    return graph


def _assert_acyclic(graph: dict[str, set[str]]):
    temp = set()
    perm = set()
    stack: list[str] = []

    def visit(node: str):
        if node in perm:
            return
        if node in temp:
            cycle_start = stack.index(node) if node in stack else 0
            cycle_path = stack[cycle_start:] + [node]
            raise MeasureResolutionError(f"Circular measure dependency detected: {' -> '.join(cycle_path)}")

        temp.add(node)
        stack.append(node)
        for dep in graph.get(node, set()):
            visit(dep)
        stack.pop()
        temp.remove(node)
        perm.add(node)

    for n in graph:
        visit(n)


# Cache key: dataset_id + measure_name
_RESOLVED_CACHE: dict[str, ResolutionResult] = {}


def _cache_key(dataset_id: str, measure_name: str) -> str:
    return f"{dataset_id}::{measure_name}"


def clear_dataset_cache(dataset_id: str):
    prefix = f"{dataset_id}::"
    to_remove = [k for k in _RESOLVED_CACHE if k.startswith(prefix)]
    for k in to_remove:
        _RESOLVED_CACHE.pop(k, None)


def resolve_measure_expression(dataset_id: str, measure_name: str) -> ResolutionResult:
    ds = str(dataset_id or "").strip()
    name = str(measure_name or "").strip()
    if not ds or not name:
        raise MeasureResolutionError("datasetId and measure name are required")

    cached = _RESOLVED_CACHE.get(_cache_key(ds, name))
    if cached is not None:
        return cached

    measure = get_measure(ds, name)
    if not measure:
        raise MeasureResolutionError(f"Measure '{name}' not found for dataset '{ds}'")

    all_measures = list_measures(ds)
    graph = _build_dependency_graph(ds, all_measures)
    _assert_acyclic(graph)

    resolved: dict[str, ResolutionResult] = {}

    def resolve_node(node_name: str) -> ResolutionResult:
        if node_name in resolved:
            return resolved[node_name]

        payload = all_measures.get(node_name)
        if not payload:
            raise MeasureResolutionError(f"Measure '{node_name}' not found in registry")

        base_expr = str(payload.get("expression") or "").strip()
        deps = sorted(graph.get(node_name) or [])
        replacement_map: dict[str, str] = {}
        flattened_deps: list[str] = []

        for dep in deps:
            dep_result = resolve_node(dep)
            replacement_map[dep] = dep_result.expression
            flattened_deps.extend(dep_result.dependencies)
            flattened_deps.append(dep)

        expanded_expr = _replace_measure_tokens(base_expr, replacement_map) if replacement_map else base_expr
        unique_deps = list(dict.fromkeys(flattened_deps))

        result = ResolutionResult(expression=expanded_expr, dependencies=unique_deps)
        resolved[node_name] = result
        return result

    final_result = resolve_node(name)
    _RESOLVED_CACHE[_cache_key(ds, name)] = final_result
    return final_result


def resolve_query_measure(dataset_id: str, measure_payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    payload = dict(measure_payload or {})
    measure_name = str(payload.get("name") or "").strip()

    # If direct expression/field provided, do not force semantic resolution.
    if payload.get("expression") or payload.get("field"):
        return payload, False

    if not measure_name:
        return payload, False

    result = resolve_measure_expression(dataset_id, measure_name)
    payload["name"] = measure_name
    payload["expression"] = result.expression
    payload["type"] = "expression"
    payload["_semantic_dependencies"] = result.dependencies
    return payload, True
