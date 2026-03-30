# Report View Chart System — End-to-End Technical README

## 1) Scope

This document explains the full report-view pipeline in this project:

- how data is ingested/fetched,
- how dataset columns are typed (`number`, `date`, `string`/categorical),
- how chart configuration is generated and validated,
- how each chart type is rendered,
- how filtering/drill/interactions/export/share/persistence work,
- and what every report-view control does.

Primary implementation files:

- `App.jsx`
- `components/DataPanel.jsx`
- `components/Visualization.jsx`
- `components/GlobalFilterBar.jsx`
- `services/chartRecommender.js`
- `services/chartConfigSystem.js`
- `services/chartValidationEngine.js`
- `services/echartsOptionBuilder.js`
- `services/backendApi.js`
- `backend/main.py`
- `backend/services/data_services/*`

---

## 2) High-Level Architecture

### Frontend (React + ECharts)

- **State orchestration**: `App.jsx`
- **Chart setup UI**: `DataPanel.jsx`
- **Chart rendering + data shaping + interactions**: `Visualization.jsx`
- **Cross-chart/global filters UI**: `GlobalFilterBar.jsx`
- **Recommendation + role assignment logic**: `chartRecommender.js` + `chartConfigSystem.js`
- **Validation/auditing logic**: `chartValidationEngine.js`
- **Final ECharts option creation**: `echartsOptionBuilder.js`

### Backend (FastAPI)

- **Auth**: `/auth/signup`, `/auth/login`, `/auth/me`
- **Ingestion**: `/ingest`, `/ingest/source/{source_id}`, `/ingest/upload`
- **Datasets**: `/datasets`, `/datasets/latest`, `/datasets/latest/{source_id}`, `/datasets/{document_id}`
- **Source config**: `/source-config` endpoints
- **(Optional) chart endpoints**: `/chart/recommend`, `/chart/config`, `/chart/aggregate`

In report view, chart rendering is currently frontend-driven; backend chart endpoints are available but not the primary rendering path.

---

## 3) End-to-End Data Flow

## 3.1 Ingestion and storage (backend)

1. **Data source trigger**
   - API URL or saved source config (`api`/`sftp`) or uploaded file.
2. **Fetch**
   - `fetch_data()` routes to API HTTP fetch or SFTP fetch.
3. **Parse**
   - `parse_data()` detects format (`json`, `csv`, `tsv`, `excel`) and loads into DataFrame.
4. **Metadata**
   - `generate_metadata()` stores source details, columns, row count, filename, timestamp.
5. **Persist**
   - dataset stored in DB with source/version/document metadata.

## 3.2 Dataset retrieval (frontend)

On app hydration (`App.jsx`):

1. Loads local/session state from localStorage.
2. Calls `backendApi.listDatasets(1000)`.
3. Maps each backend dataset item using `mapBackendDatasetToAppDataset()`.
4. For each detected column, computes type using `inferColumnType(columnName, values)`.

If backend listing fails but stored backend source ids exist, it falls back to `getLatestDatasetBySourceId()` calls.

---

## 4) Column Type Classification Logic

Main classifier: `inferColumnType()` in `App.jsx`.

It returns one of:

- `number`
- `date`
- `string` (categorical)

### 4.1 Sampling

- Drops `null`, `undefined`, empty-string values.
- Uses first 50 non-empty values as sample.

### 4.2 Numeric detection (strict)

- `isNumericValue()` accepts finite JS numbers.
- For strings, it normalizes common numeric formatting:
  - trims,
  - supports accounting negative `(123)`,
  - removes separators/symbols (`$`, `%`, spaces, commas, etc.),
  - validates with numeric regex (including decimal/scientific notation).

### 4.3 Date detection (guarded)

- `isDateLikeValue()` rejects pure numerics first (prevents false date classification like `202401`, `1`, `2`).
- Requires date cues (`-`, `/`, month names, date-like token pattern) before `Date.parse()` acceptance.

### 4.4 Rule order

1. If experience-like field name and all values parse as experience durations → `number`.
2. If ID-like field name and mostly numeric → force `string` (categorical id semantics).
3. If `numericRatio >= 0.9` → `number`.
4. Else if `dateRatio >= 0.9` → `date`.
5. Else if name looks categorical (`name`, `category`, `department`, etc.) → `string`.
6. Else default `string`.

This avoids major prior bugs where numeric strings could be interpreted as dates.

---

## 5) Report View State Model

In `App.jsx`, core report state:

- `datasets`: all datasets
- `pages`: report tabs/pages
- `activePageId`
- `charts`: all visuals (each tied to a `pageId` and `datasetId`)
- `selectedDatasetId`
- `activeChartId`
- `globalFilters`
- `isEditMode`
- export/share/settings states

