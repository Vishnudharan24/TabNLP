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

const SALES_CHARTS = [
    { id: 'revenue_trend', page: 'executive', title: 'Revenue Trend', type: ChartType.LINE, dimension: 'Month', dimensionRole: 'time', measure: 'Net_Revenue', aggregation: 'SUM' },
    { id: 'revenue_legal_entity', page: 'executive', title: 'Revenue by Legal Entity', type: ChartType.BAR, dimension: 'Legal_Entity', measure: 'Net_Revenue', aggregation: 'SUM' },
    { id: 'profit_contribution', page: 'executive', title: 'Profit Contribution', type: ChartType.DONUT, dimension: 'Legal_Entity', dimensionRole: 'legend', measure: 'Profit', aggregation: 'SUM' },

    { id: 'manager_performance', page: 'performance', title: 'Manager Performance', type: ChartType.BAR, dimension: 'Manager_Name', measure: 'Net_Revenue', aggregation: 'SUM' },
    { id: 'sales_rep_performance', page: 'performance', title: 'Sales Rep Performance', type: ChartType.BAR_HORIZONTAL, dimension: 'Sales_Rep', measure: 'Net_Revenue', aggregation: 'SUM' },
    { id: 'channel_analysis', page: 'performance', title: 'Channel Analysis', type: ChartType.BAR_STACKED, dimension: 'Channel', legend: 'Legal_Entity', measure: 'Net_Revenue', aggregation: 'SUM' },

    { id: 'revenue_zone', page: 'geo', title: 'Revenue by Zone', type: ChartType.BAR, dimension: 'Zone', measure: 'Net_Revenue', aggregation: 'SUM' },
    { id: 'geo_drilldown', page: 'geo', title: 'Geo Drilldown', type: ChartType.BAR, hierarchy: ['Zone', 'Region', 'Country', 'City'], measure: 'Net_Revenue', aggregation: 'SUM' },
    { id: 'territory_performance', page: 'geo', title: 'Territory Performance', type: ChartType.BAR, dimension: 'Territory', measure: 'Net_Revenue', aggregation: 'SUM' },

    { id: 'product_treemap', page: 'product', title: 'Division → Category → Subcategory Treemap', type: ChartType.TREEMAP, hierarchy: ['Division', 'Product_Category', 'Product_Subcategory'], measure: 'Net_Revenue', aggregation: 'SUM' },
    { id: 'top_products', page: 'product', title: 'Top Products', type: ChartType.BAR, dimension: 'Product_Name', measure: 'Net_Revenue', aggregation: 'SUM' },

    { id: 'discount_vs_profit', page: 'finance', title: 'Discount vs Profit', type: ChartType.SCATTER, dimension: 'Product_SKU', xMeasure: 'Discount_%', yMeasure: 'Profit', xAggregation: 'AVG', yAggregation: 'SUM' },
    { id: 'margin_analysis', page: 'finance', title: 'Margin Analysis', type: ChartType.BAR, dimension: 'Product_Category', measure: 'Profit', aggregation: 'SUM' },
    { id: 'target_vs_actual', page: 'finance', title: 'Target vs Actual', type: ChartType.COMBO_BAR_LINE, dimension: 'Month', dimensionRole: 'time', measures: [
        { field: 'Net_Revenue', name: 'Actual_Revenue', aggregation: 'SUM', role: 'y' },
        { field: 'Target_Revenue', name: 'Target_Revenue', aggregation: 'SUM', role: 'value' },
    ] },

    { id: 'delivery_performance', page: 'ops', title: 'Delivery Performance', type: ChartType.BAR, dimension: 'Delivery_Status', measure: 'Order_ID', aggregation: 'COUNT' },
    { id: 'avg_delivery_time', page: 'ops', title: 'Avg Delivery Time by Region', type: ChartType.LINE, dimension: 'Region', measure: 'Delivery_Time_Days', aggregation: 'AVG' },
    { id: 'customer_segmentation', page: 'ops', title: 'Customer Segmentation', type: ChartType.DONUT, dimension: 'Segment', dimensionRole: 'legend', measure: 'Net_Revenue', aggregation: 'SUM' },
    { id: 'churn_risk', page: 'ops', title: 'Churn Risk Analysis', type: ChartType.BAR, dimension: 'Churn_Risk', measure: 'Net_Revenue', aggregation: 'SUM' },
];

