# Measure Engine Upgrade (Power BI-like Post-Aggregation Computation)

## 1) `expression_parser.py` (AST builder)

Implemented at [backend/services/measure_engine/expression_parser.py](backend/services/measure_engine/expression_parser.py).

### Supported syntax

- `SUM(sales)`
- `SUM(profit) / SUM(revenue)`
- `(SUM(profit) - SUM(cost)) / SUM(revenue)`
- Unary forms like `-SUM(cost)`

### AST examples

`SUM(profit) / SUM(revenue)`

```json
{
  "type": "binary",
  "operator": "/",
  "left": { "type": "agg", "func": "SUM", "field": "profit", "table": null },
  "right": { "type": "agg", "func": "SUM", "field": "revenue", "table": null }
}
```

Also included:

- aggregation collector (`collect_aggregations`) for dependency extraction
- canonical aggregation signature helper (`canonical_agg_signature`)

---

## 2) `evaluator.py` (measure computation)

Implemented at [backend/services/measure_engine/evaluator.py](backend/services/measure_engine/evaluator.py).

### Input

- aggregated row objects (from aggregation phase)
- measure plan
- normalized query sort/limit context

### Processing

For each result row:

1. Resolve aggregation signatures (e.g. `SUM(profit)`) to already-aggregated values
2. Evaluate expression AST recursively
3. Handle edge cases safely:
   - division by zero -> `null`
   - missing value -> `null`
   - invalid expression parse -> `null`

### Output

- appends computed measure columns
- returns updated `columns` and `rows`
- fills `computedMeasures`

---

## 3) Pipeline integration changes

The pipeline now executes:

- `parse_query`
- `normalize_query`
- `validate_query`
- `resolve_relationships`
- `build_filter_context`
- `execute_aggregation`
- `evaluate_measures`  ✅ added
- `format_response`

Integration points:

- [backend/services/query_pipeline/measure_evaluator.py](backend/services/query_pipeline/measure_evaluator.py)
- [backend/services/query_pipeline/__init__.py](backend/services/query_pipeline/__init__.py)
- [backend/services/query_engine/query_parser.py](backend/services/query_engine/query_parser.py)

---

## 4) Measure structure and normalization

Extended measure normalization in [backend/services/query_pipeline/normalizer.py](backend/services/query_pipeline/normalizer.py):

- `type: simple` for field+aggregation style
- `type: expression` for formula style
- legacy inputs are still accepted and normalized

Validation added in [backend/services/query_pipeline/validator.py](backend/services/query_pipeline/validator.py):

- expression parse validation
- simple measure field validation

---

## 5) Aggregation reuse optimization

Implemented in [backend/services/query_pipeline/aggregation_executor.py](backend/services/query_pipeline/aggregation_executor.py):

- expression dependencies are extracted from AST (`SUM(...)`, `AVG(...)`, etc.)
- duplicate aggregations are deduplicated by canonical signature
- aggregation is executed once and reused by measure evaluator

This avoids recomputation for queries like:

- `SUM(sales)`
- `SUM(profit) / SUM(sales)`

---

## 6) Response format updates

`columns` + `rows` compatibility is preserved.

`meta` now includes computed measure metadata in [backend/services/query_pipeline/response_formatter.py](backend/services/query_pipeline/response_formatter.py):

- `measureFields`
- `computedMeasures`
- `types`
- `executionTimeMs`
- `cacheHit`

---

## 7) Example request → pipeline → response

### Request

```json
{
  "datasetId": "sales_data",
  "dimensions": ["state"],
  "measures": [
    { "name": "Sales", "expression": "SUM(sales)", "type": "expression" },
    { "name": "Profit Margin", "expression": "SUM(profit) / SUM(sales)", "type": "expression" }
  ],
  "sort": { "field": "Profit Margin", "order": "desc" },
  "limit": 100
}
```

### Execution

1. parser/normalizer builds canonical measure definitions
2. aggregation executor computes required bases once (`SUM(sales)`, `SUM(profit)`)
3. evaluator computes `Sales` and `Profit Margin`
4. formatter returns final matrix + metadata

### Response (shape)

```json
{
  "columns": ["state", "Sales", "Profit Margin"],
  "rows": [["TN", 1000, 0.32], ["KL", 900, 0.28]],
  "meta": {
    "measureFields": ["Sales", "Profit Margin"],
    "computedMeasures": ["Sales", "Profit Margin"]
  }
}
```

---

## 8) Performance notes

- Aggregation dependency dedupe prevents repeated scans for same agg function+field.
- Per-row evaluator caches resolved aggregation values.
- Existing query cache remains active (normalized query + dataset version).

---

## 9) Known limitations

- Current expression scope is arithmetic over aggregate calls and numeric literals.
- No full DAX function library yet.
- No time-intelligence functions yet (`YTD`, `MTD`, etc.).
- Relationship join planner is minimal one-hop strategy.

These are compatible extension points for future semantic-layer expansion.
