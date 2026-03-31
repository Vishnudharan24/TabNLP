from __future__ import annotations

from typing import Any

from services.measure_engine.expression_parser import (
    parse_expression,
    canonical_agg_signature,
)


def _to_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text.replace(",", ""))
    except Exception:
        return None


def _eval_ast(node: dict[str, Any], row_values: dict[str, Any], cache: dict[str, float | None]) -> float | None:
    if not node:
        return None

    node_type = node.get("type")

    if node_type == "number":
        return _to_number(node.get("value"))

    if node_type == "agg":
        signature = canonical_agg_signature(node.get("func"), node.get("field"), node.get("table"))
        if signature in cache:
            return cache[signature]
        value = _to_number(row_values.get(signature))
        cache[signature] = value
        return value

    if node_type == "unary":
        operand = _eval_ast(node.get("operand"), row_values, cache)
        if operand is None:
            return None
        if node.get("operator") == "-":
            return -operand
        return operand

    if node_type == "binary":
        left = _eval_ast(node.get("left"), row_values, cache)
        right = _eval_ast(node.get("right"), row_values, cache)
        op = node.get("operator")

        if left is None or right is None:
            return None

        if op == "+":
            return left + right
        if op == "-":
            return left - right
        if op == "*":
            return left * right
        if op == "/":
            if right == 0:
                return None
            return left / right

        return None

    return None


def _sort_rows(rows: list[dict], sort_field: str, order: str):
    reverse = str(order or "desc").lower() != "asc"
    rows.sort(
        key=lambda r: (r.get(sort_field) is None, r.get(sort_field) if r.get(sort_field) is not None else 0),
        reverse=reverse,
    )


def evaluate_measures(execution_result: dict, normalized_query: dict) -> dict:
    plan = execution_result.get("measurePlan") or []
    row_objects = execution_result.get("aggregatedRowObjects")

    if not plan or not isinstance(row_objects, list):
        return execution_result

    dimension_fields = execution_result.get("dimensionFields") or []
    final_measure_names = [m.get("name") for m in plan if m.get("name")]
    computed_measures = [m.get("name") for m in plan if m.get("type") == "expression" and m.get("name")]

    ast_cache: dict[str, dict[str, Any] | None] = {}
    final_rows: list[dict] = []

    for row in row_objects:
        row_out = {dim: row.get(dim) for dim in dimension_fields}
        value_cache: dict[str, float | None] = {}

        for measure in plan:
            m_name = measure.get("name")
            if not m_name:
                continue

            m_type = measure.get("type")
            if m_type == "simple":
                signature = measure.get("primaryAggregation")
                row_out[m_name] = _to_number(row.get(signature)) if signature else None
                continue

            expression = measure.get("expression") or ""
            ast = ast_cache.get(expression)
            if expression not in ast_cache:
                try:
                    ast = parse_expression(expression)
                except Exception:
                    ast = None
                ast_cache[expression] = ast

            if not ast:
                row_out[m_name] = None
                continue

            row_out[m_name] = _eval_ast(ast, row, value_cache)

        final_rows.append(row_out)

    sort = normalized_query.get("sort") or {}
    sort_field = sort.get("field")
    if sort_field and (sort_field in dimension_fields or sort_field in final_measure_names):
        _sort_rows(final_rows, sort_field, sort.get("order") or "desc")

    limit = normalized_query.get("limit")
    if isinstance(limit, int) and limit > 0:
        final_rows = final_rows[:limit]

    columns = [*dimension_fields, *final_measure_names]
    rows_matrix = [[row.get(col) for col in columns] for row in final_rows]

    types_map = dict(execution_result.get("types") or {})
    for name in final_measure_names:
        types_map[name] = "number"

    return {
        **execution_result,
        "columns": columns,
        "rows": rows_matrix,
        "measureFields": final_measure_names,
        "computedMeasures": computed_measures,
    "types": types_map,
    }