const KPI_SPECS = {
    executive: [
        { id: 'total_revenue', label: 'Total Revenue', measure: 'Net_Revenue', aggregation: 'SUM' },
        { id: 'total_profit', label: 'Total Profit', measure: 'Profit', aggregation: 'SUM' },
        { id: 'profit_margin', label: 'Profit Margin %', formula: 'margin_pct' },
        { id: 'achievement_pct', label: 'Achievement %', measure: 'Achievement_%', aggregation: 'AVG', format: 'percent' },
    ],
    performance: [
        { id: 'avg_rev_rep', label: 'Avg Revenue / Sales Rep', formula: 'avg_rev_rep', format: 'currency' },
    ],
};

const KPI_ALL = [
    ...(KPI_SPECS.executive || []),
    ...(KPI_SPECS.performance || []),
];

const FILTER_FIELDS = [
    { id: 'fiscal_year', label: 'Fiscal Year', field: 'Fiscal_Year' },
    { id: 'quarter', label: 'Quarter', field: 'Quarter' },
    { id: 'legal_entity', label: 'Legal Entity', field: 'Legal_Entity' },
    { id: 'region', label: 'Region', field: 'Region' },
    { id: 'channel', label: 'Channel', field: 'Channel' },
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

    // If backend reported a field name that doesn't exactly match payload field keys,
    // safely downgrade all non-COUNT measures as a final fallback.
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
    const revenueField = mappedMeasureField('Net_Revenue', 'SUM');
    const profitField = mappedMeasureField('Profit', 'SUM');
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

const runAvgRevenuePerRepKpiQuery = async ({ datasetId, mappedMeasureField, mappedField, serverFilters }) => {
    const revenueField = mappedMeasureField('Net_Revenue', 'SUM');
    const repField = mappedField('Sales_Rep');
    if (!revenueField || !repField) return null;

    const [revRes, repRes] = await Promise.all([
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
            chartType: 'TABLE',
            dimensions: [repField],
            measures: [{ name: 'Count', field: '__count__', aggregation: 'COUNT' }],
            filters: serverFilters,
            sort: { field: repField, order: 'asc' },
            limit: 5000,
        }),
    ]);

    const revenue = getFirstRowValue(revRes);
    const distinctReps = Array.isArray(repRes?.rows) ? repRes.rows.length : 0;
    return distinctReps > 0 ? revenue / distinctReps : 0;
};

const runStandardKpiQuery = async ({ kpi, datasetId, mappedMeasureField, serverFilters }) => {
    const measureField = mappedMeasureField(kpi.measure, kpi.aggregation || 'SUM');
    const measurePayload = kpi.measureExpression
        ? [{ name: kpi.measureName || 'Value', expression: kpi.measureExpression }]
        : [{ name: kpi.label, field: measureField, aggregation: kpi.aggregation || 'SUM' }];

    if (!kpi.measureExpression && !measureField) return null;

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

const runKpiQueryForSpec = async ({ kpi, datasetId, mappedMeasureField, mappedField, globalFilterPayload }) => {
    const serverFilters = toServerFilters(globalFilterPayload);

    if (kpi.formula === 'margin_pct') {
        return runMarginPctKpiQuery({ datasetId, mappedMeasureField, serverFilters });
    }

    if (kpi.formula === 'avg_rev_rep') {
        return runAvgRevenuePerRepKpiQuery({ datasetId, mappedMeasureField, mappedField, serverFilters });
    }

    return runStandardKpiQuery({ kpi, datasetId, mappedMeasureField, serverFilters });
};

const isDismissOverlayKey = (key = '') => key === 'Escape' || key === 'Enter' || key === ' ';

const formatKpiValue = (kpi, value) => {
    const safe = toNumber(value);
    if (kpi.format === 'percent' || kpi.id === 'profit_margin') return `${safe.toFixed(2)}%`;
    if (kpi.format === 'currency' || kpi.id.includes('revenue') || kpi.id.includes('profit')) return `₹${currencyFmt.format(safe)}`;
    return numberFmt.format(safe);
};

const createChartClickHandler = ({ mappedField, geoDrillPath, setGeoDrillPath, setInteractionFilter }) => (chartSpec) => (params) => {
    if (!params?.name) return;

    if (chartSpec.id === 'geo_drilldown') {
        const hierarchy = chartSpec.hierarchy || [];
        const levelIndex = Math.min(geoDrillPath.length, hierarchy.length - 1);
        if (levelIndex < hierarchy.length - 1) {
            setGeoDrillPath((prev) => [...prev, { logicalField: hierarchy[levelIndex], value: String(params.name) }]);
        }
        return;
    }

    const dimField = mappedField(chartSpec.dimension);
    if (!dimField) return;
    setInteractionFilter({ field: dimField, value: String(params.name), sourceChartId: chartSpec.id });
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
        limit: 200,
    };
    const response = await runQuerySafe(payload);
    return [item.id, extractDistinctSortedOptions(response?.rows, field)];
};

