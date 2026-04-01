import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

let activeDriver = null;

const STEP = (element, title, description, side = 'bottom') => ({
    element,
    popover: {
        title,
        description,
        side,
        align: 'start',
    },
});

const TOUR_STEPS = {
    'app-shell': [
        STEP('[data-tour="header-root"]', 'Global Header', 'This top header is available across the app. Use it to navigate, search, switch themes, and launch contextual help tours.'),
        STEP('[data-tour="sidebar-root"]', 'Sidebar Navigation', 'Use the sidebar to switch between data preparation, source management, report design, templates, relationships, merge, and profiling workflows.'),
    ],
    data: [
        STEP('[data-tour="header-help"]', 'Help Button', 'Click this button anytime to restart the tour for the current page.'),
        STEP('[data-tour="sidebar-data"]', 'Data Hub Menu', 'This nav entry brings you to the Data Hub where all ingestion and dataset organization begins.'),
        STEP('[data-tour="datahub-header"]', 'Data Hub Overview', 'This area explains the purpose of the page and highlights your current workspace context.'),
        STEP('[data-tour="datahub-upload-btn"]', 'Add New File', 'Upload CSV/Excel files here. Uploaded files are ingested and become available as datasets for report building.'),
        STEP('[data-tour="datahub-merge-btn"]', 'Merge Datasets', 'When multiple datasets exist, this opens merge workflows so you can combine sources for richer analysis.'),
        STEP('[data-tour="datahub-company-tabs"]', 'Company Tabs', 'Group datasets by company/business unit. This keeps multi-entity projects organized and filterable.'),
        STEP('[data-tour="datahub-filters"]', 'Search and Date Filters', 'Use text and date filters to quickly narrow datasets by metadata, columns, and ingestion period.'),
        STEP('[data-tour="datahub-dataset-list"]', 'Dataset Cards', 'Each card shows dataset details, preview/profile actions, source metadata, company assignment, and column dictionary.'),
    ],
    'source-config': [
        STEP('[data-tour="sidebar-source-config"]', 'Source Config Menu', 'Open this section to register reusable API/SFTP source configurations.'),
        STEP('[data-tour="source-config-header"]', 'Source Configuration Page', 'Manage external source definitions and run ingestion without re-uploading files manually.'),
        STEP('[data-tour="source-config-type-toggle"]', 'Source Type Toggle', 'Switch between API and SFTP modes to configure source-specific connection fields.'),
        STEP('[data-tour="source-config-save"]', 'Save Config', 'Persists current source configuration so it can be reused for future ingestion runs.'),
        STEP('[data-tour="source-config-ingest"]', 'Ingest Current', 'Runs ingestion immediately for the current source_id and fetches new dataset snapshots.'),
        STEP('[data-tour="source-config-refresh"]', 'Refresh Configs', 'Reloads source configs from backend to reflect latest saved changes.'),
    ],
    report: [
        STEP('[data-tour="sidebar-report"]', 'Report View Menu', 'This is where interactive report design, chart authoring, and storytelling happen.'),
        STEP('[data-tour="report-header"]', 'Report Header', 'Shows report context and top-level controls for mode, dataset, chart actions, and settings.'),
        STEP('[data-tour="report-toolbar"]', 'Toolbar Controls', 'Core controls for selecting datasets, opening settings, adding visuals, and navigating report actions.'),
        STEP('[data-tour="report-settings-btn"]', 'Report Settings', 'Open export/share/chart quality options for the current report page.'),
        STEP('[data-tour="report-add-visual-btn"]', 'Add Visual', 'Creates a new chart container on the canvas. Then configure it in the right-side panel.'),
        STEP('[data-tour="report-canvas"]', 'Report Canvas', 'Drag, resize, and arrange visuals on this canvas. This is your main layout design surface.'),
        STEP('[data-tour="report-visual-card"]', 'Visual Container', 'Each container is an individual chart. Click one in edit mode to configure it and remove it if needed.'),
        STEP('[data-tour="report-config-panel"]', 'Configuration Panel', 'Use this panel to map fields, select chart types, configure filters, and tune visual behavior.'),
    ],
    'report-shared': [
        STEP('[data-tour="report-root"]', 'Shared Report Mode', 'You are viewing a shared report. Editing controls are hidden for viewer-safe access.'),
        STEP('[data-tour="report-canvas"]', 'Read-Only Canvas', 'Visuals are still interactive for exploration, but structural edits are disabled in shared mode.'),
    ],
    relationships: [
        STEP('[data-tour="sidebar-relationships"]', 'Relationships Menu', 'Use this page to understand structural links across datasets by shared columns.'),
        STEP('[data-tour="relationships-header"]', 'Relationship Summary', 'Shows dataset and inferred connection counts to quickly assess model complexity.'),
        STEP('[data-tour="relationships-diagram"]', 'Relationship Diagram', 'Interactive graph where nodes are datasets and edges represent inferred shared fields.'),
    ],
    profiler: [
        STEP('[data-tour="sidebar-profiler"]', 'Profiler Menu', 'Open profiler workflows to evaluate data quality and column-level behavior.'),
        STEP('[data-tour="profiler-root"]', 'Profiler Launch Area', 'Select a dataset from here to open detailed profiling and diagnostics views.'),
    ],
    merge: [
        STEP('[data-tour="sidebar-merge"]', 'Merge Menu', 'Use this flow to combine datasets into analysis-ready merged outputs.'),
        STEP('[data-tour="merge-root"]', 'Merge Workspace', 'Start merge builder, choose join strategy, and produce a new merged dataset for reporting.'),
    ],
    'org-chart': [
        STEP('[data-tour="orgchart-header"]', 'Org Explorer Header', 'Contains back navigation, chart selector, UI variant mode, and global expand/collapse controls.'),
        STEP('[data-tour="orgchart-filters"]', 'Search and Filters', 'Refine organizational view by employee search, department, location, role, manager, and level.'),
        STEP('[data-tour="orgchart-zoom-controls"]', 'Zoom Controls', 'Adjust zoom, reset perspective, and inspect dense org trees comfortably.'),
        STEP('[data-tour="orgchart-canvas"]', 'Org Chart Canvas', 'Interactive hierarchy canvas. Click nodes to inspect metadata and lineage paths.'),
    ],
    'templates-list': [
        STEP('[data-tour="sidebar-templates"]', 'Templates Menu', 'Template workflows accelerate dashboard creation with predefined analytics structures.'),
        STEP('[data-tour="templates-list-header"]', 'Templates Overview', 'Start by selecting an analytics template that matches your domain use case.'),
        STEP('[data-tour="templates-list-grid"]', 'Template Cards', 'Each card describes capabilities and leads to mapping setup for fast dashboard generation.'),
    ],
    'templates-map': [
        STEP('[data-tour="templates-map-header"]', 'Template Mapping', 'Map required template fields to actual dataset columns before dashboard generation.'),
        STEP('[data-tour="templates-map-dataset"]', 'Dataset Selector', 'Switch the underlying dataset to remap fields for a different data source.'),
        STEP('[data-tour="templates-map-fields"]', 'Field Mapping Panel', 'Assign columns to required fields, review expected types, and handle mismatch warnings.'),
        STEP('[data-tour="templates-map-columns"]', 'Dataset Columns', 'Quick reference of available uploaded columns to speed up mapping decisions.'),
        STEP('[data-tour="templates-map-generate"]', 'Generate Dashboard', 'Build the template dashboard from current mapping. Missing fields continue in partial mode.'),
    ],
    'templates-dashboard': [
        STEP('[data-tour="templates-dashboard-header"]', 'Template Dashboard Header', 'Provides dashboard context and controls for sharing, export, and back navigation.'),
        STEP('[data-tour="templates-dashboard-share"]', 'Share Dashboard', 'Create a shareable link for viewer access to this template-generated dashboard snapshot.'),
        STEP('[data-tour="templates-dashboard-export"]', 'Export Dashboard', 'Export generated dashboard output for reporting and offline distribution.'),
        STEP('[data-tour="templates-dashboard-mapped-fields"]', 'Mapped Fields Summary', 'Displays field-to-column mappings used to generate this dashboard for auditability.'),
        STEP('[data-tour="templates-dashboard-kpis"]', 'KPI Section', 'Top-level performance indicators summarize key HR insights at a glance.'),
        STEP('[data-tour="templates-dashboard-charts"]', 'Analytics Charts', 'Detailed trend/distribution visuals provide module-level exploration and diagnostics.'),
    ],
    'templates-dashboard-shared': [
        STEP('[data-tour="templates-dashboard-root"]', 'Shared Template Dashboard', 'You are viewing a shared template dashboard in viewer mode.'),
        STEP('[data-tour="templates-dashboard-kpis"]', 'KPI Insights', 'Review headline metrics first to quickly understand organizational status.'),
        STEP('[data-tour="templates-dashboard-charts"]', 'Detailed Visuals', 'Explore deeper insights from module charts; sharing/edit controls are intentionally limited.'),
    ],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveAvailableSteps = async (steps = []) => {
    for (let i = 0; i < 3; i += 1) {
        const available = steps.filter((step) => {
            if (!step?.element) return true;
            return Boolean(document.querySelector(step.element));
        });

        if (available.length > 0) return available;
        await sleep(250);
    }

    return [];
};

export const startPageTour = async (pageKey = 'app-shell') => {
    try {
        if (activeDriver) {
            activeDriver.destroy();
            activeDriver = null;
        }

        const configured = TOUR_STEPS[pageKey] || TOUR_STEPS['app-shell'];
        const available = await resolveAvailableSteps(configured);
        if (!available.length) return;

        activeDriver = driver({
            showProgress: true,
            animate: true,
            allowClose: true,
            overlayClickBehavior: 'close',
            stagePadding: 8,
            nextBtnText: 'Next',
            prevBtnText: 'Previous',
            doneBtnText: 'Done',
            steps: available,
        });

        activeDriver.drive();
    } catch (error) {
        console.error('Unable to start page tour:', error);
    }
};

export default startPageTour;
