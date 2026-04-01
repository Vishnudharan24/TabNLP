# Query Pipeline Upgrade (Power BI–Ready Foundation)

## 1) Updated Query Contract Schema (Backward Compatible)

### Accepted legacy request (still works)

```json
{
  "datasetId": "sales_data",
  "dimensions": ["state"],
  "measures": [{ "field": "sales", "aggregation": "SUM" }],
  "filters": [{ "field": "year", "operator": "=", "value": 2024 }],
  "sort": { "field": "sales", "order": "desc" },
  "limit": 100
}
```

### Extended request (new canonical form)

```json
{
  "datasetId": "sales_data",
  "chartType": "BAR",
  "dimensions": [{ "field": "state", "table": "sales" }],
  "measures": [{ "name": "Total Sales", "expression": "SUM(sales)" }],
  "filters": [{ "field": "year", "table": "sales", "operator": "=", "value": 2024, "type": "dimension" }],
  "sort": { "field": "Total Sales", "order": "desc" },
  "limit": 100,
  "meta": { "requestId": "uuid", "timestamp": "..." }
}
```

### Internal normalized form

- All dimensions -> `{ field, table }`
- All measures -> `{ name, expression, field, table, aggregation }`
- All filters -> `{ field, table, operator, value, type }`
- Compatibility fields (`mode`, `hierarchy`, `nodeField`, etc.) are normalized and preserved through `_compat`.

---

## 2) Backend Pipeline Implementation

Added package: [backend/services/query_pipeline](backend/services/query_pipeline)

Pipeline stages:

1. `parse_query()` -> [backend/services/query_pipeline/parser.py](backend/services/query_pipeline/parser.py)
2. `normalize_query()` -> [backend/services/query_pipeline/normalizer.py](backend/services/query_pipeline/normalizer.py)
3. `validate_query()` -> [backend/services/query_pipeline/validator.py](backend/services/query_pipeline/validator.py)
4. `resolve_relationships()` -> [backend/services/query_pipeline/relationship_resolver.py](backend/services/query_pipeline/relationship_resolver.py)
5. `build_filter_context()` -> [backend/services/query_pipeline/filter_context.py](backend/services/query_pipeline/filter_context.py)
6. `execute_aggregation()` -> [backend/services/query_pipeline/aggregation_executor.py](backend/services/query_pipeline/aggregation_executor.py)
7. `format_response()` -> [backend/services/query_pipeline/response_formatter.py](backend/services/query_pipeline/response_formatter.py)

Error model:

- `QueryEngineError` -> [backend/services/query_pipeline/errors.py](backend/services/query_pipeline/errors.py)

Orchestration entrypoint:

- [backend/services/query_engine/query_parser.py](backend/services/query_engine/query_parser.py)

---

## 3) Normalizer Logic (Old -> New)

Implemented in [backend/services/query_pipeline/normalizer.py](backend/services/query_pipeline/normalizer.py):

- Converts dimension strings into `{ field, table }`.
- Converts legacy measure shape (`field`, `aggregation`, `alias`) to canonical measure.
- Parses expression measures (basic parse):
  - `SUM(sales)`
  - `AVG(price)`
  - `COUNT(*)`
- Converts old filter shapes:
  - `include` -> `IN`
  - `range` -> `BETWEEN`
  - `operator` -> normalized operator/value
- Maps legacy compatibility payloads:
  - `mode: hierarchy` -> hierarchy dimensions
  - `mode: org_tree` -> node/parent dimensions
  - legacy sortBy/sortOrder -> `sort`

---

## 4) Relationship Resolver (Minimum Working)

Implemented in [backend/services/query_pipeline/relationship_resolver.py](backend/services/query_pipeline/relationship_resolver.py):

- Loads relationships from:
  - data model metadata
  - persisted `relationships` collection
  - request `joins`
- Dedupe relationship edges.
- Detect referenced tables from dimensions/measures/filters.
- Builds a minimal join plan (one-to-many oriented to base table) only when needed.

---

## 5) Filter Context Implementation

Implemented in [backend/services/query_pipeline/filter_context.py](backend/services/query_pipeline/filter_context.py):

Context structure:

- `filters`
- `dimensions`
- `relationships`
- `joins`
- `referencedTables`

Filters are applied before aggregation in executor.

---

## 6) Response Formatter (Extended, Compatible)

Implemented in [backend/services/query_pipeline/response_formatter.py](backend/services/query_pipeline/response_formatter.py).

Response format:

```json
{
  "columns": ["state", "Total Sales"],
  "rows": [["CA", 1000], ["TX", 900]],
  "meta": {
    "dimensionFields": ["state"],
    "measureFields": ["Total Sales"],
    "types": {
      "state": "categorical",
      "Total Sales": "number"
    },
    "executionTimeMs": 12,
    "cacheHit": false
  }
}
```

`columns` + `rows` remains unchanged for chart compatibility.

---

## 7) Error Handling System

Structured error contract is now returned from `/query` in [backend/main.py](backend/main.py):

```json
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "...",
    "details": {}
  }
}
```

Also returns `QUERY_EXECUTION_FAILED` for server-side failures.

---

## 8) Example Request -> Pipeline -> Response Flow

Request:

```json
{
  "datasetId": "sales_data",
  "dimensions": ["state"],
  "measures": [{ "name": "Total Sales", "expression": "SUM(sales)" }],
  "filters": [{ "field": "year", "operator": "=", "value": 2024 }],
  "sort": { "field": "Total Sales", "order": "desc" },
  "limit": 50
}
```

Flow:

1. `parse_query` validates envelope.
2. `normalize_query` converts to canonical dimension/measure/filter nodes.
3. `validate_query` checks aggregations/sort/limit.
4. `resolve_relationships` determines required joins.
5. `build_filter_context` constructs reusable context object.
6. `execute_aggregation` joins + filters + aggregates.
7. `format_response` returns `columns`, `rows`, and `meta`.

Response:

```json
{
  "status": "success",
  "columns": ["state", "Total Sales"],
  "rows": [["CA", 1000], ["TX", 900]],
  "meta": {
    "dimensionFields": ["state"],
    "measureFields": ["Total Sales"],
    "types": { "state": "categorical", "Total Sales": "number" },
    "executionTimeMs": 12,
    "cacheHit": false
  }
}
```
