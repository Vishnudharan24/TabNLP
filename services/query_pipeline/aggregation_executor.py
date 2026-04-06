from __future__ import annotations

from collections import defaultdict
from typing import Any

from services.measure_engine.expression_parser import (
    parse_expression,
    collect_aggregations,
    canonical_agg_signature,
)
from services.query_engine.aggregation_engine import (
    aggregate_rows,
    build_hierarchy,
    build_org_tree,
    validate_measures,
)
from services.query_engine.filter_engine import apply_filters


def _table_field_name(field: str) -> tuple[str | None, str]:
    text = str(field or "").strip()
    if "." not in text:
        return None, text
    table, name = text.split(".", 1)
    return (table or None), name


def _project_row(row: dict, allowed_fields: set[str] | None) -> dict:
    if not isinstance(row, dict):
        return {}
    if not allowed_fields:
        return row
    return {field: row.get(field) for field in allowed_fields if field in row}


def _collect_required_fields_by_table(normalized_query: dict, relationship_plan: dict, base_table: str) -> dict[str, set[str]]:
    required: dict[str, set[str]] = defaultdict(set)

    for dim in normalized_query.get("dimensions") or []:
        field = dim.get("field")
        if not field:
            continue
        table = dim.get("table") or base_table
        required[table].add(field)

    for measure in normalized_query.get("measures") or []:
        field = measure.get("field")
        if not field or field == "__count__":
            continue
        table = measure.get("table") or base_table
        if "." in str(field):
            parsed_table, parsed_field = _table_field_name(field)
            required[parsed_table or table].add(parsed_field)
        else:
            required[table].add(field)

    for flt in normalized_query.get("filters") or []:
        field = flt.get("field")
        if not field:
            continue
        table = flt.get("table") or base_table
        required[table].add(field)

    for join in relationship_plan.get("joins") or []:
        from_table = join.get("from_table") or base_table
        to_table = join.get("to_table") or base_table
        from_column = join.get("from_column")
        to_column = join.get("to_column")
        if from_column:
            required[from_table].add(from_column)
        if to_column:
            required[to_table].add(to_column)

    return required


def _extract_table_rows(document: dict, base_table: str, required_fields_by_table: dict[str, set[str]] | None = None) -> dict[str, list[dict]]:
    base_required = (required_fields_by_table or {}).get(base_table)
    tables: dict[str, list[dict]] = {
        base_table: [
            _project_row(r, base_required)
            for r in (document.get("data") or [])
            if isinstance(r, dict)
        ]
    }

    metadata = document.get("metadata") or {}
    explicit = metadata.get("table_data") or document.get("table_data") or {}
    if isinstance(explicit, dict):
        for table_name, rows in explicit.items():
            if isinstance(rows, list):
                allowed_fields = (required_fields_by_table or {}).get(table_name)
                tables[table_name] = [
                    _project_row(r, allowed_fields)
                    for r in rows
                    if isinstance(r, dict)
                ]

    return tables


def _join_rows(rows_by_table: dict[str, list[dict]], base_table: str, joins: list[dict]) -> list[dict]:
    base_rows = rows_by_table.get(base_table) or []
    if not joins:
        return base_rows

    result_rows = base_rows
    index_cache: dict[tuple[str, str], dict[str, list[dict]]] = {}

    for join in joins:
        from_table = join.get("from_table")
        from_column = join.get("from_column")
        to_table = join.get("to_table")
        to_column = join.get("to_column")

        if not (from_table and from_column and to_table and to_column):
            continue

        # make join orientation explicit from current base result to target table
        if from_table != base_table and to_table == base_table:
            from_table, to_table = to_table, from_table
            from_column, to_column = to_column, from_column

        target_rows = rows_by_table.get(to_table) or []
        index_key = (str(to_table), str(to_column))
        index = index_cache.get(index_key)
        if index is None:
            index = defaultdict(list)
            for tr in target_rows:
                index[str(tr.get(to_column))].append(tr)
            index_cache[index_key] = index

        next_rows = []
        for row in result_rows:
            left_value = row.get(from_column)
            if left_value is None:
                left_value = row.get(f"{from_table}.{from_column}")

            matches = index.get(str(left_value)) or []
            if not matches:
                next_rows.append(row)
                continue

            for match in matches:
                merged = dict(row)
                for key, value in match.items():
                    qualified = f"{to_table}.{key}"
                    if qualified not in merged:
                        merged[qualified] = value
                    if key not in merged:
                        merged[key] = value
                next_rows.append(merged)

        result_rows = next_rows

    return result_rows