const runSalesChartSpecQuery = async ({
    rawSpec,
    mappedField,
    mappedMeasureField,
    geoDrillPath,
    datasetId,
    dataset,
    globalFilterPayload,
    isDark,
}) => {
    const spec = resolveGeoChartSpec({
        spec: rawSpec,
        mappedField,
        geoDrillPath,
        datasetId,
    });
    const assignments = buildChartAssignments(spec, mappedField, mappedMeasureField);
    if (assignments.length === 0) {
        return { error: 'Required mapped fields are unavailable for this chart.' };
    }

    const dimensionField = mappedField(spec.dimension);
    const config = {
        id: spec.id,
        datasetId,
        type: spec.type,
        dimension: dimensionField,
        measures: spec.measure ? [mappedMeasureField(spec.measure, spec.aggregation || 'SUM')].filter(Boolean) : [],
        assignments,
        hierarchyFields: (spec.hierarchy || []).map((h) => mappedField(h)).filter(Boolean),
        aggregation: spec.aggregation || 'SUM',
        filters: [],
        style: spec.type === ChartType.COMBO_BAR_LINE ? { seriesTypes: ['bar', 'line'] } : {},
    };

    const payload = buildQuery({
        config,
        dataset,
        datasetId,
        globalFilters: [...globalFilterPayload, ...(spec.extraFilters || [])],
        drillPath: [],
        effectiveDimension: dimensionField,
    });

    const response = await runQuerySafe(payload);
    const adapted = adaptQueryResponse(response, {
        chartType: spec.type,
        dimensionFields: payload.dimensions,
        measures: payload.measures,
        hierarchyFields: config.hierarchyFields,
        xMeasure: spec.xMeasure ? mappedField(spec.xMeasure) : undefined,
        yMeasure: spec.yMeasure ? mappedField(spec.yMeasure) : undefined,
    });

    const option = buildChartOption(
        spec.type,
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
        spec,
    };
};

const canLoadSalesPageData = ({ id, datasetId, mapping }) => (
    id === 'sales' && !!datasetId && !!mapping
);

const fetchSalesPagePayloads = async ({ runChartQuery, runKpiQuery }) => {
    const pageCharts = SALES_CHARTS;
    const [chartPayloads, kpiPayloads] = await Promise.all([
        Promise.all(pageCharts.map((chart) => runChartQuery(chart))),
        Promise.all(KPI_ALL.map((kpi) => runKpiQuery(kpi))),
    ]);
    return { pageCharts, chartPayloads, kpiPayloads };
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
    } else if (spec.xMeasure && spec.yMeasure) {
        const xField = mappedMeasureField(spec.xMeasure, spec.xAggregation || 'AVG');
        const yField = mappedMeasureField(spec.yMeasure, spec.yAggregation || 'SUM');
        if (xField) assignments.push({ field: xField, role: 'x', aggregation: spec.xAggregation || 'AVG' });
        if (yField) assignments.push({ field: yField, role: 'y', aggregation: spec.yAggregation || 'SUM' });
    } else if (spec.measure) {
        const measureField = mappedMeasureField(spec.measure, spec.aggregation || 'SUM');
        if (measureField) {
            assignments.push({
                field: measureField,
                role: spec.type === ChartType.DONUT ? 'value' : 'y',
                aggregation: spec.aggregation || 'SUM',
            });
        }
    } else if (spec.measureExpression && spec.measureName) {
        assignments.push({ role: 'y', field: spec.measureName, expression: spec.measureExpression });
    }

    return assignments;
};

