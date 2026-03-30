from __future__ import annotations

from collections import defaultdict
from typing import Any


def _to_number(value: Any):
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    cleaned = (
        text.replace(",", "")
        .replace("$", "")
        .replace("€", "")
        .replace("£", "")
        .replace("₹", "")
        .replace("%", "")
    )
    try:
        return float(cleaned)
    except Exception:
        return None


def _is_additive_aggregation(agg: str) -> bool:
    return agg in {"SUM", "AVG", "MIN", "MAX"}


def validate_measures(measures: list[dict], semantic_types: dict[str, str]):
    for m in measures:
        field = m.get("field")
        agg = str(m.get("aggregation") or "COUNT").upper()
        semantic = semantic_types.get(field, "categorical")

        if field == "__count__":
            continue

        if semantic == "id" and _is_additive_aggregation(agg):
            raise ValueError(f"Invalid aggregation '{agg}' on ID field '{field}'. Use COUNT.")

        if semantic not in {"numeric", "id"} and agg in {"SUM", "AVG", "MIN", "MAX"}:
            raise ValueError(f"Invalid aggregation '{agg}' on non-numeric field '{field}'.")


def aggregate_rows(
    rows: list[dict],
    dimensions: list[str],
    measures: list[dict],
    sort_by: str | None = None,
    sort_order: str = "desc",
    limit: int | None = None,
) -> list[dict]:
    dims = [d for d in (dimensions or []) if d]
    ms = measures or [{"field": "__count__", "aggregation": "COUNT", "alias": "Count"}]

    grouped = {}

    for row in rows:
        key = tuple(str(row.get(dim, "Unknown")) for dim in dims)
        if key not in grouped:
            grouped[key] = {
                "dimensions": {dim: key[idx] for idx, dim in enumerate(dims)},
                "stats": defaultdict(lambda: {"sum": 0.0, "count": 0, "min": None, "max": None}),
            }

        bucket = grouped[key]["stats"]
        for m in ms:
            field = m.get("field")
            alias = m.get("alias") or field
            agg_bucket = bucket[alias]

            if field == "__count__":
                n = 1.0
            else:
                n = _to_number(row.get(field))
                if n is None:
                    continue

            agg_bucket["sum"] += n
            agg_bucket["count"] += 1
            agg_bucket["min"] = n if agg_bucket["min"] is None else min(agg_bucket["min"], n)
            agg_bucket["max"] = n if agg_bucket["max"] is None else max(agg_bucket["max"], n)

    results = []
    for _, payload in grouped.items():
        out = {}

        if dims:
            out["name"] = payload["dimensions"][dims[0]]
            for dim_name, dim_value in payload["dimensions"].items():
                out[dim_name] = dim_value
        else:
            out["name"] = "All"

        for m in ms:
            agg = str(m.get("aggregation") or "COUNT").upper()
            alias = m.get("alias") or m.get("field")
            s = payload["stats"][alias]

            if agg == "AVG":
                out[alias] = (s["sum"] / s["count"]) if s["count"] else 0
            elif agg in {"COUNT", "GROUP_BY"}:
                out[alias] = s["count"]
            elif agg == "MIN":
                out[alias] = s["min"] if s["min"] is not None else 0
            elif agg == "MAX":
                out[alias] = s["max"] if s["max"] is not None else 0
            else:
                out[alias] = s["sum"]

        results.append(out)

    sort_key = sort_by or (ms[0].get("alias") if ms else None)
    reverse = str(sort_order).lower() != "asc"

    if sort_key:
        results.sort(key=lambda r: (r.get(sort_key) is None, r.get(sort_key, 0)), reverse=reverse)

    if isinstance(limit, int) and limit > 0:
        results = results[:limit]

    return results


def build_hierarchy(rows: list[dict], hierarchy_fields: list[str], value_field: str, aggregation: str = "COUNT") -> list[dict]:
    fields = [f for f in (hierarchy_fields or []) if f]
    if not fields:
        return []

    root = {}

    def get_value(row):
        if value_field == "__count__":
            return 1.0
        n = _to_number(row.get(value_field))
        return n if n is not None else 0.0

    for row in rows:
        cursor = root
        for idx, field in enumerate(fields):
            key = str(row.get(field, "Unknown"))
            cursor.setdefault(key, {"__value__": 0.0, "__count__": 0, "__children__": {}})
            cursor[key]["__value__"] += get_value(row)
            cursor[key]["__count__"] += 1
            cursor = cursor[key]["__children__"]

    agg = str(aggregation or "COUNT").upper()

    def to_nodes(tree: dict) -> list[dict]:
        out = []
        for name, payload in tree.items():
            children = to_nodes(payload["__children__"])
            if agg in {"COUNT", "GROUP_BY"}:
                node_value = payload["__count__"]
            else:
                node_value = payload["__value__"]
            out.append(
                {
                    "name": name,
                    "value": node_value,
                    "children": children,
                }
            )
        return out

    return to_nodes(root)


def build_org_tree(rows: list[dict], node_field: str, parent_field: str, label_field: str | None = None, color_field: str | None = None):
    nodes = {}
    children = defaultdict(list)

    for row in rows:
        node_id = str(row.get(node_field, "")).strip()
        if not node_id:
            continue
        parent_id = str(row.get(parent_field, "")).strip() or None
        label = str(row.get(label_field, node_id)).strip() if label_field else node_id
        color_value = str(row.get(color_field, "")).strip() if color_field else ""

        nodes[node_id] = {
            "id": node_id,
            "key": node_id,
            "name": label or node_id,
            "label": label or node_id,
            "colorValue": color_value or None,
            "meta": {
                "nodeValue": node_id,
                "parentValue": parent_id,
                "labelValue": label or None,
                "colorValue": color_value or None,
            },
        }
        children[parent_id].append(node_id)

    def build(node_id: str):
        base = dict(nodes[node_id])
        child_ids = children.get(node_id, [])
        built_children = [build(cid) for cid in child_ids if cid in nodes]
        base["children"] = built_children
        base["directReports"] = len(built_children)
        base["teamSize"] = 1 + sum(int(c.get("teamSize", 1)) for c in built_children)
        return base

    roots = [nid for nid in nodes.keys() if nodes[nid]["meta"].get("parentValue") not in nodes]
    root_nodes = [build(rid) for rid in roots]

    if len(root_nodes) == 1:
        tree = root_nodes[0]
    else:
        tree = {
            "id": "__organization__",
            "key": "__organization__",
            "name": "Organization",
            "label": "Organization",
            "children": root_nodes,
            "directReports": len(root_nodes),
            "teamSize": 1 + sum(int(c.get("teamSize", 1)) for c in root_nodes),
            "meta": {
                "nodeValue": "__organization__",
                "parentValue": None,
                "labelValue": "Organization",
                "colorValue": None,
            },
        }

    meta = {
        "totalNodes": len(nodes),
        "roots": len(root_nodes),
    }
    return tree, meta