Derived state:

- `currentPageCharts = charts.filter(c => c.pageId === activePageId)`
- `gridLayouts` from chart layouts
- `chartGroupId = page-${activePageId}` for linked ECharts grouping

Persistence keys include charts/pages/datasets/filters/active page/dataset/view/auth.

---

## 6) Chart Creation and Configuration Pipeline

## 6.1 Add Visual flow

1. User clicks **Add Visual**.
2. New visual name popup (`DataPanel` modal in `App.jsx`).
3. `handleConfirmNewChart(name)` calls `recommendVisualization(columns, data, {})`.
4. Top recommendation produces:
   - chart type,
   - auto-assigned fields (`assignments`),
   - mode + base config.
5. Chart object is created with default layout/style and added to `charts`.

## 6.2 Role assignment model

`chartConfigSystem.js` roles:

- axis/value roles: `x`, `time`, `y`, `value`, `size`
- grouping roles: `legend`, `color`, `hierarchy`
- org roles: `node`, `parent`, `label`

`configFromAssignments()` converts role assignments to concrete config fields:

- `dimension`, `measures`, `aggregation`
- `xAxisField`, `yAxisField`, `legendField`, `sizeField`
- `hierarchyFields`
- org-specific fields (`nodeField`, `parentField`, etc.)

## 6.3 Validation

`auditChartConfiguration()` validates current config against columns/data:

- missing required roles,
- invalid aggregation by field kind,
- org-cycle checks,
- too many categories warnings,
- chart-type suitability suggestions.

Errors block rendering and show a visible error panel in `Visualization`.

---

## 7) Data Processing Before Rendering (per visual)

In `Visualization.processData()`:

1. Start with dataset rows.
2. Apply **global filters** (`globalFilters`).
3. Apply **visual-local filters** (`config.filters`).
4. Apply **drill path filters** (`drillPath`).
5. Branch by chart type:
   - hierarchy charts (`SUNBURST`, `TREEMAP`): `buildHierarchy()`
   - org charts: `buildOrgTree()`
   - others: group by effective dimension and aggregate measures.
6. Aggregations support `SUM`, `AVG`, `COUNT`, `MIN`, `MAX`, `GROUP_BY` semantics.
7. For standard grouped charts, sorts by first measure desc and takes top 15 rows in `Visualization` processing.

---

## 8) How Each Chart Is Rendered

Rendering engine: `buildChartOption()` in `echartsOptionBuilder.js`, consumed by `ReactECharts`.

General pipeline:

1. normalize visual type/mode,
2. merge role-derived config,
3. apply style controls (fonts, labels, tooltips, color mode),
4. build base axis/grid/tooltip/legend styles,
5. switch by chart type,
6. apply enterprise polish (top-N, zoom, label formatting, legend/series polish).

### 8.1 Families and concrete mappings

- **Bars**: `BAR_CLUSTERED`, `BAR_STACKED`, `BAR_PERCENT`, `BAR_HORIZONTAL`
- **Lines**: `LINE_SMOOTH`, `LINE_STRAIGHT`, `LINE_STEP`
- **Areas**: `AREA_SMOOTH`, `AREA_STACKED`, `AREA_PERCENT`
- **Circular**: `PIE`, `DONUT`, `ROSE`, `SUNBURST`
- **Distribution**: `SCATTER`, `BUBBLE`, `HEATMAP`, `TREEMAP`
- **Org**: `ORG_CHART`, `ORG_TREE_STRUCTURED` (tree series with custom labels/search/selection)
- **Combo**: `COMBO_BAR_LINE`, `COMBO_AREA_LINE`
- **Indicators**: `GAUGE`, `SPARKLINE`, `RADAR`, `RADIAL_BAR`
- **Special non-ECharts renderers in `Visualization`**:
  - `TABLE` -> HTML table
  - `KPI_SINGLE` -> custom KPI card

### 8.2 Chart interaction hooks

- `onChartReady` registers chart instance and group connection (`echarts.connect(groupId)`).
- `onEvents.click` handles point click:
  - non-org: drill down (if possible), cross-filter payload emit.
  - org: path selection + payload emit.

---

## 9) Filtering Model

## 9.1 Global filters (`GlobalFilterBar`)

Two types:

- `include` (categorical list)
- `range` (numeric min/max)

Applied across all visuals that contain the target column.

Also supports interaction-generated filters (`source: 'interaction'`), with:

- **Clear Interactions**
- **Clear All**

## 9.2 Visual-local filters (`DataPanel`)

Per-chart filters with operators based on column type:

