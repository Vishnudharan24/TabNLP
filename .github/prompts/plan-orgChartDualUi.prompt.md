## Plan: Dual Org Chart UI in Expanded View

Add a UI style switcher to the expanded org chart page so users can toggle between the current design and a second “reference-inspired” design, while preserving existing org behavior (selection, expand/collapse, filters). Implement variant selection in the expanded page first (low risk), then branch style rendering in the centralized org option builder.

### Steps
1. Add `orgUiVariant` state and dropdown in [pages/OrgChartPage.jsx](pages/OrgChartPage.jsx) near existing expand/reset controls.
2. Pass selected variant into `buildChartOption()` config from [pages/OrgChartPage.jsx](pages/OrgChartPage.jsx) via `style.orgUiVariant`.
3. Extend org-chart branch in [services/echartsOptionBuilder.js](services/echartsOptionBuilder.js) to support `Classic (Default)` and new `Modern` style.
4. Keep current org series/card layout as default fallback in [services/echartsOptionBuilder.js](services/echartsOptionBuilder.js) to avoid regressions.
5. Update expanded chart render key in [pages/OrgChartPage.jsx](pages/OrgChartPage.jsx) to include variant, ensuring clean re-render on style switch.
6. Validate behavior parity for click-path, search, zoom, expand/collapse in [pages/OrgChartPage.jsx](pages/OrgChartPage.jsx) and org transforms in [services/echartsOptionBuilder.js](services/echartsOptionBuilder.js).

### Further Considerations
1. Variant persistence: keep page-local now (safer) or persist in chart config via [App.jsx](App.jsx) for reuse/share?
2. Dropdown labels recommendation: `Classic (Default)` and `Modern`.
3. Reference image excludes avatars; use card borders/connector emphasis/stacked text style only.
