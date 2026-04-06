import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { useTheme } from '../../contexts/ThemeContext';
import { backendApi } from '../../services/backendApi';
import { buildQuery } from '../../services/queryBuilder';
import { adaptQueryResponse } from '../../services/dataAdapter';
import { buildChartOption } from '../../services/echartsOptionBuilder';
import { ChartType } from '../../types';
import RecipientEmailsModal from '../RecipientEmailsModal';

const FINANCE_CHARTS = [
    { id: 'revenue_profit_trend', page: 'executive', title: 'Revenue vs Profit Trend', type: ChartType.LINE, dimension: 'Month', dimensionRole: 'time', measures: [
        { field: 'Revenue', name: 'Revenue', aggregation: 'SUM', role: 'y' },
        { field: 'Net_Profit', name: 'Net_Profit', aggregation: 'SUM', role: 'y' },
    ], hierarchy: ['Month', 'Week'], drillGroup: 'time' },
    { id: 'revenue_entity', page: 'executive', title: 'Revenue by Legal Entity', type: ChartType.BAR, hierarchy: ['Legal_Entity', 'Business_Unit', 'Department'], measure: 'Revenue', aggregation: 'SUM', drillGroup: 'entity' },
    { id: 'profit_contribution', page: 'executive', title: 'Profit Contribution', type: ChartType.DONUT, dimension: 'Legal_Entity', dimensionRole: 'legend', measure: 'Net_Profit', aggregation: 'SUM' },

    { id: 'pnl_waterfall', page: 'pnl', title: 'P&L Waterfall', type: ChartType.BAR_WATERFALL, dimension: 'GL_Account_Name', measure: 'Actual_Amount', aggregation: 'SUM' },
    { id: 'expense_breakdown', page: 'pnl', title: 'Expense Breakdown', type: ChartType.BAR_STACKED, dimension: 'GL_Account_Name', legend: 'Legal_Entity', measure: 'Debit_Amount', aggregation: 'SUM' },
    { id: 'profit_trend', page: 'pnl', title: 'Profit Trend', type: ChartType.LINE, dimension: 'Month', dimensionRole: 'time', measure: 'Net_Profit', aggregation: 'SUM' },

    { id: 'budget_vs_actual', page: 'budget', title: 'Budget vs Actual', type: ChartType.COMBO_BAR_LINE, dimension: 'Month', dimensionRole: 'time', measures: [
        { field: 'Actual_Amount', name: 'Actual_Amount', aggregation: 'SUM', role: 'y' },
        { field: 'Budget_Amount', name: 'Budget_Amount', aggregation: 'SUM', role: 'value' },
    ] },
    { id: 'variance_department', page: 'budget', title: 'Variance by Department', type: ChartType.BAR, dimension: 'Department', measure: 'Variance', aggregation: 'SUM' },
    { id: 'achievement_heatmap', page: 'budget', title: 'Achievement % Heatmap', type: ChartType.HEATMAP, dimension: 'Legal_Entity', legend: 'Month', measure: 'Variance_%', aggregation: 'AVG' },

    { id: 'cost_by_center', page: 'cost', title: 'Cost by Cost Center', type: ChartType.BAR, dimension: 'Cost_Center_Name', measure: 'Operating_Expense', aggregation: 'SUM' },
    { id: 'fixed_variable_cost', page: 'cost', title: 'Fixed vs Variable Cost', type: ChartType.DONUT, dimension: 'Cost_Type', dimensionRole: 'legend', measure: 'Allocated_Cost', aggregation: 'SUM' },
    { id: 'cost_trend', page: 'cost', title: 'Cost Trend', type: ChartType.LINE, dimension: 'Month', dimensionRole: 'time', measure: 'Operating_Expense', aggregation: 'SUM' },

    { id: 'cash_flow_trend', page: 'cashflow', title: 'Cash Flow Trend', type: ChartType.LINE, dimension: 'Month', dimensionRole: 'time', measure: 'Net_Cash_Flow', aggregation: 'SUM' },
    { id: 'inflow_outflow', page: 'cashflow', title: 'Cash Inflow vs Outflow', type: ChartType.BAR_CLUSTERED, dimension: 'Month', dimensionRole: 'time', measures: [
        { field: 'Cash_Inflow', name: 'Cash_Inflow', aggregation: 'SUM', role: 'y' },
        { field: 'Cash_Outflow', name: 'Cash_Outflow', aggregation: 'SUM', role: 'y' },
    ] },
    { id: 'ar_aging', page: 'cashflow', title: 'AR Aging', type: ChartType.BAR, dimension: 'Days_Past_Due_Bucket', measure: 'Outstanding_Amount', aggregation: 'SUM' },

    { id: 'high_cost_units', page: 'risk', title: 'High Cost Units', type: ChartType.BAR, dimension: 'Cost_Center_Name', measure: 'Operating_Expense', aggregation: 'SUM', filterField: 'High_Cost_Flag', filterValues: ['Yes'] },
    { id: 'loss_making_units', page: 'risk', title: 'Loss Making Units', type: ChartType.BAR, dimension: 'Profit_Center_Name', measure: 'Net_Profit', aggregation: 'SUM', filterField: 'Loss_Making_Unit', filterValues: ['Yes'] },
];