const resolveGeoChartSpec = ({ spec, mappedField, geoDrillPath, datasetId }) => {
    if (spec.id !== 'geo_drilldown') return spec;
    const hierarchy = Array.isArray(spec.hierarchy) ? spec.hierarchy : [];
    const levelIndex = Math.min(geoDrillPath.length, hierarchy.length - 1);
    return {
        ...spec,
        dimension: hierarchy[levelIndex],
        extraFilters: geoDrillPath.map((entry) => {
            const field = mappedField(entry.logicalField);
            if (!field) return null;
            return { column: field, type: 'include', values: [String(entry.value)], columnType: 'string', datasetId };
        }).filter(Boolean),
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

const SalesMappedFieldsCard = ({ isDark, mappedFields }) => (
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

const SalesKpiGrid = ({ isDark, kpiResults }) => {
    if (KPI_ALL.length === 0) return null;
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            {KPI_ALL.map((kpi) => (
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
};

const SalesDashboardNotices = ({ loading, error, missingMappedFields }) => (
    <>
        {missingMappedFields.length > 0 ? (
            <div className="cv-validation-summary">
                <p>Partial analysis mode: unmapped fields ({missingMappedFields.join(', ')}).</p>
            </div>
        ) : null}

        {loading ? <div className="cv-state-card">Generating Sales analytics...</div> : null}
        {!loading && error ? <div className="cv-validation-summary"><p>{error}</p></div> : null}
    </>
);

const SalesTemplateDashboard = ({ sessionByTemplate, dataset = null, isSharedView = false }) => {
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
    const [geoDrillPath, setGeoDrillPath] = useState([]);
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
                name: `Sales Dashboard ${new Date().toLocaleString()}`,
                pages: [{ id: 'sales-dashboard', name: 'Sales Dashboard' }],
                charts: [
                    {
                        id: 'sales-template-dashboard-snapshot',
                        type: 'sales-template-dashboard',
                        payload: {
                            templateId: id || 'sales',
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
                active_page_id: 'sales-dashboard',
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
                pathTemplate: '/templates/sales/dashboard/shared',
            });

            if (globalThis.navigator?.clipboard?.writeText) {
                await globalThis.navigator.clipboard.writeText(finalUrl);
                globalThis.alert?.('Sales dashboard share link copied to clipboard.');
                return;
            }

            globalThis.prompt?.('Copy your Sales dashboard share link:', finalUrl);
        } catch (error) {
            globalThis.alert?.(error?.message || 'Unable to generate Sales dashboard share link.');
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

    const runChartQuery = async (rawSpec) => runSalesChartSpecQuery({
        rawSpec,
        mappedField,
        mappedMeasureField,
        geoDrillPath,
        datasetId,
        dataset,
        globalFilterPayload,
        isDark,
    });

    const runKpiQuery = async (kpi) => runKpiQueryForSpec({
        kpi,
        datasetId,
        mappedMeasureField,
        mappedField,
        globalFilterPayload,
    });

    useEffect(() => {
        let isMounted = true;

        const loadPageData = async () => {
            if (!canLoadSalesPageData({ id, datasetId, mapping })) return;

            setLoading(true);
            setError('');
            try {
                const { pageCharts, chartPayloads, kpiPayloads } = await fetchSalesPagePayloads({
                    runChartQuery,
                    runKpiQuery,
                });

                if (!isMounted) return;

                setChartResults((prev) => ({ ...prev, ...mapResultsById(pageCharts, chartPayloads) }));
                setKpiResults((prev) => ({ ...prev, ...mapResultsById(KPI_ALL, kpiPayloads) }));
            } catch (err) {
                if (!isMounted) return;
                setError(err?.message || 'Failed to load Sales analytics');
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadPageData();
        return () => {
            isMounted = false;
        };
    }, [id, datasetId, mapping, globalFilterPayload, geoDrillPath, isDark]);

    const mappedFields = useMemo(() => Object.entries(mapping || {}).filter(([, value]) => value), [mapping]);
    const activeCharts = useMemo(() => SALES_CHARTS, []);
    const isPageReady = !loading && !error;

    const onChartClick = createChartClickHandler({
        mappedField,
        geoDrillPath,
        setGeoDrillPath,
        setInteractionFilter,
    });

    if (id !== 'sales') return <TemplateStateCard isDark={isDark}>Dashboard is available only for Sales template. <Link to="/templates">Go back</Link></TemplateStateCard>;

    if (!session || !mapping) return <TemplateStateCard isDark={isDark}>Mapping not found. Please map your template fields first. <Link to="/templates/sales/map">Go to mapping</Link></TemplateStateCard>;

    if (!datasetId) return <TemplateStateCard isDark={isDark}>No dataset selected for Sales analytics.</TemplateStateCard>;

    return (
        <section className={`cv-template-page ${isDark ? 'cv-template-page--dark' : ''}`}>
            <header className="cv-template-page__header cv-template-page__header--map">
                <div>
                    <h1>Sales Analytics Dashboard</h1>
                    <p>Template-driven enterprise sales insights in a single-page view with global filters and drill-down support.</p>
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
                    {!isSharedView ? <Link className="cv-btn cv-btn--ghost" to="/templates/sales/map">Back to Mapping</Link> : null}
                </div>
            </header>

            <SalesDashboardNotices loading={loading} error={error} missingMappedFields={missingMappedFields} />

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
                    {geoDrillPath.length > 0 ? (
                        <button type="button" className="cv-btn cv-btn--ghost" onClick={() => setGeoDrillPath((prev) => prev.slice(0, -1))}>Geo Drill Up</button>
                    ) : null}
                </div>
            </div>

            <SalesMappedFieldsCard isDark={isDark} mappedFields={mappedFields} />

            {isPageReady ? (
                <>
                    <SalesKpiGrid isDark={isDark} kpiResults={kpiResults} />

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {activeCharts.map((chart) => {
                            const result = chartResults[chart.id] || {};
                            return (
                                <ChartCard
                                    key={chart.id}
                                    title={chart.title}
                                    option={result.option || {}}
                                    isDark={isDark}
                                    onEvents={{ click: onChartClick(chart) }}
                                    height={chart.type === ChartType.TREEMAP ? 380 : 320}
                                />
                            );
                        })}
                    </div>

                    <div className={`rounded-2xl border p-4 mt-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <h3 className={`mb-3 text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>SKU Performance</h3>
                        <SkuPerformanceTable
                            datasetId={datasetId}
                            mappedField={mappedField}
                            mappedMeasureField={mappedMeasureField}
                            globalFilterPayload={globalFilterPayload}
                            isDark={isDark}
                        />
                    </div>

                    {geoDrillPath.length > 0 && (
                        <div className={`rounded-2xl border p-4 mt-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                            <h3 className={`mb-2 text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Geo Drill Path</h3>
                            <p className={isDark ? 'text-gray-300 text-sm' : 'text-gray-700 text-sm'}>
                                {geoDrillPath.map((entry) => `${entry.logicalField}: ${entry.value}`).join(' → ')}
                            </p>
                        </div>
                    )}
                </>
            ) : null}

            <RecipientEmailsModal
                isOpen={showRecipientEmailsModal}
                isSubmitting={isSharingDashboard}
                title="Share Sales Dashboard"
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

const SkuPerformanceTable = ({ datasetId, mappedField, mappedMeasureField, globalFilterPayload, isDark }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let mounted = true;

        const load = async () => {
            const sku = mappedField('Product_SKU');
            const revenue = mappedMeasureField('Net_Revenue', 'SUM');
            const profit = mappedMeasureField('Profit', 'SUM');
            if (!sku || !revenue || !profit) {
                if (mounted) setRows([]);
                return;
            }

            setLoading(true);
            try {
                const response = await runQuerySafe({
                    datasetId,
                    chartType: 'TABLE',
                    dimensions: [sku],
                    measures: [
                        { name: 'Revenue', field: revenue, aggregation: 'SUM' },
                        { name: 'Profit', field: profit, aggregation: 'SUM' },
                    ],
                    filters: toServerFilters(globalFilterPayload),
                    sort: { field: 'Revenue', order: 'desc' },
                    limit: 25,
                });

                const normalizedRows = Array.isArray(response?.rows)
                    ? response.rows.map((row) => {
                        if (Array.isArray(row)) {
                            return { sku: row[0], revenue: toNumber(row[1]), profit: toNumber(row[2]) };
                        }
                        return {
                            sku: row?.[sku] || row?.name,
                            revenue: toNumber(row?.Revenue),
                            profit: toNumber(row?.Profit),
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

    if (loading) return <p className={isDark ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>Loading SKU table...</p>;
    if (rows.length === 0) return <p className={isDark ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>No SKU data available.</p>;

    return (
        <div className="overflow-auto">
            <table className="min-w-full text-sm">
                <thead>
                    <tr className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                        <th className="text-left py-2 pr-4">Product SKU</th>
                        <th className="text-right py-2 pr-4">Revenue</th>
                        <th className="text-right py-2">Profit</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const rowKey = `${String(row.sku || 'sku')}-${toNumber(row.revenue)}-${toNumber(row.profit)}`;
                        return (
                            <tr key={rowKey} className={isDark ? 'text-gray-200 border-t border-gray-700' : 'text-gray-800 border-t border-gray-200'}>
                            <td className="py-2 pr-4">{row.sku}</td>
                            <td className="py-2 pr-4 text-right">₹{currencyFmt.format(row.revenue)}</td>
                            <td className="py-2 text-right">₹{currencyFmt.format(row.profit)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default SalesTemplateDashboard;