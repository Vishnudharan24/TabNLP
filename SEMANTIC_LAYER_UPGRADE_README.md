# Semantic Layer Upgrade (Measure Catalog System)

## 1) `measure_registry.py`

Implemented at [backend/services/semantic_layer/measure_registry.py](backend/services/semantic_layer/measure_registry.py).

### Capabilities

- Per-dataset measure catalog (multi-dataset ready):
  - `{ datasetId -> { measureName -> { expression } } }`
- In-memory CRUD helpers:
  - `set_measure()`
  - `get_measure()`
  - `list_measures()`
  - `delete_measure()`
- Optional preload helper for defaults.

---

## 2) `measure_resolver.py`

Implemented at [backend/services/semantic_layer/measure_resolver.py](backend/services/semantic_layer/measure_resolver.py).

### Responsibilities

- Resolve measure names to final expressions.
- Recursively expand nested measures.
- Cache resolved expressions by `datasetId + measureName`.

### Example

`Profit Margin` -> `SUM(profit) / SUM(sales)`

---

## 3) Dependency graph logic (DAG + cycle detection)

In [backend/services/semantic_layer/measure_resolver.py](backend/services/semantic_layer/measure_resolver.py):

- Builds dependency graph from measure expressions.
- Validates acyclic graph before resolving.
- Throws explicit error for cycles, e.g.:
  - `A -> B -> A`

---

## 4) Normalizer integration

Integrated in [backend/services/query_pipeline/normalizer.py](backend/services/query_pipeline/normalizer.py).

### New behavior

If query measure is name-only:

```json
{ "name": "Profit Margin" }
```

Normalizer resolves it via semantic layer and converts it to expression measure before aggregation/measure engine stages.

### Mixed measure support

Works with combinations like:

```json
{
  "measures": [
    { "name": "Total Sales" },
    { "name": "Profit Margin" },
    { "expression": "SUM(cost)" }
  ]
}
```

---

## 5) Semantic API endpoints

Implemented in [backend/main.py](backend/main.py):

- `POST /semantic/measures`
- `GET /semantic/measures?datasetId=...`
- `PUT /semantic/measures/{name}`
- `DELETE /semantic/measures/{name}?datasetId=...`

### Notes

- Storage is in-memory for now.
- Semantic resolver cache is invalidated on create/update/delete.

---

## 6) Response metadata update

Added semantic usage info in [backend/services/query_pipeline/response_formatter.py](backend/services/query_pipeline/response_formatter.py):

- `meta.semanticMeasuresUsed`
- existing fields remain unchanged (`columns`, `rows`, `measureFields`, `computedMeasures`, etc.)

---

## 7) Example request -> response flow

### Step A: Create measures

- `Total Sales = SUM(sales)`
- `Total Profit = SUM(profit)`
- `Profit Margin = Total Profit / Total Sales`

### Step B: Query using measure names

```json
{
  "datasetId": "sales_data",
  "dimensions": ["state"],
  "measures": [
    { "name": "Total Sales" },
    { "name": "Profit Margin" }
  ]
}
```

### Pipeline

- parse -> normalize (semantic resolve) -> validate -> resolve relationships -> build filter context -> aggregate -> evaluate measures -> format

### Response (shape)

```json
{
  "columns": ["state", "Total Sales", "Profit Margin"],
  "rows": [["TN", 1200, 0.31]],
  "meta": {
    "measureFields": ["Total Sales", "Profit Margin"],
    "computedMeasures": ["Total Sales", "Profit Margin"],
    "semanticMeasuresUsed": ["Total Sales", "Profit Margin", "Total Profit"]
  }
}
```

---

## 8) Performance optimizations

- Resolver cache for expanded expressions.
- Query-time semantic dependency list de-duplicated.
- Existing aggregation reuse remains active from measure engine stage.

---

## 9) Known limitations

- In-memory registry only (non-persistent).
- Nested name replacement is token-boundary based; advanced lexical contexts are future work.
- No namespace/workspace access control model yet.

Current design is ready for extension to CALCULATE-like semantics, time intelligence, and richer semantic modeling.
