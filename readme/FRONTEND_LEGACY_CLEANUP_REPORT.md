# Frontend Legacy Cleanup Report (Plan-New6)

## Cleaned files
- [components/Visualization.jsx](components/Visualization.jsx)
- [components/DataPanel.jsx](components/DataPanel.jsx)
- [services/chartConfigSystem.js](services/chartConfigSystem.js)
- [services/chartValidationEngine.js](services/chartValidationEngine.js)
- [services/queryBuilder.js](services/queryBuilder.js)
- [services/echartsOptionBuilder.js](services/echartsOptionBuilder.js)

## Removed functions / legacy blocks
- Removed bar Top-N + client sorting option pass:
  - `applyTopNAndSortForBar()` from [services/echartsOptionBuilder.js](services/echartsOptionBuilder.js)
- Removed row preprocessing Top-N transform:
  - `preprocessTopNBarData()` from [services/echartsOptionBuilder.js](services/echartsOptionBuilder.js)
- Removed unused hierarchy aggregation helper:
  - `buildHierarchy()` from [services/chartConfigSystem.js](services/chartConfigSystem.js)
- Removed DataPanel aggregation UI and mutators:
  - Per-chip aggregation dropdown
  - Global aggregation selector section
  - Aggregation helper functions/constants
- Removed aggregation validation rules from audit layer:
  - ID/categorical aggregation rule checks in [services/chartValidationEngine.js](services/chartValidationEngine.js)
- Removed aggregation display derivation from visualization header in [components/Visualization.jsx](components/Visualization.jsx)

## Safety fallback for old configs
Implemented compatibility conversion for legacy measure configs:

### Old shape
```json
{ "field": "sales", "aggregation": "SUM" }
```

### New shape produced in frontend normalization
```json
{ "field": "sales", "expression": "SUM(sales)" }
```

Also supports:
- `{"field":"__count__","aggregation":"COUNT"}` → `{"expression":"COUNT(*)"}`
- `GROUP_BY(field)` legacy semantics → `COUNT(field)` expression fallback.

## Before / after comparison

### Before
- DataPanel controlled aggregations directly.
- Visualization derived and displayed aggregation mode from local config.
- Validation layer enforced aggregation-specific rules.
- ECharts option builder performed client-side Top-N sorting/slicing for bar charts.
- QueryBuilder emitted field+aggregation measure payloads for many cases.

### After
- DataPanel handles field/semantic-measure mapping only.
- Visualization is query-first render-only (no local aggregation derivation).
- Validation checks only structure/suitability (missing fields, invalid role combinations, chart-fit warnings).
- No client-side Top-N sorting/slicing transformations in chart option building.
- QueryBuilder prefers expression/name payloads and converts legacy assignment aggregation to expression only as compatibility fallback.

## Final flow confirmation
Frontend flow is now:

`config -> queryBuilder -> backend /query -> dataAdapter -> chart`

No active frontend aggregation/grouping engine remains in chart rendering path.