const KPI_SPECS = [
    { id: 'total_revenue', label: 'Total Revenue', measure: 'Revenue', aggregation: 'SUM', format: 'currency' },
    { id: 'net_profit', label: 'Net Profit', measure: 'Net_Profit', aggregation: 'SUM', format: 'currency' },
    { id: 'profit_margin', label: 'Profit Margin %', formula: 'margin_pct', format: 'percent' },
    { id: 'ebitda', label: 'EBITDA', measure: 'EBITDA', aggregation: 'SUM', format: 'currency' },
    { id: 'achievement_pct', label: 'Achievement %', measure: 'Variance_%', aggregation: 'AVG', format: 'percent' },
];

const FILTER_FIELDS = [
    { id: 'fiscal_year', label: 'Fiscal Year', field: 'Fiscal_Year' },
    { id: 'quarter', label: 'Quarter', field: 'Quarter' },
    { id: 'legal_entity', label: 'Legal Entity', field: 'Legal_Entity' },
    { id: 'region', label: 'Region', field: 'Region' },
    { id: 'cost_center', label: 'Cost Center', field: 'Cost_Center_Name' },
];

const numberFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const currencyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};

const toServerFilters = (filters = []) => (Array.isArray(filters) ? filters : [])
    .map((filter) => {
        if (!filter?.column || !Array.isArray(filter?.values) || filter.values.length === 0) return null;
        return {
            field: filter.column,
            operator: 'IN',
            value: filter.values.map(String),
        };
    })
    .filter(Boolean);

const isIdAggregationErrorMessage = (message = '') => {
    const lower = String(message || '').toLowerCase();
    return lower.includes('invalid aggregation') && lower.includes('id field');
};

const hasUseCountHint = (message = '') => String(message || '').toLowerCase().includes('use count');

const extractIdFieldFromError = (message = '') => {
    const source = String(message || '');
    const lower = source.toLowerCase();
    const marker = 'on id field';
    const markerIndex = lower.indexOf(marker);
    if (markerIndex < 0) return '';

    let remainder = source.slice(markerIndex + marker.length).trim();
    while (remainder.startsWith('"') || remainder.startsWith("'")) remainder = remainder.slice(1);

    const stopChars = ['"', "'", '.', ',', ';', ':', ')', '(', ' '];
    let end = remainder.length;
    for (let i = 0; i < remainder.length; i += 1) {
        if (stopChars.includes(remainder[i])) {
            end = i;
            break;
        }
    }
    return remainder.slice(0, end).trim();
};

const withCountFallbackPayload = (payload = {}, idField = '') => {
    const targetField = String(idField || '').trim().toLowerCase();
    const measures = Array.isArray(payload?.measures) ? payload.measures : [];

    let downgradedCount = 0;

    const fallbackMeasures = measures.map((measure) => {
        if (!measure || typeof measure !== 'object') return measure;
        const field = String(measure.field || '').trim().toLowerCase();
        const name = String(measure.name || measure.alias || '').trim().toLowerCase();
        const agg = String(measure.aggregation || '').toUpperCase();
        const shouldDowngrade = targetField
            ? (field === targetField || name === targetField)
            : agg !== 'COUNT';

        if (!shouldDowngrade) return measure;
        downgradedCount += 1;
        return {
            ...measure,
            aggregation: 'COUNT',
            expression: undefined,
        };
    });

    const resilientMeasures = downgradedCount > 0
        ? fallbackMeasures
        : fallbackMeasures.map((measure) => {
            if (!measure || typeof measure !== 'object') return measure;
            const agg = String(measure.aggregation || '').toUpperCase();
            if (agg === 'COUNT') return measure;
            return {
                ...measure,
                aggregation: 'COUNT',
                expression: undefined,
            };
        });

    return {
        ...payload,
        measures: resilientMeasures,
    };
};

const runQuerySafe = async (payload = {}) => {
    try {
        return await backendApi.runQuery(payload);
    } catch (error) {
        const message = String(error?.message || '');
        if (!isIdAggregationErrorMessage(message) || !hasUseCountHint(message)) {
            throw error;
        }

        const fieldFromError = extractIdFieldFromError(message);

        try {
            const fallbackPayload = withCountFallbackPayload(payload, fieldFromError);
            return await backendApi.runQuery(fallbackPayload);
        } catch (retryError) {
            const retryMessage = String(retryError?.message || '');
            if (!isIdAggregationErrorMessage(retryMessage) || !hasUseCountHint(retryMessage)) {
                throw retryError;
            }

            const finalFallbackPayload = withCountFallbackPayload(payload, '');
            return await backendApi.runQuery(finalFallbackPayload);
        }
    }
};

const getFirstRowValue = (response) => {
    const firstRow = Array.isArray(response?.rows) ? response.rows[0] : null;
    if (Array.isArray(firstRow)) return toNumber(firstRow[0]);
    if (firstRow && typeof firstRow === 'object') return toNumber(Object.values(firstRow)[0]);
    return 0;
};

const runMarginPctKpiQuery = async ({ datasetId, mappedMeasureField, serverFilters }) => {
    const revenueField = mappedMeasureField('Revenue', 'SUM');
    const profitField = mappedMeasureField('Net_Profit', 'SUM');
    if (!revenueField || !profitField) return null;

    const [revRes, profitRes] = await Promise.all([
        runQuerySafe({
            datasetId,
            chartType: 'KPI_SINGLE',
            dimensions: [],
            measures: [{ name: 'Revenue', field: revenueField, aggregation: 'SUM' }],
            filters: serverFilters,
            limit: 1,
        }),
        runQuerySafe({
            datasetId,
            chartType: 'KPI_SINGLE',
            dimensions: [],
            measures: [{ name: 'Profit', field: profitField, aggregation: 'SUM' }],
            filters: serverFilters,
            limit: 1,
        }),
    ]);

    const revenue = getFirstRowValue(revRes);
    const profit = getFirstRowValue(profitRes);
    return revenue > 0 ? (profit / revenue) * 100 : 0;
};