def _resolved_field_key(row_sample: dict, field: str, table: str | None) -> str:
    if not field:
        return field

    if table:
        qualified = f"{table}.{field}"
        if qualified in row_sample:
            return qualified

    return field


def _normalize_filters_for_rows(filters: list[dict], row_sample: dict) -> list[dict]:
    out = []
    for f in filters:
        field = _resolved_field_key(row_sample, f.get("field"), f.get("table"))
        out.append({
            "field": field,
            "operator": f.get("operator"),
            "value": f.get("value"),
        })
    return out


def _rows_to_matrix(dict_rows: list[dict], columns: list[str]) -> list[list[Any]]:
    return [[row.get(col) for col in columns] for row in dict_rows]


def _split_table_field(value: str) -> tuple[str | None, str]:
    text = str(value or "").strip()
    if "." not in text:
        return None, text
    table, field = text.split(".", 1)
    return (table or None), field


def _build_measure_plan(normalized_measures: list[dict], row_sample: dict) -> tuple[list[dict], list[dict]]:
    plan: list[dict] = []
    aggregation_specs: dict[str, dict] = {}

    def add_aggregation(func: str, field: str, table: str | None = None) -> str:
        func_up = str(func or "COUNT").upper()
        if str(field or "") in {"__count__", "*"}:
            signature = canonical_agg_signature("COUNT", "*", None)
            if signature not in aggregation_specs:
                aggregation_specs[signature] = {
                    "field": "__count__",
                    "aggregation": "COUNT",
                    "alias": signature,
                }
            return signature

        resolved_field = _resolved_field_key(row_sample, field, table)
        table_name = table
        if not table_name and "." in str(field):
            table_name, _ = _split_table_field(field)

        signature = canonical_agg_signature(func_up, field, table_name)
        if signature not in aggregation_specs:
            aggregation_specs[signature] = {
                "field": resolved_field,
                "aggregation": func_up,
                "alias": signature,
            }
        return signature

    for measure in normalized_measures:
        m_type = str(measure.get("type") or "simple").lower()
        m_name = measure.get("name") or measure.get("alias") or "Measure"

        if m_type == "expression":
            expression = str(measure.get("expression") or "").strip()
            try:
                ast = parse_expression(expression)
                agg_nodes = collect_aggregations(ast)
            except Exception:
                ast = None
                agg_nodes = []

            dependencies = []
            for node in agg_nodes:
                signature = add_aggregation(node.get("func"), node.get("field"), node.get("table"))
                dependencies.append(signature)

            plan.append({
                "name": m_name,
                "type": "expression",
                "expression": expression,
                "ast": ast,
                "dependencies": dependencies,
                "primaryAggregation": dependencies[0] if dependencies else None,
            })
            continue

        aggregation = str(measure.get("aggregation") or "COUNT").upper()
        field = measure.get("field") or "__count__"
        table = measure.get("table")
        signature = add_aggregation(aggregation, field, table)

        plan.append({
            "name": m_name,
            "type": "simple",
            "expression": measure.get("expression") or signature,
            "dependencies": [signature],
            "primaryAggregation": signature,
        })

    return plan, list(aggregation_specs.values())


