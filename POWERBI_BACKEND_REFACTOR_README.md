# Power BI-Style Backend Refactor — Execution Report

## 1. Refactor Goal Achieved

Implemented architectural transition from:

- `dataset -> chart -> frontend processData() -> render`

to:

- `dataset -> backend data model -> backend query engine -> aggregated result -> ECharts render`

UI components and UX flow were retained (`DataPanel`, `GlobalFilterBar`, chart cards, layout, ECharts layer).

---

## 2. Updated File Structure

### New frontend module

- `services/queryBuilder.js`

### New backend modules

- `backend/models/data_model.py`
- `backend/services/query_engine/__init__.py`
- `backend/services/query_engine/query_parser.py`
- `backend/services/query_engine/aggregation_engine.py`
- `backend/services/query_engine/filter_engine.py`
- `backend/services/query_engine/join_engine.py`

### Modified existing modules

- `components/Visualization.jsx`
- `services/backendApi.js`
- `services/chartValidationEngine.js`
- `App.jsx`
- `backend/main.py`
- `backend/db/db_store.py`
- `backend/services/data_services/metadata_generator.py`

---

## 3. Frontend Changes

## 3.1 `Visualization.jsx`

### Removed

- Entire frontend data processing path (`processData()`), including:
  - frontend grouping
  - frontend aggregations
  - local top-15 slicing

### Added

- Backend query execution flow:
  - Build query via `buildQuery(...)`
  - Execute `backendApi.runQuery(...)`
  - Render returned rows with existing `buildChartOption(...)`

- Query lifecycle UI states:
  - loading state
  - query error state

## 3.2 `queryBuilder.js`

Implemented chart-config-to-query translation:

- Converts roles/assignments into backend query payload
- Merges filters from:
  - global filters
  - chart-local filters
  - drill filters
- Supports modes:
  - `aggregate`
  - `raw`
  - `hierarchy`
  - `org_tree`

## 3.3 `backendApi.js`

Added:

- `runQuery(payload)` -> `POST /query`

---

## 4. Backend Query Engine

## 4.1 API

Added endpoint:

- `POST /query`

Request supports:

- dataset selection (`datasetId`)
- dimensions
- measures with aggregation
- filters
- mode-specific fields (`hierarchy`, `org_tree`, `raw`)
- sort and limit
- joins (future-ready)

## 4.2 Query Engine Components

### `query_parser.py`

- Resolves dataset
- Builds/returns data model
- Applies filters
- Delegates to mode-specific execution
- Implements in-memory query caching

### `filter_engine.py`

- Handles filter types:
  - include filters
  - numeric ranges
  - operator filters (`EQUALS`, `GT`, `BETWEEN`, etc.)

### `aggregation_engine.py`

- Performs backend group-by + aggregation
- Supports `SUM`, `AVG`, `COUNT`, `MIN`, `MAX`, `GROUP_BY`
- Builds hierarchy payloads
- Builds org-tree payloads
- Enforces aggregation safety (e.g., prevent `SUM` on ID)

### `join_engine.py`

- Current passthrough implementation
- Prepared extension point for multi-table joins

---

## 5. Data Model Layer

Added `backend/models/data_model.py`:

- Builds model with:
  - tables
  - column semantic types
  - relationships (from metadata)
  - basic measure catalog

Also made ingestion persist schema metadata:

- `column_types`
- `column_semantic_types`
- `relationships` (initialized)

This shifts source-of-truth typing to backend metadata.

---

## 6. Aggregation and Type Safety Fixes

## 6.1 Invalid ID aggregation prevention

Implemented validation in backend aggregation engine:

- Blocks additive aggregations (`SUM`, `AVG`, `MIN`, `MAX`) on semantic `id` fields
- Blocks additive aggregations on non-numeric semantic types

## 6.2 Type inference consistency

Improved both sides:

- Frontend now prefers backend metadata (`column_types`, `column_semantic_types`) in `mapBackendDatasetToAppDataset(...)`
- Frontend inference remains fallback only
- Validation engine hardened to avoid numeric-as-date false positives

## 6.3 Over-filtering mitigation

- Query builder deduplicates filters before sending to backend
- Backend receives unified filter set and applies once in query pipeline

---

## 7. Multi-Table Readiness

Prepared backend relationship layer:

- New Mongo collection: `relationships`
- New indexes in `ensure_indexes()`
- New endpoints:
  - `GET /relationships`
  - `POST /relationships`

Added query payload `joins` and `join_engine` extension point.

---

## 8. Query Caching

Implemented backend in-memory caching in `query_parser.py`:

- cache key: SHA-256 of canonical query JSON
- TTL-based invalidation (45s)
- cache hit/miss metadata returned in response

---

## 9. Removed / Replaced Logic

## Removed from runtime path

- Frontend chart data aggregation in `Visualization.processData()`
- Frontend manual top-15 output truncation
- Frontend-driven hierarchy/org aggregation path in visualization runtime

## Replaced with

- Backend query modes (`aggregate`, `hierarchy`, `org_tree`, `raw`)
- Backend-first aggregation/filter engine

---

## 10. Performance Improvements

1. **Server-side aggregation**
   - reduces browser CPU for large datasets
2. **Filter pushdown to backend**
   - avoids repeated frontend filtering work
3. **Query result cache**
   - faster repeated interactions
4. **Mode-based query execution**
   - fetch only needed shape (raw/aggregate/hierarchy/org-tree)
5. **Frontend render simplification**
   - visualization focuses on rendering only

---

## 11. Migration Plan (Completed + Next)

## Completed in this refactor

- Introduced backend query engine
- Added `/query` endpoint
- Refactored visualization to backend-query flow
- Added query builder
- Added backend data model
- Added relationship store endpoints
- Added caching

## Recommended next increments

1. Add persistent cache (Redis) behind current cache interface
2. Move drill-through detail fetching to dedicated backend endpoint
3. Add explicit query planner for true multi-table joins
4. Add materialized aggregate snapshots for very large datasets
5. Add query telemetry (latency/cardinality/index usage)

---

## 12. Validation Status

- Frontend static checks: no editor errors on modified files
- Backend syntax: `python -m compileall backend` successful