const runStandardKpiQuery = async ({ kpi, datasetId, mappedMeasureField, serverFilters }) => {
    const measureField = mappedMeasureField(kpi.measure, kpi.aggregation || 'SUM');
    const measurePayload = [{ name: kpi.label, field: measureField, aggregation: kpi.aggregation || 'SUM' }];

    if (!measureField) return null;

    const response = await runQuerySafe({
        datasetId,
        chartType: 'KPI_SINGLE',
        dimensions: [],
        measures: measurePayload,
        filters: serverFilters,
        limit: 1,
    });

    return getFirstRowValue(response);
};

const runKpiQueryForSpec = async ({ kpi, datasetId, mappedMeasureField, globalFilterPayload }) => {
    const serverFilters = toServerFilters(globalFilterPayload);

    if (kpi.formula === 'margin_pct') {
        return runMarginPctKpiQuery({ datasetId, mappedMeasureField, serverFilters });
    }

    return runStandardKpiQuery({ kpi, datasetId, mappedMeasureField, serverFilters });
};

const isDismissOverlayKey = (key = '') => key === 'Escape' || key === 'Enter' || key === ' ';

const formatKpiValue = (kpi, value) => {
    const safe = toNumber(value);
    if (kpi.format === 'percent') return `${safe.toFixed(2)}%`;
    if (kpi.format === 'currency') return `₹${currencyFmt.format(safe)}`;
    return numberFmt.format(safe);
};

const mapResultsById = (items = [], values = []) => {
    const result = {};
    items.forEach((item, idx) => {
        const id = String(item?.id || '').trim();
        if (!id) return;
        result[id] = values[idx];
    });
    return result;
};

const joinPathSegments = (...segments) => {
    const cleaned = segments
        .map((segment) => String(segment || '').trim())
        .filter(Boolean)
        .map((segment) => {
            let value = segment;
            while (value.startsWith('/')) value = value.slice(1);
            while (value.endsWith('/')) value = value.slice(0, -1);
            return value;
        })
        .filter(Boolean);
    return `/${cleaned.join('/')}`;
};

const buildSharedDashboardUrl = ({ reportId, shareToken, pathTemplate }) => {
    const basePathRaw = String(import.meta.env.BASE_URL || '/').trim() || '/';
    const sharePath = joinPathSegments(basePathRaw, pathTemplate, encodeURIComponent(reportId));
    const url = new URL(globalThis.location.origin + sharePath);
    url.searchParams.set('shareToken', shareToken);
    return url.toString();
};

const extractDistinctSortedOptions = (rows = [], field = '') => {
    if (!Array.isArray(rows)) return [];
    const options = rows
        .map((row) => (Array.isArray(row) ? row[0] : row?.[field]))
        .filter((value) => value !== null && value !== undefined && String(value) !== '')
        .map(String);
    return Array.from(new Set(options)).sort((a, b) => a.localeCompare(b));
};

const loadSingleFilterOptions = async ({ item, datasetId, mappedField }) => {
    const field = mappedField(item.field);
    if (!field) return [item.id, []];

    const payload = {
        datasetId,
        chartType: 'TABLE',
        dimensions: [field],
        measures: [{ name: 'Count', field: '__count__', aggregation: 'COUNT' }],
        filters: [],
        sort: { field, order: 'asc' },
        limit: 250,
    };
    const response = await runQuerySafe(payload);
    return [item.id, extractDistinctSortedOptions(response?.rows, field)];
};

const buildChartAssignments = (spec, mappedField, mappedMeasureField) => {
    const assignments = [];

    if (spec.hierarchy?.length > 0) {
        spec.hierarchy.forEach((h) => {
            const field = mappedField(h);
            if (field) assignments.push({ field, role: 'hierarchy' });
        });
    }

    const dimensionField = mappedField(spec.dimension);
    if (dimensionField) {
        assignments.push({
            field: dimensionField,
            role: spec.dimensionRole === 'time' ? 'time' : (spec.dimensionRole === 'legend' ? 'legend' : 'x'),
        });
    }

    const legendField = mappedField(spec.legend);
    if (legendField) assignments.push({ field: legendField, role: 'legend' });

    if (spec.measures?.length > 0) {
        spec.measures.forEach((item) => {
            const field = mappedMeasureField(item.field, item.aggregation || 'SUM');
            if (!field) return;
            assignments.push({
                field,
                role: item.role || 'y',
                aggregation: item.aggregation || 'SUM',
            });
        });
    } else if (spec.measure) {
        const measureField = mappedMeasureField(spec.measure, spec.aggregation || 'SUM');
        if (measureField) {
            assignments.push({
                field: measureField,
                role: spec.type === ChartType.DONUT ? 'value' : 'y',
                aggregation: spec.aggregation || 'SUM',
            });
        }
    }

    return assignments;
};