def execute_aggregation(
    document: dict,
    normalized_query: dict,
    relationship_plan: dict,
    filter_context: dict,
    semantic_types: dict[str, str],
) -> dict:
    base_table = relationship_plan.get("baseTable") or "dataset"
    required_fields_by_table = _collect_required_fields_by_table(normalized_query, relationship_plan, base_table)
    rows_by_table = _extract_table_rows(document, base_table, required_fields_by_table=required_fields_by_table)

    joined_rows = _join_rows(rows_by_table, base_table, relationship_plan.get("joins") or [])

    row_sample = joined_rows[0] if joined_rows else {}
    normalized_filters = _normalize_filters_for_rows(filter_context.get("filters") or [], row_sample)
    filtered_rows = apply_filters(joined_rows, normalized_filters)

    dimensions = normalized_query.get("dimensions") or []
    measures = normalized_query.get("measures") or []
    chart_type = str(normalized_query.get("chartType") or "").upper()
    compat = normalized_query.get("_compat") or {}

    dimension_fields = [_resolved_field_key(row_sample, d.get("field"), d.get("table")) for d in dimensions]

    if chart_type == "TABLE" and not measures:
        # old compatibility: allow explicit field list
        fields = compat.get("fields") or dimension_fields
        fields = [f for f in fields if f]
        raw_rows = [{f: row.get(f) for f in fields} for row in filtered_rows]
        limit = normalized_query.get("limit")
        if isinstance(limit, int) and limit > 0:
            raw_rows = raw_rows[:limit]

        return {
            "columns": fields,
            "rows": _rows_to_matrix(raw_rows, fields),
            "dimensionFields": fields,
            "measureFields": [],
            "types": {field: "number" if semantic_types.get(field) == "numeric" else "categorical" for field in fields},
            "sourceRowCount": len(rows_by_table.get(base_table) or []),
            "filteredRowCount": len(filtered_rows),
        }

    normalized_measures = []
    for m in measures:
        field_key = _resolved_field_key(row_sample, m.get("field"), m.get("table"))
        name = m.get("name") or m.get("alias") or field_key or "Count"
        aggregation = str(m.get("aggregation") or "COUNT").upper()
        normalized_measures.append({
            "field": field_key,
            "aggregation": aggregation,
            "alias": name,
            "expression": m.get("expression"),
        })

    if chart_type in {"SUNBURST", "TREEMAP"}:
        hierarchy_measure = normalized_measures[0] if normalized_measures else {
            "field": "__count__",
            "aggregation": "COUNT",
            "alias": "Count",
            "expression": "COUNT(*)",
        }
        if hierarchy_measure["field"] != "__count__":
            validate_measures([hierarchy_measure], semantic_types)

        hierarchy = build_hierarchy(
            rows=filtered_rows,
            hierarchy_fields=dimension_fields,
            value_field=hierarchy_measure["field"],
            aggregation=hierarchy_measure["aggregation"],
        )
        return {
            "columns": ["__hierarchy"],
            "rows": [[hierarchy]],
            "dimensionFields": dimension_fields,
            "measureFields": [hierarchy_measure["alias"]],
            "types": {"__hierarchy": "hierarchy"},
            "sourceRowCount": len(rows_by_table.get(base_table) or []),
            "filteredRowCount": len(filtered_rows),
        }

    if chart_type in {"ORG_CHART", "ORG_TREE_STRUCTURED"}:
        node = dimension_fields[0] if len(dimension_fields) > 0 else None
        parent = dimension_fields[1] if len(dimension_fields) > 1 else None
        label = dimension_fields[2] if len(dimension_fields) > 2 else None
        color = dimension_fields[3] if len(dimension_fields) > 3 else None

        if not node or not parent:
            raise ValueError("Org chart query requires node and parent dimensions")

        tree, tree_meta = build_org_tree(
            rows=filtered_rows,
            node_field=node,
            parent_field=parent,
            label_field=label,
            color_field=color,
        )
        return {
            "columns": ["__orgTree", "__orgMeta"],
            "rows": [[tree, tree_meta]],
            "dimensionFields": dimension_fields,
            "measureFields": [],
            "types": {"__orgTree": "org_tree", "__orgMeta": "object"},
            "sourceRowCount": len(rows_by_table.get(base_table) or []),
            "filteredRowCount": len(filtered_rows),
        }

    if not normalized_measures:
        normalized_measures = [{"field": "__count__", "aggregation": "COUNT", "alias": "Count", "expression": "COUNT(*)"}]

    measure_plan, aggregation_specs = _build_measure_plan(normalized_measures, row_sample)
    validate_measures(aggregation_specs, semantic_types)

    sort = normalized_query.get("sort") or {}
    aggregated_rows = aggregate_rows(
        rows=filtered_rows,
        dimensions=dimension_fields,
        measures=aggregation_specs,
        sort_by=None,
        sort_order=sort.get("order") or "desc",
        limit=normalized_query.get("limit"),
    )

    columns = [*dimension_fields, *[m["alias"] for m in aggregation_specs]]
    types_map = {field: "number" if semantic_types.get(field) == "numeric" else "categorical" for field in dimension_fields}
    for m in aggregation_specs:
        types_map[m["alias"]] = "number"

    return {
        "columns": columns,
        "rows": _rows_to_matrix(aggregated_rows, columns),
        "aggregatedRowObjects": aggregated_rows,
        "measurePlan": measure_plan,
        "dimensionFields": dimension_fields,
        "measureFields": [m["name"] for m in measure_plan],
        "types": types_map,
        "sourceRowCount": len(rows_by_table.get(base_table) or []),
        "filteredRowCount": len(filtered_rows),
    }
