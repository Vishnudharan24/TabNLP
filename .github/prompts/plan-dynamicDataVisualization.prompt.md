## Plan: Dynamic Data Visualization Tool with Grey/White Theme & Dark Mode

Transform the existing PowerAnalytics Desktop app into a Tableau/Power BI-like tool with **intelligent chart type recommendations** based on data characteristics, a **grey & white color theme**, a **dark/light mode toggle**, and **Apache ECharts** as the primary charting engine (replacing Recharts). ECharts (`echarts` and `echarts-for-react` are already installed but unused — this plan activates them).

### Steps

1. **Create a Theme Context & Toggle Button**  
   Add a React Context (`ThemeContext`) for dark/light mode state, persisted to `localStorage`. Add a sun/moon toggle icon button in [components/Header.jsx](components/Header.jsx). Apply Tailwind's `dark:` variant by toggling a `dark` class on the `<html>` element. Replace all hardcoded color values in the `<style>` block of [index.html](index.html) with CSS custom properties that swap between grey/white (light) and dark-grey/charcoal (dark) palettes.

2. **Retheme to Grey & White Palette**  
   Replace the current indigo/purple branding across all components ([App.jsx](App.jsx), [components/Header.jsx](components/Header.jsx), [components/Sidebar.jsx](components/Sidebar.jsx), [components/DataPanel.jsx](components/DataPanel.jsx), [components/Visualization.jsx](components/Visualization.jsx), [components/DataSourceView.jsx](components/DataSourceView.jsx)) with a neutral grey/white palette. Update `CHART_COLORS` in [constants.js](constants.js) to a professional grey-scale-friendly set. Update CSS variables in [index.html](index.html): `--brand-primary` → grey-700, `--bg-main` → white/grey-50, `--bg-card` → white, `--border-color` → grey-200, plus dark-mode counterparts (grey-900, grey-800, grey-700).

3. **Build a Smart Chart Recommendation Engine**  
   Create a new utility (e.g., `services/chartRecommender.js`) that analyzes dataset columns (from the `ColumnSchema` types in [types.js](types.js)) and recommends appropriate chart types. Logic: count numeric vs. categorical columns, check cardinality, detect time-series fields → rank `VISUAL_TYPES` from [types.js](types.js) by suitability. For example: 1 categorical + 1 numeric → Bar; 1 time + 1 numeric → Line; 1 categorical only → Pie/Donut; 2 numeric → Scatter; single KPI → KPI_SINGLE.

4. **Integrate Recommendations into DataPanel's Visual Gallery**  
   In [components/DataPanel.jsx](components/DataPanel.jsx), replace the static first-12-icons gallery with a **"Recommended"** section (top, highlighted) plus an **"All Charts"** expandable section. When the user assigns a dimension/measure or uploads new data, auto-select the top-recommended chart type for new charts. Show a relevance badge (e.g., ★) on recommended types.

5. **Migrate All Charts to Apache ECharts & Implement Missing Types**  
   Refactor [components/Visualization.jsx](components/Visualization.jsx) to use `echarts-for-react` (`ReactECharts`) as the primary chart renderer instead of Recharts. Build an ECharts option-builder utility (`services/echartsOptionBuilder.js`) that maps each `VISUAL_TYPES` key to a complete ECharts `option` object (series type, axis config, legend, tooltip, color palette, responsive sizing). Implement **all** chart types defined in [types.js](types.js), including:
   - **Bar:** `BAR_CLUSTERED`, `BAR_STACKED`, `BAR_PERCENT`, `BAR_HORIZONTAL`
   - **Line:** `LINE_SMOOTH`, `LINE_STRAIGHT`, `LINE_STEPPED`
   - **Area:** `AREA_BASIC`, `AREA_STACKED`, `AREA_PERCENT`
   - **Circular:** `PIE`, `DONUT`, `SUNBURST`, `ROSE`
   - **Distribution:** `SCATTER`, `BUBBLE`, `HEATMAP`, `TREEMAP`
   - **Combinations:** `COMBO_BAR_LINE`, `COMBO_AREA_LINE`
   - **Indicators:** `GAUGE`, `KPI_SINGLE`, `SPARKLINE`, `RADAR`, `RADIAL_BAR`
   - **Table:** Keep the existing HTML `<table>` renderer for the `TABLE` type.
   
   ECharts provides all of these out of the box (bar, line, scatter, pie, radar, treemap, sunburst, gauge, heatmap, etc.) — no custom SVG needed. Remove Recharts from [package.json](package.json) as a dependency since it will no longer be used. Ensure ECharts instances respond to container resize via the `autoResize` option in `echarts-for-react`.

6. **Make Field Assignment Interactive (Drag-and-Drop or Click-to-Assign)**  
   Enhance the field picker section in [components/DataPanel.jsx](components/DataPanel.jsx) so users can click a column to assign it as the chart's `dimension` or add it to `measures[]` (currently display-only). This closes the loop: assigning fields triggers the chart recommender → auto-suggests the best visual → renders dynamically.

7. **Create ECharts Option Builder Service**  
   Create `services/echartsOptionBuilder.js` — a centralized function `buildChartOption(visualType, processedData, config, theme)` that returns an ECharts `option` object. This encapsulates all chart-type-specific logic (axis orientation, stack grouping, pie/donut radius, gauge pointer, radar indicator, heatmap visual map, treemap levels, etc.) and applies the current theme's color palette and background. The builder should:
   - Accept the `theme` argument (`'light'` | `'dark'`) and set `backgroundColor`, `textStyle.color`, `legend.textStyle.color`, `axisLine.lineStyle.color`, tooltip styling accordingly.
   - Use `CHART_COLORS` (light) or `CHART_COLORS_DARK` (dark) from [constants.js](constants.js) for series colors.
   - Register and use the ECharts built-in `'dark'` theme via `echarts.registerTheme()` with customizations matching the app's grey/white palette.
   - Support animation toggles and responsive `grid` margins.

### Further Considerations

1. **Chart color palette in dark mode:** Should chart fill colors also adapt to dark backgrounds (lighter/more vibrant series colors), or stay constant? *Recommend: adapt with a separate `CHART_COLORS_DARK` array and register a custom ECharts dark theme via `echarts.registerTheme('appDark', {...})` that applies these colors automatically.*
2. **Theme persistence scope:** Should the dark/light preference sync across pages/tabs via `localStorage`, or also respect `prefers-color-scheme` as a default? *Recommend: respect OS preference as default, allow manual override persisted in `localStorage`.*
3. **Unused components:** `SummaryPanel.jsx` and `SmartNarrative.jsx` are dead code — should they be removed to reduce maintenance, or kept as stubs for future AI narrative features? *Recommend: keep `SmartNarrative.jsx` as a stub, remove `SummaryPanel.jsx`.*
4. **ECharts bundle size:** ECharts is large (~800 KB min). Should we tree-shake by importing only required chart types (`echarts/charts`) and components (`echarts/components`) via ECharts' modular API? *Recommend: yes — use `import * as echarts from 'echarts/core'` with selective chart/component registration to cut bundle size by ~50%.*
5. **ECharts interactivity:** ECharts supports built-in interactions (brush selection, data zoom, toolbox for save-as-image/restore/data-view). Should these be exposed to the user via the toolbar or DataPanel? *Recommend: enable `toolbox` (save image, restore) and `dataZoom` (scroll zoom on time-series) by default in the option builder.*