const resolveDrillChartSpec = ({ spec, mappedField, drillState, datasetId }) => {
    if (!spec.drillGroup || !Array.isArray(spec.hierarchy) || spec.hierarchy.length === 0) return spec;

    const path = Array.isArray(drillState?.[spec.drillGroup]) ? drillState[spec.drillGroup] : [];
    const levelIndex = Math.min(path.length, spec.hierarchy.length - 1);

    return {
        ...spec,
        dimension: spec.hierarchy[levelIndex],
        extraFilters: path.map((entry) => {
            const field = mappedField(entry.logicalField);
            if (!field) return null;
            return { column: field, type: 'include', values: [String(entry.value)], columnType: 'string', datasetId };
        }).filter(Boolean),
    };
};

const runFinanceChartSpecQuery = async ({
    rawSpec,
    mappedField,
    mappedMeasureField,
    drillState,
    datasetId,
    dataset,
    globalFilterPayload,
    isDark,
}) => {
    const drillResolvedSpec = resolveDrillChartSpec({
        spec: rawSpec,
        mappedField,
        drillState,
        datasetId,
    });

    const runtimeFilters = [...(drillResolvedSpec.extraFilters || [])];
    if (drillResolvedSpec.filterField && Array.isArray(drillResolvedSpec.filterValues) && drillResolvedSpec.filterValues.length > 0) {
        const field = mappedField(drillResolvedSpec.filterField);
        if (field) {
            runtimeFilters.push({
                column: field,
                type: 'include',
                values: drillResolvedSpec.filterValues.map(String),
                columnType: 'string',
                datasetId,
            });
        }
    }

    const assignments = buildChartAssignments(drillResolvedSpec, mappedField, mappedMeasureField);
    if (assignments.length === 0) {
        return { error: 'Required mapped fields are unavailable for this chart.' };
    }

    const dimensionField = mappedField(drillResolvedSpec.dimension);
    const config = {
        id: drillResolvedSpec.id,
        datasetId,
        type: drillResolvedSpec.type,
        dimension: dimensionField,
        measures: drillResolvedSpec.measure ? [mappedMeasureField(drillResolvedSpec.measure, drillResolvedSpec.aggregation || 'SUM')].filter(Boolean) : [],
        assignments,
        hierarchyFields: (drillResolvedSpec.hierarchy || []).map((h) => mappedField(h)).filter(Boolean),
        aggregation: drillResolvedSpec.aggregation || 'SUM',
        filters: [],
        style: drillResolvedSpec.type === ChartType.COMBO_BAR_LINE ? { seriesTypes: ['bar', 'line'] } : {},
    };

    const payload = buildQuery({
        config,
        dataset,
        datasetId,
        globalFilters: [...globalFilterPayload, ...runtimeFilters],
        drillPath: [],
        effectiveDimension: dimensionField,
    });

    const response = await runQuerySafe(payload);
    const adapted = adaptQueryResponse(response, {
        chartType: drillResolvedSpec.type,
        dimensionFields: payload.dimensions,
        measures: payload.measures,
        hierarchyFields: config.hierarchyFields,
    });

    const option = buildChartOption(
        drillResolvedSpec.type,
        adapted.rows,
        config,
        isDark ? 'dark' : 'light',
        'clear',
        'vibrant'
    );

    return {
        option,
        rows: adapted.rows,
        config,
        spec: drillResolvedSpec,
    };
};

const KpiCard = ({ title, value, hint, isDark }) => (
    <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{title}</p>
        <h3 className={`mt-2 text-3xl font-black ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{value}</h3>
        {hint ? <p className={`mt-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{hint}</p> : null}
    </div>
);

