# Frontend Query-Driven Migration (Plan-New5)

## Completed changes

### 1) Query payload generation is semantic-aware
- Updated [services/queryBuilder.js](services/queryBuilder.js) to support semantic measure assignments.
- Semantic assignments are now emitted as query measures using:
  - `{ "name": "<semantic_measure_name>" }`
  - Optional `{ "expression": "<resolved_or_custom_expression>" }` when available.
- Existing field-based aggregations remain backward compatible.

### 2) Visualization data flow uses a dedicated adapter
- Added [services/dataAdapter.js](services/dataAdapter.js).
- Updated [components/Visualization.jsx](components/Visualization.jsx) to use the adapter for converting backend `columns + rows` into row objects.
- This centralizes response transformation and removes inline conversion duplication.

### 3) Semantic measures are loaded from backend and provided to DataPanel
- Added semantic measure API client in [services/backendApi.js](services/backendApi.js): `getSemanticMeasures(datasetId)`.
- Updated [App.jsx](App.jsx) to load semantic measures per selected dataset and pass them to [components/DataPanel.jsx](components/DataPanel.jsx).

### 4) DataPanel now supports semantic measure selection
- Updated [components/DataPanel.jsx](components/DataPanel.jsx) to:
  - Accept `semanticMeasures` prop.
  - Surface semantic measures in the field mapping panel.
  - Add semantic measures to role picker candidates for measure roles.
  - Store semantic assignments in chart config assignments with semantic metadata.
  - Prevent semantic assignments from being overwritten by aggregation selectors.

## Retired / reduced legacy frontend logic

### Reduced
- Inline query response row-matrix transformation in `Visualization` has been replaced with `dataAdapter`.
- Aggregation controls no longer mutate semantic measure assignments.

### Kept for compatibility
- Assignment-driven chart mapping and legacy config conversion (`convertOldConfig`) are still active for existing charts.
- Field-based measure selection remains supported alongside semantic measures.

## End-to-end frontend flow (current)
1. User maps fields/measures in `DataPanel`.
2. `DataPanel` assignment state is normalized into chart config.
3. `Visualization` builds a backend query via `buildQuery()`.
4. Backend returns `columns + rows (+ meta)`.
5. `dataAdapter` converts response to chart-consumable rows.
6. `buildChartOption()` renders chart/Table/KPI using adapted rows.

## Notes
- Semantic measures are currently applied for measure roles (`value`, `y`, `size`) in the picker flow.
- Existing charts without semantic assignments continue to work without changes.
