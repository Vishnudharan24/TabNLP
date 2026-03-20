## Plan: Advanced Visualization Builder Features

Add requested capabilities by extending the existing chart grid/report flow instead of rebuilding it: reuse current drag-resize layout, add template dashboards (Sales/HR/Finance), introduce chart-interaction state for drill and cross-filtering, and expand format controls to cover fonts/labels/tooltips. This minimizes risk, keeps compatibility with current saved layouts, and delivers features incrementally.

### Steps
1. Define unified visualization interaction/style schema in [types.js](types.js) for `DynamicChartConfig`, drill context, and cross-filter state.
2. Add prebuilt dashboard template registry and wiring in [App.jsx](App.jsx), [components/Sidebar.jsx](components/Sidebar.jsx), and [constants.js](constants.js).
3. Implement Sales and Finance prebuilt pages following HR pattern from [components/hr/HRAnalyticsDashboard.jsx](components/hr/HRAnalyticsDashboard.jsx).
4. Add click-driven cross-filter and drill-through flow in [components/Visualization.jsx](components/Visualization.jsx) and [components/GlobalFilterBar.jsx](components/GlobalFilterBar.jsx).
5. Expand visualization customization controls in [components/DataPanel.jsx](components/DataPanel.jsx) and map them in [services/echartsOptionBuilder.js](services/echartsOptionBuilder.js).
6. Ensure persistence/backward compatibility of new settings in [App.jsx](App.jsx) and sharing flow in [services/backendApi.js](services/backendApi.js).
7. Drill-through target: modal detail table (fast).
8. In the HR Dashboard make sure to add all the chart options and recommender logic implemented in the report view.
9. Make sure the app is a industry grade data visualization tool, if you find any flaws or anything to add inform it to me.