const ChartCard = ({ title, option, isDark, onEvents, height = 320 }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <>
            <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className={`text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
                    <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        className={`rounded-lg border px-2 py-1 text-xs font-semibold ${isDark ? 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                        Expand
                    </button>
                </div>
                <ReactECharts option={option} style={{ width: '100%', height }} notMerge lazyUpdate onEvents={onEvents} />
            </div>

            {expanded && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
                    onClick={() => setExpanded(false)}
                    onKeyDown={(event) => {
                        if (isDismissOverlayKey(event.key)) {
                            setExpanded(false);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                >
                    <div
                        className={`relative h-[92vh] w-[96vw] rounded-2xl border p-4 ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-2 flex items-center justify-between gap-4">
                            <h3 className={`text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
                            <button
                                type="button"
                                onClick={() => setExpanded(false)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${isDark ? 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                            >
                                Close
                            </button>
                        </div>

                        <ReactECharts option={option} style={{ width: '100%', height: 'calc(92vh - 90px)' }} notMerge lazyUpdate onEvents={onEvents} />
                    </div>
                </div>
            )}
        </>
    );
};

const TemplateStateCard = ({ isDark, children }) => (
    <section className={`cv-template-page ${isDark ? 'cv-template-page--dark' : ''}`}>
        <div className="cv-state-card">{children}</div>
    </section>
);

const FinanceMappedFieldsCard = ({ isDark, mappedFields }) => (
    <div className={`rounded-2xl border p-4 mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h3 className={`text-sm font-bold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Mapped Fields</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs">
            {mappedFields.map(([field, column]) => (
                <div key={field} className={`px-2 py-1 rounded border ${isDark ? 'border-gray-600 bg-gray-900 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                    <strong>{field}</strong> → {column}
                </div>
            ))}
        </div>
    </div>
);

const FinanceKpiGrid = ({ isDark, kpiResults }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-4">
        {KPI_SPECS.map((kpi) => (
            <KpiCard
                key={kpi.id}
                title={kpi.label}
                value={formatKpiValue(kpi, kpiResults[kpi.id])}
                hint="Query-driven KPI"
                isDark={isDark}
            />
        ))}
    </div>
);

const FinanceDashboardNotices = ({ loading, error, missingMappedFields }) => (
    <>
        {missingMappedFields.length > 0 ? (
            <div className="cv-validation-summary">
                <p>Partial analysis mode: unmapped fields ({missingMappedFields.join(', ')}).</p>
            </div>
        ) : null}

        {loading ? <div className="cv-state-card">Generating Finance analytics...</div> : null}
        {!loading && error ? <div className="cv-validation-summary"><p>{error}</p></div> : null}
    </>
);

const BudgetExceededTable = ({ datasetId, mappedField, mappedMeasureField, globalFilterPayload, isDark }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let mounted = true;

        const load = async () => {
            const department = mappedField('Department');
            const variance = mappedMeasureField('Variance', 'SUM');
            const variancePct = mappedMeasureField('Variance_%', 'AVG');
            const budgetExceededFlag = mappedField('Budget_Exceeded_Flag');

            if (!department || !variance || !variancePct) {
                if (mounted) setRows([]);
                return;
            }

            setLoading(true);
            try {
                const serverFilters = toServerFilters(globalFilterPayload);
                if (budgetExceededFlag) {
                    serverFilters.push({ field: budgetExceededFlag, operator: 'IN', value: ['Yes'] });
                }

                const response = await runQuerySafe({
                    datasetId,
                    chartType: 'TABLE',
                    dimensions: [department],
                    measures: [
                        { name: 'Variance', field: variance, aggregation: 'SUM' },
                        { name: 'Variance_%', field: variancePct, aggregation: 'AVG' },
                    ],
                    filters: serverFilters,
                    sort: { field: 'Variance', order: 'desc' },
                    limit: 30,
                });

                const normalizedRows = Array.isArray(response?.rows)
                    ? response.rows.map((row) => {
                        if (Array.isArray(row)) {
                            return {
                                department: row[0],
                                variance: toNumber(row[1]),
                                variancePct: toNumber(row[2]),
                            };
                        }
                        return {
                            department: row?.[department],
                            variance: toNumber(row?.Variance),
                            variancePct: toNumber(row?.['Variance_%']),
                        };
                    })
                    : [];

                if (mounted) setRows(normalizedRows);
            } catch {
                if (mounted) setRows([]);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        load();
        return () => {
            mounted = false;
        };
    }, [datasetId, mappedField, mappedMeasureField, globalFilterPayload]);

    if (loading) return <p className={isDark ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>Loading budget exceeded table...</p>;
    if (rows.length === 0) return <p className={isDark ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>No budget exceeded rows available.</p>;

    return (
        <div className="overflow-auto">
            <table className="min-w-full text-sm">
                <thead>
                    <tr className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                        <th className="text-left py-2 pr-4">Department</th>
                        <th className="text-right py-2 pr-4">Variance</th>
                        <th className="text-right py-2">Variance %</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const rowKey = `${String(row.department || 'dept')}-${toNumber(row.variance)}-${toNumber(row.variancePct)}`;
                        return (
                            <tr key={rowKey} className={isDark ? 'text-gray-200 border-t border-gray-700' : 'text-gray-800 border-t border-gray-200'}>
                                <td className="py-2 pr-4">{row.department}</td>
                                <td className="py-2 pr-4 text-right">₹{currencyFmt.format(row.variance)}</td>
                                <td className="py-2 text-right">{row.variancePct.toFixed(2)}%</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const APAnalysisTable = ({ datasetId, mappedField, mappedMeasureField, globalFilterPayload, isDark }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let mounted = true;

        const load = async () => {
            const vendor = mappedField('Vendor_ID');
            const dueDate = mappedField('Due_Date');
            const outstanding = mappedMeasureField('Outstanding_Amount', 'SUM');

            if (!vendor || !dueDate || !outstanding) {
                if (mounted) setRows([]);
                return;
            }

            setLoading(true);
            try {
                const response = await runQuerySafe({
                    datasetId,
                    chartType: 'TABLE',
                    dimensions: [vendor, dueDate],
                    measures: [{ name: 'Outstanding_Amount', field: outstanding, aggregation: 'SUM' }],
                    filters: toServerFilters(globalFilterPayload),
                    sort: { field: 'Outstanding_Amount', order: 'desc' },
                    limit: 30,
                });

                const normalizedRows = Array.isArray(response?.rows)
                    ? response.rows.map((row) => {
                        if (Array.isArray(row)) {
                            return {
                                vendor: row[0],
                                dueDate: row[1],
                                outstanding: toNumber(row[2]),
                            };
                        }

                        return {
                            vendor: row?.[vendor],
                            dueDate: row?.[dueDate],
                            outstanding: toNumber(row?.Outstanding_Amount),
                        };
                    })
                    : [];

                if (mounted) setRows(normalizedRows);
            } catch {
                if (mounted) setRows([]);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        load();
        return () => {
            mounted = false;
        };
    }, [datasetId, mappedField, mappedMeasureField, globalFilterPayload]);

    if (loading) return <p className={isDark ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>Loading AP table...</p>;
    if (rows.length === 0) return <p className={isDark ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>No AP rows available.</p>;

    return (
        <div className="overflow-auto">
            <table className="min-w-full text-sm">
                <thead>
                    <tr className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                        <th className="text-left py-2 pr-4">Vendor ID</th>
                        <th className="text-right py-2 pr-4">Outstanding</th>
                        <th className="text-left py-2">Due Date</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const rowKey = `${String(row.vendor || 'vendor')}-${String(row.dueDate || 'due')}-${toNumber(row.outstanding)}`;
                        return (
                            <tr key={rowKey} className={isDark ? 'text-gray-200 border-t border-gray-700' : 'text-gray-800 border-t border-gray-200'}>
                                <td className="py-2 pr-4">{row.vendor}</td>
                                <td className="py-2 pr-4 text-right">₹{currencyFmt.format(row.outstanding)}</td>
                                <td className="py-2">{String(row.dueDate || '-')}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const FinanceTemplateDashboard = ({ sessionByTemplate, dataset = null, isSharedView = false }) => {
    const { id } = useParams();
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const session = sessionByTemplate?.[id] || null;
    const mapping = session?.mapping || null;
    const missingMappedFields = Array.isArray(session?.missingFields) ? session.missingFields : [];

    const datasetId = dataset?.id || null;
    const datasetColumns = Array.isArray(dataset?.columns) ? dataset.columns : [];
    const datasetColumnSet = useMemo(() => new Set(datasetColumns.map((col) => col?.name).filter(Boolean)), [datasetColumns]);
    const datasetColumnTypeMap = useMemo(() => {
        const map = new Map();
        datasetColumns.forEach((col) => {
            if (!col?.name) return;
            map.set(col.name, String(col.type || '').toLowerCase() || 'string');
        });
        return map;
    }, [datasetColumns]);

    const [globalFilters, setGlobalFilters] = useState({});
    const [filterOptions, setFilterOptions] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [chartResults, setChartResults] = useState({});
    const [kpiResults, setKpiResults] = useState({});
    const [interactionFilter, setInteractionFilter] = useState(null);
    const [drillState, setDrillState] = useState({ entity: [], time: [] });
    const [isSharingDashboard, setIsSharingDashboard] = useState(false);
    const [showRecipientEmailsModal, setShowRecipientEmailsModal] = useState(false);

    const mappedField = useMemo(() => (logicalField) => {
        const mapped = mapping?.[logicalField];
        if (mapped && datasetColumnSet.has(mapped)) return mapped;
        if (datasetColumnSet.has(logicalField)) return logicalField;
        return '';
    }, [mapping, datasetColumnSet]);

    const mappedMeasureField = useMemo(() => (logicalField, aggregation = 'SUM') => {
        const field = mappedField(logicalField);
        if (!field) return '';

        const agg = String(aggregation || 'COUNT').toUpperCase();
        if (agg === 'COUNT') return field;

        const fieldType = datasetColumnTypeMap.get(field) || 'string';
        if (fieldType === 'number') return field;
        return '';
    }, [mappedField, datasetColumnTypeMap]);

    const globalFilterPayload = useMemo(() => {
        const filters = [];
        FILTER_FIELDS.forEach((item) => {
            const selectedValue = globalFilters[item.id];
            const field = mappedField(item.field);
            if (!field || !selectedValue) return;
            filters.push({
                column: field,
                type: 'include',
                values: [String(selectedValue)],
                columnType: 'string',
                datasetId,
            });
        });

        if (interactionFilter?.field && interactionFilter?.value) {
            filters.push({
                column: interactionFilter.field,
                type: 'include',
                values: [String(interactionFilter.value)],
                columnType: 'string',
                datasetId,
            });
        }

        return filters;
    }, [globalFilters, interactionFilter, mappedField, datasetId]);

    const shareDashboardWithRecipients = async (recipientEmails = []) => {
        if (isSharedView || isSharingDashboard) return;
        if (!mapping || !datasetId) {
            globalThis.alert?.('Dashboard data is not ready to share yet.');
            return;
        }
        if (recipientEmails.length === 0) {
            globalThis.alert?.('Please add at least one recipient email.');
            return;
        }

        setIsSharingDashboard(true);
        try {
            const payload = {
                name: `Finance Dashboard ${new Date().toLocaleString()}`,
                pages: [{ id: 'finance-dashboard', name: 'Finance Dashboard' }],
                charts: [
                    {
                        id: 'finance-template-dashboard-snapshot',
                        type: 'finance-template-dashboard',
                        payload: {
                            templateId: id || 'finance',
                            mapping,
                            missingFields: missingMappedFields,
                            dataset: {
                                id: dataset?.id,
                                name: dataset?.name,
                                columns: Array.isArray(dataset?.columns) ? dataset.columns : [],
                                data: Array.isArray(dataset?.data) ? dataset.data : [],
                            },
                        },
                    },
                ],
                global_filters: [],
                selected_dataset_id: dataset?.id || null,
                active_page_id: 'finance-dashboard',
            };

            const created = await backendApi.createReport(payload);
            const reportId = String(created?.report?.id || '').trim();
            if (!reportId) throw new Error('Unable to save dashboard snapshot for sharing');

            const shareResponse = await backendApi.createReportShare(reportId, {
                role: 'viewer',
                expires_in_hours: 168,
                recipient_emails: recipientEmails,
            });

            const shareToken = String(shareResponse?.share?.token || '').trim();
            if (!shareToken) throw new Error('Share token was not returned');

            const finalUrl = buildSharedDashboardUrl({
                reportId,
                shareToken,
                pathTemplate: '/templates/finance/dashboard/shared',
            });

            if (globalThis.navigator?.clipboard?.writeText) {
                await globalThis.navigator.clipboard.writeText(finalUrl);
                globalThis.alert?.('Finance dashboard share link copied to clipboard.');
                return;
            }

            globalThis.prompt?.('Copy your Finance dashboard share link:', finalUrl);
        } catch (shareError) {
            globalThis.alert?.(shareError?.message || 'Unable to generate Finance dashboard share link.');
        } finally {
            setIsSharingDashboard(false);
        }
    };

    const shareDashboard = () => {
        if (isSharedView || isSharingDashboard) return;
        if (!mapping || !datasetId) {
            globalThis.alert?.('Dashboard data is not ready to share yet.');
            return;
        }

        setShowRecipientEmailsModal(true);
    };

    useEffect(() => {
        let isMounted = true;

        const loadFilterOptions = async () => {
            if (!datasetId || !mapping) return;
            try {
                const entries = await Promise.all(
                    FILTER_FIELDS.map((item) => loadSingleFilterOptions({ item, datasetId, mappedField }))
                );
                if (!isMounted) return;
                setFilterOptions(Object.fromEntries(entries));
            } catch {
                if (!isMounted) return;
                setFilterOptions({});
            }
        };

        loadFilterOptions();
        return () => {
            isMounted = false;
        };
    }, [datasetId, mapping, mappedField]);

    const runChartQuery = async (rawSpec) => runFinanceChartSpecQuery({
        rawSpec,
        mappedField,
        mappedMeasureField,
        drillState,
        datasetId,
        dataset,
        globalFilterPayload,
        isDark,
    });

    const runKpiQuery = async (kpi) => runKpiQueryForSpec({
        kpi,
        datasetId,
        mappedMeasureField,
        globalFilterPayload,
    });

    useEffect(() => {
        let isMounted = true;

        const loadPageData = async () => {
            if (id !== 'finance' || !datasetId || !mapping) return;

            setLoading(true);
            setError('');
            try {
                const [chartPayloads, kpiPayloads] = await Promise.all([
                    Promise.all(FINANCE_CHARTS.map((chart) => runChartQuery(chart))),
                    Promise.all(KPI_SPECS.map((kpi) => runKpiQuery(kpi))),
                ]);

                if (!isMounted) return;

                setChartResults((prev) => ({ ...prev, ...mapResultsById(FINANCE_CHARTS, chartPayloads) }));
                setKpiResults((prev) => ({ ...prev, ...mapResultsById(KPI_SPECS, kpiPayloads) }));
            } catch (err) {
                if (!isMounted) return;
                setError(err?.message || 'Failed to load Finance analytics');
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadPageData();
        return () => {
            isMounted = false;
        };
    }, [id, datasetId, mapping, globalFilterPayload, drillState, isDark]);

    const onChartClick = (chartSpec) => (params) => {
        if (!params?.name) return;

        if (chartSpec.drillGroup && Array.isArray(chartSpec.hierarchy) && chartSpec.hierarchy.length > 0) {
            setDrillState((prev) => {
                const currentPath = Array.isArray(prev[chartSpec.drillGroup]) ? prev[chartSpec.drillGroup] : [];
                const levelIndex = Math.min(currentPath.length, chartSpec.hierarchy.length - 1);
                if (levelIndex >= chartSpec.hierarchy.length - 1) return prev;

                return {
                    ...prev,
                    [chartSpec.drillGroup]: [
                        ...currentPath,
                        { logicalField: chartSpec.hierarchy[levelIndex], value: String(params.name) },
                    ],
                };
            });
            return;
        }

        const dimField = mappedField(chartSpec.dimension);
        if (!dimField) return;
        setInteractionFilter({ field: dimField, value: String(params.name), sourceChartId: chartSpec.id });
    };

    const mappedFields = useMemo(() => Object.entries(mapping || {}).filter(([, value]) => value), [mapping]);
    const isPageReady = !loading && !error;

    const renderSectionCharts = (pageId, columns = 'grid-cols-1 xl:grid-cols-2') => {
        const pageCharts = FINANCE_CHARTS.filter((chart) => chart.page === pageId);
        if (pageCharts.length === 0) return null;

        return (
            <div className={`grid ${columns} gap-4`}>
                {pageCharts.map((chart) => {
                    const result = chartResults[chart.id] || {};
                    return (
                        <ChartCard
                            key={chart.id}
                            title={chart.title}
                            option={result.option || {}}
                            isDark={isDark}
                            onEvents={{ click: onChartClick(chart) }}
                            height={chart.type === ChartType.HEATMAP ? 360 : 320}
                        />
                    );
                })}
            </div>
        );
    };

    const drillLabel = (groupName) => {
        const items = Array.isArray(drillState?.[groupName]) ? drillState[groupName] : [];
        return items.length > 0 ? items.map((entry) => `${entry.logicalField}: ${entry.value}`).join(' → ') : '';
    };

    if (id !== 'finance') return <TemplateStateCard isDark={isDark}>Dashboard is available only for Finance template. <Link to="/templates">Go back</Link></TemplateStateCard>;

    if (!session || !mapping) return <TemplateStateCard isDark={isDark}>Mapping not found. Please map your template fields first. <Link to="/templates/finance/map">Go to mapping</Link></TemplateStateCard>;

    if (!datasetId) return <TemplateStateCard isDark={isDark}>No dataset selected for Finance analytics.</TemplateStateCard>;

    return (
        <section className={`cv-template-page ${isDark ? 'cv-template-page--dark' : ''}`}>
            <header className="cv-template-page__header cv-template-page__header--map">
                <div>
                    <h1>Finance Analytics Dashboard</h1>
                    <p>CFO-ready decision dashboard with financial performance, budget, cost, cashflow, and risk insights.</p>
                </div>
                <div className="flex items-center gap-2">
                    {!isSharedView && (
                        <button
                            type="button"
                            onClick={shareDashboard}
                            disabled={isSharingDashboard}
                            className={`cv-btn ${isSharingDashboard ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                            {isSharingDashboard ? 'Preparing Share Link...' : 'Share Dashboard'}
                        </button>
                    )}
                    {!isSharedView ? <Link className="cv-btn cv-btn--ghost" to="/templates/finance/map">Back to Mapping</Link> : null}
                </div>
            </header>

            <FinanceDashboardNotices loading={loading} error={error} missingMappedFields={missingMappedFields} />

            <div className={`rounded-2xl border p-4 mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h3 className={`text-sm font-bold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Global Filters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                    {FILTER_FIELDS.map((item) => (
                        <label key={item.id} className="cv-field-select">
                            <span>{item.label}</span>
                            <select
                                value={globalFilters[item.id] || ''}
                                onChange={(event) => setGlobalFilters((prev) => ({ ...prev, [item.id]: event.target.value || '' }))}
                            >
                                <option value="">All</option>
                                {(filterOptions[item.id] || []).map((value) => (
                                    <option key={`${item.id}-${value}`} value={value}>{value}</option>
                                ))}
                            </select>
                        </label>
                    ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="cv-btn cv-btn--ghost" onClick={() => setGlobalFilters({})}>Reset Filters</button>
                    <button type="button" className="cv-btn cv-btn--ghost" onClick={() => setInteractionFilter(null)}>Clear Cross-Filter</button>
                    {drillState.entity?.length > 0 ? (
                        <button type="button" className="cv-btn cv-btn--ghost" onClick={() => setDrillState((prev) => ({ ...prev, entity: prev.entity.slice(0, -1) }))}>Entity Drill Up</button>
                    ) : null}
                    {drillState.time?.length > 0 ? (
                        <button type="button" className="cv-btn cv-btn--ghost" onClick={() => setDrillState((prev) => ({ ...prev, time: prev.time.slice(0, -1) }))}>Time Drill Up</button>
                    ) : null}
                </div>
            </div>

            <FinanceMappedFieldsCard isDark={isDark} mappedFields={mappedFields} />

            {isPageReady ? (
                <>
                    <FinanceKpiGrid isDark={isDark} kpiResults={kpiResults} />

                    <div className={`rounded-2xl border p-4 mt-4 mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <h2 className={`mb-3 text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Executive Finance Overview</h2>
                        {renderSectionCharts('executive')}
                    </div>

                    {drillState.entity?.length > 0 && (
                        <div className={`rounded-2xl border p-4 mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                            <h3 className={`mb-2 text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Entity Drill Path</h3>
                            <p className={isDark ? 'text-gray-300 text-sm' : 'text-gray-700 text-sm'}>{drillLabel('entity')}</p>
                        </div>
                    )}

                    {drillState.time?.length > 0 && (
                        <div className={`rounded-2xl border p-4 mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                            <h3 className={`mb-2 text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Time Drill Path</h3>
                            <p className={isDark ? 'text-gray-300 text-sm' : 'text-gray-700 text-sm'}>{drillLabel('time')}</p>
                        </div>
                    )}

                    <div className={`rounded-2xl border p-4 mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <h2 className={`mb-3 text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>P&L Analysis</h2>
                        {renderSectionCharts('pnl')}
                    </div>

                    <div className={`rounded-2xl border p-4 mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <h2 className={`mb-3 text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Budget vs Actual</h2>
                        {renderSectionCharts('budget')}
                    </div>

                    <div className={`rounded-2xl border p-4 mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <h2 className={`mb-3 text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Cost Analysis</h2>
                        {renderSectionCharts('cost')}
                    </div>

                    <div className={`rounded-2xl border p-4 mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <h2 className={`mb-3 text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Cash Flow & AR/AP</h2>
                        {renderSectionCharts('cashflow')}

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
                            <div className={`rounded-xl border p-4 ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                                <h3 className={`mb-3 text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>AP Analysis</h3>
                                <APAnalysisTable
                                    datasetId={datasetId}
                                    mappedField={mappedField}
                                    mappedMeasureField={mappedMeasureField}
                                    globalFilterPayload={globalFilterPayload}
                                    isDark={isDark}
                                />
                            </div>
                        </div>
                    </div>

                    <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <h2 className={`mb-3 text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Risk & Anomaly Dashboard</h2>
                        {renderSectionCharts('risk')}
                        <div className={`rounded-xl border p-4 mt-4 ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                            <h3 className={`mb-3 text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Budget Exceeded</h3>
                            <BudgetExceededTable
                                datasetId={datasetId}
                                mappedField={mappedField}
                                mappedMeasureField={mappedMeasureField}
                                globalFilterPayload={globalFilterPayload}
                                isDark={isDark}
                            />
                        </div>
                    </div>
                </>
            ) : null}

            <RecipientEmailsModal
                isOpen={showRecipientEmailsModal}
                isSubmitting={isSharingDashboard}
                title="Share Finance Dashboard"
                description="Enter recipient emails (comma separated) to generate a share link."
                confirmLabel="Generate Link"
                onClose={() => setShowRecipientEmailsModal(false)}
                onSubmit={async (recipientEmails) => {
                    setShowRecipientEmailsModal(false);
                    await shareDashboardWithRecipients(recipientEmails);
                }}
            />
        </section>
    );
};

export default FinanceTemplateDashboard;