- string: `EQUALS`, `CONTAINS`, `STARTS_WITH`, `IS_EMPTY`
- date: `EQUALS`, `GT`, `LT`, `BETWEEN`, `IS_EMPTY`
- number: `GT`, `LT`, `EQUALS`, `BETWEEN`
- boolean: `IS_TRUE`, `IS_FALSE`

Order of application: global -> local -> drill.

---

## 10) Drill and Cross-Filter Behavior

- Clicking a data point emits `onDataPointClick` to `App.jsx`.
- `App` injects/updates an interaction filter in `globalFilters`.
- It also computes and shows a **drill-through modal** with matching raw rows (up to 200 displayed).
- For non-org visuals, click can further drill dimensionally if another eligible dimension exists.

---

## 11) Report View Controls (What Every Button Does)

## 11.1 Top report toolbar

- **Dataset selector**
  - Switches `selectedDatasetId` for chart creation/edit context.
- **Preview / Edit Mode toggle**
  - Toggles grid drag/resize and edit affordances.
- **Expand Org Chart** (only when org visuals exist)
  - Navigates to `/org-chart` explorer with selected org visual.
- **Share**
  - Opens share/export popup (scope + PDF/PPT actions).
- **Settings**
  - Opens report settings popup:
    - chart clarity mode (`standard` / `clear`)
    - palette mode (`vibrant` / `neutral`)
- **Add Visual**
  - Opens new-visual flow and auto-recommended config.

## 11.2 Share popup

- **Export Scope**: Active Page / All Pages
- **Export as PDF**
- **Export as PPT**

## 11.3 Footer page controls

- Page tabs switch `activePageId`.
- `X` on page removes page (if > 1), and deletes visuals on that page.
- `+` (`PlusCircle`) adds new page.

## 11.4 Per-visual controls

- Select visual by clicking card.
- Remove selected visual via trash button.
- Drag handle appears in edit mode.

## 11.5 Right panel (`DataPanel`) controls

Data pane:

- recommended chart buttons,
- all chart catalog,
- smart suggestion apply,
- global chart setup hints,
- local filter builder,
- field search and field-to-role assignment,
- role chips with remove/reorder,
- per-assignment aggregation,
- global aggregation shortcuts.

Format pane:

- title,
- width slider,
- font family/size,
- labels mode,
- tooltip on/off,
- color mode single/multi,
- custom color palette editing.

---

## 12) Export and Share Internals

## 12.1 Export pipeline

1. Enter export render mode (`isExportRenderMode=true`) for readability overrides.
2. Collect export targets from DOM nodes marked `data-export-visual=true`.
3. Capture chart image:
   - preferred: native ECharts `getDataURL()` for quality,
   - fallback: `html2canvas` snapshot.
4. Build PDF (`jsPDF`) or PPT (`PptxGenJS`).
5. Restore previous page/render mode.

Includes short-lived export cache key by scope/pages/charts/theme.

## 12.2 Share link

`handleShareDashboard()` builds payload (datasets/charts/pages/filters/company/context), base64url-encodes token into URL query `reportShare`.

On app load, if `reportShare` exists and schema matches, state is hydrated from link into report mode.

---

## 13) Authentication and API Coupling

- Frontend stores token in localStorage (`power_bi_v3_auth_token`).
- `backendApi.request()` auto-attaches Bearer token if present.
- `App` bootstraps session via `/auth/me`.
- Report view is accessible after auth user exists.

---

## 14) Practical Debug Checklist

If a visual is wrong/empty:

1. Verify `dataset` and `config.datasetId` match.
2. Check `auditChartConfiguration()` errors shown on card.
3. Validate `assignments` roles for selected chart type.
4. Inspect global + local + drill filters for over-filtering.
5. Confirm inferred column types (especially date/number edge cases).
6. Check `chartData` output from `processData()`.
7. Confirm `buildChartOption()` branch for chart type.
8. For exports, ensure chart instance registered via `onChartReady`.

---

## 15) Notes on Current Design Choices

- Column typing is **frontend-inferred at hydration** from row samples.
- Rendering is **frontend-native** (ECharts + custom components).
- Backend chart endpoints exist but are not primary in report rendering path.
- Interactions are designed for BI-like behavior:
  - global filters,
  - drill,
  - cross-filter,
  - drill-through modal.

---

## 16) Quick Sequence Summary (Condensed)

1. Ingest/fetch data -> backend stores dataset with metadata.
2. Frontend loads datasets -> maps backend rows -> infers column types.
3. User creates visual -> recommender picks chart + assignments.
4. DataPanel edits assignments/filters/style.
5. Visualization validates config -> processes rows -> builds chart data.
6. ECharts option built by type-specific branch.
7. Click interactions update filters/drill and optional drill-through table.
8. State persists to localStorage; export/share build from live render state.
