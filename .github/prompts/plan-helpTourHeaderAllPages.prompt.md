## Plan: Global Header Help Tour

Create a reusable guided-tour system with a single Help trigger in the header and page-specific step definitions. Use a spotlight-style tour library, add stable target markers to key UI elements, and resolve steps by current page/view state so every page gets a detailed walkthrough with Next navigation.

### Steps
1. Define current-page resolver in [App.jsx](App.jsx) using `route`, `activePage`, `isTemplateRoute`, and shared-report state.
2. Add shared tour infrastructure (`TourProvider`, `useTour()`, step registry) mounted from [index.jsx](index.jsx) or [App.jsx](App.jsx).
3. Wire `Header` Help click to start the active page tour via [components/Header.jsx](components/Header.jsx) and [App.jsx](App.jsx).
4. Add stable `data-tour` markers to core UI targets in [components/Sidebar.jsx](components/Sidebar.jsx), [components/DataSourceView.jsx](components/DataSourceView.jsx), [components/RelationshipDiagram.jsx](components/RelationshipDiagram.jsx), [components/OrgChartPage.jsx](components/OrgChartPage.jsx), and [components/Visualization.jsx](components/Visualization.jsx).
5. Create page step-definition modules for routed views from [App.jsx](App.jsx), [pages/TemplateRoutes.jsx](pages/TemplateRoutes.jsx), and template pages in [components/templates/TemplateList.jsx](components/templates/TemplateList.jsx), [components/templates/TemplateMapping.jsx](components/templates/TemplateMapping.jsx), [components/templates/HRTemplateDashboard.jsx](components/templates/HRTemplateDashboard.jsx).
6. Add resilience rules: skip missing targets, retry after async render, scroll target into view, and avoid canvas-level targets.

### Considerations
1. Library choice: `driver.js` (strong spotlight, framework-agnostic) 
2. Header visibility gap: include Help on org-chart/template route branches in [App.jsx](App.jsx).
3. Tour depth: one long detailed tour per page
