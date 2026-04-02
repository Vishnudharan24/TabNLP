
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { ChartType } from '../types';
import { buildChartOption } from '../services/echartsOptionBuilder';
import { configFromAssignments, convertOldConfig, FieldRoles } from '../services/chartConfigSystem';
import { auditChartConfiguration } from '../services/chartValidationEngine';
import { buildQuery } from '../services/queryBuilder';
import { backendApi } from '../services/backendApi';
import { adaptQueryResponse } from '../services/dataAdapter';
import DrillDownTable from './DrillDownTable';
import { useTheme } from '../contexts/ThemeContext';
import { GripHorizontal, Filter, ChevronRight, Home, MousePointerClick } from 'lucide-react';
import { TYPO } from '../styles/typography';

const SEMANTIC_PREFIX = '__semantic__:';
const toDisplayMeasureName = (value = '') => {
    const text = String(value || '');
    return text.startsWith(SEMANTIC_PREFIX) ? text.slice(SEMANTIC_PREFIX.length) : text;
};

const Visualization = ({ config, dataset, isActive, isEditMode, globalFilters = [], groupId, onChartInstanceChange, chartClarityMode = 'standard', chartPaletteMode = 'vibrant', onDataPointClick, isExportRenderMode = false }) => {
    const { theme } = useTheme();
    const safeDataset = useMemo(() => (dataset || { id: null, columns: [], data: [] }), [dataset]);
    const datasetColumns = Array.isArray(safeDataset.columns) ? safeDataset.columns : [];
    const datasetRows = Array.isArray(safeDataset.data) ? safeDataset.data : [];
    const [drillPath, setDrillPath] = useState([]);
    const [orgSearchQuery, setOrgSearchQuery] = useState('');
    const [orgSelectedPathIds, setOrgSelectedPathIds] = useState([]);
    const [orgSelectedPathNames, setOrgSelectedPathNames] = useState([]);
    const [orgSelectedNodeId, setOrgSelectedNodeId] = useState('');
    const [chartData, setChartData] = useState([]);
    const [chartTransformed, setChartTransformed] = useState(null);
    const [queryColumns, setQueryColumns] = useState([]);
    const [isQueryLoading, setIsQueryLoading] = useState(false);
    const [queryError, setQueryError] = useState('');
    const [drillDownOpen, setDrillDownOpen] = useState(false);
    const [drillDownFilters, setDrillDownFilters] = useState([]);
    const [drillDownTitle, setDrillDownTitle] = useState('');
    const chartRef = useRef(null);

    useEffect(() => {
        return () => {
            if (onChartInstanceChange) {
                onChartInstanceChange(config.id, null);
            }
        };
    }, [onChartInstanceChange, config.id]);

    const isOrgType = config?.type === ChartType.ORG_CHART || config?.type === ChartType.ORG_TREE_STRUCTURED;

    useEffect(() => {
        if (isOrgType) {
            setDrillPath([]);
        }
    }, [isOrgType]);

    useEffect(() => {
        if (!isOrgType) {
            setOrgSearchQuery('');
            setOrgSelectedPathIds([]);
            setOrgSelectedPathNames([]);
            setOrgSelectedNodeId('');
        }
    }, [isOrgType]);

    const normalizedConfig = useMemo(() => {
        const legacy = convertOldConfig(config);
        const assignments = Array.isArray(config?.assignments) && config.assignments.length > 0
            ? config.assignments
            : (legacy.assignments || []);
        const resolvedType = legacy.chartType || config.type;

        return {
            ...config,
            type: resolvedType,
            ...configFromAssignments(resolvedType, assignments),
            assignments,
        };
    }, [config]);

    const chartAudit = useMemo(() => auditChartConfiguration({
        config: normalizedConfig,
        columns: datasetColumns,
        data: datasetRows,
    }), [normalizedConfig, datasetColumns, datasetRows]);

    const getRequiredRolesForChart = (type) => {
        switch (type) {
            case ChartType.PIE:
            case ChartType.DONUT:
            case ChartType.ROSE:
                return [
                    { label: 'Legend', anyOf: [FieldRoles.LEGEND, FieldRoles.COLOR], required: true },
                    { label: 'Value', anyOf: [FieldRoles.VALUE, FieldRoles.Y], required: true },
                ];
            case ChartType.SUNBURST:
            case ChartType.TREEMAP:
                return [
                    { label: 'Hierarchy', anyOf: [FieldRoles.HIERARCHY], required: true, multi: true },
                    { label: 'Value', anyOf: [FieldRoles.VALUE, FieldRoles.Y], required: true },
                ];
            case ChartType.ORG_CHART:
            case ChartType.ORG_TREE_STRUCTURED:
                return [
                    { label: 'Hierarchy', anyOf: [FieldRoles.HIERARCHY], required: true, multi: true },
                    { label: 'Label', anyOf: [FieldRoles.LABEL], required: false },
                    { label: 'Color/Legend', anyOf: [FieldRoles.COLOR, FieldRoles.LEGEND], required: false },
                ];
            case ChartType.SCATTER:
                return [
                    { label: 'X Axis', anyOf: [FieldRoles.X], required: true },
                    { label: 'Y Axis', anyOf: [FieldRoles.Y], required: true },
                    { label: 'Legend', anyOf: [FieldRoles.COLOR, FieldRoles.LEGEND], required: false },
                ];
            case ChartType.BUBBLE:
                return [
                    { label: 'X Axis', anyOf: [FieldRoles.X], required: true },
                    { label: 'Y Axis', anyOf: [FieldRoles.Y], required: true },
                    { label: 'Size', anyOf: [FieldRoles.SIZE], required: true },
                    { label: 'Legend', anyOf: [FieldRoles.COLOR, FieldRoles.LEGEND], required: false },
                ];
            case ChartType.HEATMAP:
                return [
                    { label: 'X Axis', anyOf: [FieldRoles.X], required: true },
                    { label: 'Y Axis', anyOf: [FieldRoles.Y], required: true },
                    { label: 'Value', anyOf: [FieldRoles.VALUE, FieldRoles.Y], required: true },
                ];
            case ChartType.GAUGE:
            case ChartType.KPI_SINGLE:
                return [
                    { label: 'Value', anyOf: [FieldRoles.VALUE, FieldRoles.Y], required: true },
                ];
            case ChartType.LINE:
            case ChartType.LINE_SMOOTH:
            case ChartType.LINE_STRAIGHT:
            case ChartType.LINE_STEP:
            case ChartType.AREA:
            case ChartType.AREA_SMOOTH:
            case ChartType.AREA_STACKED:
            case ChartType.AREA_PERCENT:
                return [
                    { label: 'Axis (Time/X)', anyOf: [FieldRoles.TIME, FieldRoles.X], required: true },
                    { label: 'Y Axis', anyOf: [FieldRoles.Y, FieldRoles.VALUE], required: true, multi: true },
                    { label: 'Legend', anyOf: [FieldRoles.LEGEND, FieldRoles.COLOR], required: false },
                ];
            case ChartType.RADAR:
                return [
                    { label: 'Legend', anyOf: [FieldRoles.LEGEND, FieldRoles.COLOR], required: false },
                    { label: 'Values', anyOf: [FieldRoles.Y, FieldRoles.VALUE], required: true, multi: true },
                ];
            case ChartType.BUBBLE:
                return [
                    { label: 'X Axis', anyOf: [FieldRoles.X], required: true },
                    { label: 'Y Axis', anyOf: [FieldRoles.Y, FieldRoles.VALUE], required: true },
                    { label: 'Size', anyOf: [FieldRoles.SIZE], required: true },
                    { label: 'Legend', anyOf: [FieldRoles.LEGEND, FieldRoles.COLOR], required: false },
                ];
            default:
                return [
                    { label: 'X Axis', anyOf: [FieldRoles.X, FieldRoles.TIME], required: true },
                    { label: 'Y Axis/Value', anyOf: [FieldRoles.Y, FieldRoles.VALUE], required: true, multi: true },
                    { label: 'Legend', anyOf: [FieldRoles.LEGEND, FieldRoles.COLOR], required: false },
                ];
        }
    };

    const roleFieldMap = useMemo(() => {
        const map = new Map();
        const assignments = Array.isArray(normalizedConfig?.assignments) ? normalizedConfig.assignments : [];
        assignments.forEach((a) => {
            if (!a?.role || !a?.field) return;
            if (!map.has(a.role)) map.set(a.role, []);
            map.get(a.role).push(a.field);
        });
        return map;
    }, [normalizedConfig?.assignments]);

    const requiredRoleInfo = useMemo(() => {
        const requirements = getRequiredRolesForChart(normalizedConfig?.type);
        return requirements.map((rule) => {
            const selected = rule.anyOf
                .flatMap((role) => roleFieldMap.get(role) || [])
                .filter(Boolean);
            const uniqueSelected = Array.from(new Set(selected));

            return {
                ...rule,
                selected: uniqueSelected,
                isMissing: rule.required && uniqueSelected.length === 0,
            };
        });
    }, [normalizedConfig?.type, roleFieldMap]);

    // Get effective dimension considering drill-down
    const getEffectiveDimension = () => {
        if (drillPath.length === 0) return normalizedConfig.dimension;
        const usedDims = [normalizedConfig.dimension, ...drillPath.map(d => d.dimensionCol)];
        const stringCols = datasetColumns.filter(c =>
            (c.type === 'string' || c.type === 'date') && !usedDims.includes(c.name)
        );
        return stringCols.length > 0 ? stringCols[0].name : normalizedConfig.dimension;
    };

    const effectiveDimension = getEffectiveDimension();

    const toTitleCase = (value = '') => String(value)
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());

    const sanitizedMeasureFields = useMemo(() => {
        const rawMeasures = Array.isArray(normalizedConfig?.measures) && normalizedConfig.measures.length > 0
            ? normalizedConfig.measures.map(toDisplayMeasureName)
            : ['__count__'];

        const numericColumns = new Set(
            datasetColumns
                .filter((c) => c?.type === 'number')
                .map((c) => c.name)
        );

        const filtered = rawMeasures.filter((m) => m === '__count__' || numericColumns.has(m));
        const deduped = Array.from(new Set(filtered));

        return deduped.length > 0 ? deduped : ['__count__'];
    }, [normalizedConfig?.measures, datasetColumns]);

    const semanticTitle = (() => {
        const configured = (config.title || '').trim();
        const isGeneric = !configured || /^new visual$/i.test(configured) || /^analytics card$/i.test(configured);
        if (!isGeneric) return configured;

        const firstMeasure = normalizedConfig?.measures?.[0]
            ? toTitleCase(toDisplayMeasureName(normalizedConfig.measures[0]))
            : 'Value';
        const dim = effectiveDimension ? toTitleCase(effectiveDimension) : 'Category';
        return `${firstMeasure} by ${dim}`;
    })();

    const semanticContext = effectiveDimension
        ? `Grouped by ${toTitleCase(effectiveDimension)}`
        : toTitleCase(config.type.replace(/_/g, ' '));

    const valueFieldsText = Array.isArray(sanitizedMeasureFields) && sanitizedMeasureFields.length > 0
        ? sanitizedMeasureFields.map(toTitleCase).join(', ')
        : 'None';

    const queryPayload = useMemo(() => buildQuery({
        config: normalizedConfig,
        dataset: safeDataset,
        datasetId: config?.datasetId || safeDataset?.id,
        globalFilters,
        drillPath,
        effectiveDimension,
    }), [normalizedConfig, safeDataset, config?.datasetId, globalFilters, drillPath, effectiveDimension]);

    useEffect(() => {
        let isCancelled = false;

        const fetchChartData = async () => {
            if (Array.isArray(chartAudit?.errors) && chartAudit.errors.length > 0) {
                if (!isCancelled) {
                    setChartData([]);
                    setChartTransformed(null);
                    setQueryColumns([]);
                    setQueryError('');
                    setIsQueryLoading(false);
                }
                return;
            }

            if (!queryPayload?.datasetId) {
                if (!isCancelled) {
                    setChartData([]);
                    setChartTransformed(null);
                    setQueryColumns([]);
                    setQueryError('');
                    setIsQueryLoading(false);
                }
                return;
            }

            setIsQueryLoading(true);
            setQueryError('');
            try {
                const response = await backendApi.runQuery(queryPayload);
                const chartType = normalizedConfig?.type || config?.type;
                const measureNames = Array.isArray(queryPayload?.measures)
                    ? queryPayload.measures
                        .map((m) => (typeof m === 'string' ? m : m?.name))
                        .filter(Boolean)
                    : [];
                const resolvedX = normalizedConfig?.xAxisField || measureNames[0];
                const resolvedY = normalizedConfig?.yAxisField || measureNames[1] || measureNames[0];
                const resolvedSize = normalizedConfig?.sizeField || measureNames[2] || measureNames[0];
                const adapterConfig = {
                    chartType,
                    dimensionFields: Array.isArray(queryPayload?.dimensions) ? queryPayload.dimensions : [effectiveDimension].filter(Boolean),
                    measures: Array.isArray(queryPayload?.measures)
                        ? queryPayload.measures.map((m) => (typeof m === 'string' ? { name: m } : m)).filter(Boolean)
                        : [],
                        bubbleOptions: normalizedConfig?.style?.bubble,
                        hierarchyTopN: normalizedConfig?.style?.sunburst?.topN,
                        hierarchyThreshold: normalizedConfig?.style?.sunburst?.threshold,
                        hierarchyFields: normalizedConfig?.hierarchyFields,
                    ...(chartType === ChartType.SCATTER
                        ? {
                            xMeasure: resolvedX,
                            yMeasure: resolvedY,
                        }
                        : {}),
                    ...(chartType === ChartType.BUBBLE
                        ? {
                            xMeasure: resolvedX,
                            yMeasure: resolvedY,
                            sizeMeasure: resolvedSize,
                        }
                        : {}),
                };

                const adapted = adaptQueryResponse(response, adapterConfig);
                if (!isCancelled) {
                    setQueryColumns(adapted.columns);
                    setChartData(adapted.rows);
                    setChartTransformed(adapted.transformed || null);
                }
            } catch (error) {
                if (!isCancelled) {
                    setQueryColumns([]);
                    setChartData([]);
                    setChartTransformed(null);
                    setQueryError(error?.message || 'Unable to load chart data');
                }
            } finally {
                if (!isCancelled) {
                    setIsQueryLoading(false);
                }
            }
        };

        fetchChartData();

        return () => {
            isCancelled = true;
        };
    }, [queryPayload, chartAudit, effectiveDimension]);

    const isDark = theme === 'dark';

    // Can we drill further?
    const canDrill = useMemo(() => {
        if (normalizedConfig.type === ChartType.ORG_CHART || normalizedConfig.type === ChartType.ORG_TREE_STRUCTURED) return false;
        const usedDims = [normalizedConfig.dimension, ...drillPath.map(d => d.dimensionCol)];
        return datasetColumns.some(c =>
            (c.type === 'string' || c.type === 'date') && !usedDims.includes(c.name)
        );
    }, [normalizedConfig.dimension, normalizedConfig.type, drillPath, datasetColumns]);

    const handleDrillDown = useCallback((params) => {
        if (!canDrill || !params.name) return;
        // Clear interaction filters when drilling down
        if (onDataPointClick) {
            onDataPointClick({ chartId: config.id, value: null });
        }
        setDrillPath(prev => [...prev, { dimensionCol: effectiveDimension, value: params.name }]);
    }, [canDrill, effectiveDimension, onDataPointClick, config.id]);

    const handlePointClick = useCallback((params) => {
        if (!params?.name) return;

        const isOrgChart = normalizedConfig?.type === ChartType.ORG_CHART || normalizedConfig?.type === ChartType.ORG_TREE_STRUCTURED;

        if (isOrgChart) {
            const info = Array.isArray(params?.treePathInfo) ? params.treePathInfo : [];
            const nextNames = info
                .map((entry) => entry?.name)
                .filter(Boolean);
            const nextIds = info
                .map((entry) => String(entry?.data?.id || entry?.data?.key || entry?.name || '').trim())
                .filter(Boolean);
            const clickedId = String(params?.data?.id || params?.data?.key || params?.name || '').trim();

            setOrgSelectedPathNames(nextNames);
            setOrgSelectedPathIds(nextIds);
            setOrgSelectedNodeId(clickedId || nextIds[nextIds.length - 1] || '');
        }

        if (normalizedConfig?.type === ChartType.SUNBURST || normalizedConfig?.type === ChartType.TREEMAP) {
            const pathInfo = Array.isArray(params?.treePathInfo) ? params.treePathInfo.slice(1) : [];
            const hierarchyFields = Array.isArray(normalizedConfig?.hierarchyFields) ? normalizedConfig.hierarchyFields : [];
            const filters = [];
            const pathNames = [];

            pathInfo.forEach((entry, idx) => {
                const name = String(entry?.name || '').trim();
                if (!name) return;
                const field = entry?.data?.__field || hierarchyFields[idx];
                if (!field) return;

                pathNames.push(name);
                if (name === 'Others' && Array.isArray(entry?.data?.__members) && entry.data.__members.length > 0) {
                    filters.push({ field, operator: 'IN', value: entry.data.__members });
                } else if (name !== 'Others') {
                    filters.push({ field, operator: 'EQUALS', value: name });
                }
            });

            if (filters.length > 0) {
                setDrillDownFilters(filters);
                setDrillDownTitle(pathNames.join(' ▸ ') || 'Drill Down');
                setDrillDownOpen(true);
                return;
            }
        }

        if (isOrgChart) return;

        const dimensionField = effectiveDimension || normalizedConfig?.dimension;
        if (dimensionField) {
            setDrillDownFilters([
                {
                    field: dimensionField,
                    operator: 'EQUALS',
                    value: String(params.name),
                },
            ]);
            setDrillDownTitle(`${semanticTitle} ▸ ${params.name}`);
            setDrillDownOpen(true);
            return;
        }
    }, [config.id, config.title, config.datasetId, effectiveDimension, canDrill, handleDrillDown, normalizedConfig?.type, normalizedConfig?.nodeField, normalizedConfig?.hierarchyFields, semanticTitle, setDrillDownFilters, setDrillDownTitle, setDrillDownOpen]);

    const handleDrillUp = (index) => {
        setDrillPath(prev => prev.slice(0, index));
    };

    // Cross-chart brushing: register chart in group
    const handleChartReady = useCallback((instance) => {
        chartRef.current = instance;
        if (onChartInstanceChange) {
            onChartInstanceChange(config.id, instance);
        }
        if (groupId) {
            instance.group = groupId;
            echarts.connect(groupId);
        }
    }, [groupId, onChartInstanceChange, config.id]);

    // Chart click events for drill-down
    const onEvents = useMemo(() => ({ click: handlePointClick }), [handlePointClick]);

    const applyExportReadabilityOverrides = (option) => {
        if (!option || typeof option !== 'object') return option;

        const forceSeriesLabel = (series) => {
            if (!series || typeof series !== 'object') return series;
            const currentLabel = series.label || {};
            const next = {
                ...series,
                label: {
                    ...currentLabel,
                    show: true,
                    fontSize: Math.max(Number(currentLabel.fontSize || TYPO.label.fontSize), 11),
                    formatter: currentLabel.formatter || ((params) => {
                        const value = params?.value;
                        if (Array.isArray(value)) return value[value.length - 1];
                        return value;
                    }),
                },
            };

            if (next.type === 'pie' || next.type === 'sunburst') {
                next.label = {
                    ...next.label,
                    formatter: currentLabel.formatter || '{b}: {c}',
                };
            }

            return next;
        };

        const patchAxis = (axis) => {
            if (!axis) return axis;
            const patchOne = (item) => ({
                ...item,
                axisLabel: {
                    ...(item?.axisLabel || {}),
                    show: true,
                    fontSize: Math.max(Number(item?.axisLabel?.fontSize || TYPO.axis.fontSize), 12),
                },
            });
            return Array.isArray(axis) ? axis.map(patchOne) : patchOne(axis);
        };

        return {
            ...option,
            tooltip: { ...(option.tooltip || {}), show: false },
            legend: option.legend ? {
                ...option.legend,
                show: true,
                textStyle: {
                    ...(option.legend?.textStyle || {}),
                    fontSize: Math.max(Number(option.legend?.textStyle?.fontSize || TYPO.legend.fontSize), 12),
                },
            } : option.legend,
            xAxis: patchAxis(option.xAxis),
            yAxis: patchAxis(option.yAxis),
            series: Array.isArray(option.series) ? option.series.map(forceSeriesLabel) : option.series,
        };
    };

    const renderVisual = () => {
        if (Array.isArray(chartAudit?.errors) && chartAudit.errors.length > 0) {
            return (
                <div className="h-full flex flex-col items-start justify-center gap-2 px-4 py-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-[11px]">
                    <p className="font-bold text-rose-700 dark:text-rose-300">Chart configuration errors</p>
                    <ul className="space-y-1 text-rose-700 dark:text-rose-300 list-disc pl-4">
                        {chartAudit.errors.slice(0, 5).map((err, idx) => (
                            <li key={`${err?.code || 'err'}-${idx}`}>{err?.message || String(err)}</li>
                        ))}
                    </ul>
                </div>
            );
        }

        if (queryError) {
            return (
                <div className="h-full flex items-center justify-center text-xs font-semibold text-rose-500 dark:text-rose-300 tracking-wide p-12 text-center">
                    {queryError}
                </div>
            );
        }

        if (isQueryLoading) {
            return (
                <div className="h-full flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide p-12 text-center">
                    Loading chart data...
                </div>
            );
        }

        if (chartData.length === 0) return (
            <div className="h-full flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide p-12 text-center">
                No results match the current filters
            </div>
        );

        const { type } = normalizedConfig;
        const measures = Array.isArray(normalizedConfig?.measures) && normalizedConfig.measures.length > 0
            ? normalizedConfig.measures.map(toDisplayMeasureName)
            : ['__count__'];
        const configuredFontSize = Math.max(11, Number(normalizedConfig?.style?.fontSize || TYPO.axis.fontSize));
        // Table type — keep HTML renderer
        if (type === ChartType.TABLE) {
            const tableColumns = queryColumns.length > 0
                ? queryColumns
                : [normalizedConfig.dimension, ...measures].filter(Boolean);

            return (
                <div
                    className="h-full overflow-auto font-medium text-gray-600 dark:text-gray-300"
                    style={{
                        fontSize: `${configuredFontSize}px`,
                        fontWeight: TYPO.tableCell.fontWeight,
                        fontFamily: TYPO.fontFamily,
                    }}
                >
                    <table className="w-full text-left border-collapse" style={{ fontFamily: TYPO.fontFamily }}>
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                {tableColumns.map((col) => (
                                    <th
                                        key={col}
                                        className="py-3 px-4 font-semibold text-gray-500 dark:text-gray-400 sticky top-0 bg-white dark:bg-gray-800"
                                        style={{ fontSize: `${Math.max(11, configuredFontSize + 1)}px`, fontWeight: TYPO.tableHeader.fontWeight }}
                                    >
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {chartData.map((row, idx) => (
                                <tr key={idx} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    {tableColumns.map((col) => {
                                        const value = row?.[col];
                                        const isNumeric = typeof value === 'number' && Number.isFinite(value);
                                        return (
                                            <td
                                                key={col}
                                                className={`py-3 px-4 ${col === tableColumns[0] ? 'font-bold text-gray-900 dark:text-gray-100' : ''}`}
                                                style={{ fontSize: `${configuredFontSize}px`, fontWeight: TYPO.tableCell.fontWeight }}
                                            >
                                                {isNumeric ? value.toLocaleString() : String(value ?? '')}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // KPI_SINGLE type — keep custom renderer
        if (type === ChartType.KPI_SINGLE) {
            const measureKey = measures[0] || queryColumns.find((c) => c !== effectiveDimension) || 'Count';
            const primaryValue = Number(chartData?.[0]?.[measureKey] || 0);
            return (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-5 bg-gray-500 dark:bg-gray-300"></div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider mb-3 relative z-10">{config.title || measures[0]}</p>
                    <h2
                        className="text-gray-900 dark:text-gray-100 tracking-tight leading-none mb-5 relative z-10 animate-fade-in"
                        style={{ fontSize: `${Math.max(24, Math.round(configuredFontSize * 2.5))}px`, fontWeight: TYPO.kpiValue.fontWeight, fontFamily: TYPO.fontFamily }}
                    >
                        {primaryValue > 1000 ? (primaryValue / 1000).toFixed(1) + 'k' : primaryValue.toLocaleString()}
                    </h2>
                    <div
                        className="px-4 py-2 rounded-full uppercase tracking-widest relative z-10 shadow-lg bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800"
                        style={{ fontSize: `${configuredFontSize}px`, fontWeight: TYPO.kpiLabel.fontWeight, fontFamily: TYPO.fontFamily }}
                    >
                        Filtered Total
                    </div>
                </div>
            );
        }

        // All other types — render via ECharts
        const exportStyleOverrides = isExportRenderMode
            ? {
                ...(normalizedConfig.style || {}),
                labelMode: 'show',
                tooltipEnabled: false,
                fontSize: Math.max(Number(normalizedConfig?.style?.fontSize || 11), 12),
            }
            : (normalizedConfig.style || {});

        let option = buildChartOption(
            type,
            chartData,
            {
                ...normalizedConfig,
                dimension: effectiveDimension,
                measures,
                orgSearchQuery: (type === ChartType.ORG_CHART || type === ChartType.ORG_TREE_STRUCTURED) ? orgSearchQuery : '',
                orgSelectedPathIds: (type === ChartType.ORG_CHART || type === ChartType.ORG_TREE_STRUCTURED) ? orgSelectedPathIds : [],
                orgSelectedNodeId: (type === ChartType.ORG_CHART || type === ChartType.ORG_TREE_STRUCTURED) ? orgSelectedNodeId : '',
                transformed: chartTransformed,
                style: exportStyleOverrides,
            },
            theme,
            chartClarityMode,
            chartPaletteMode
        );

        if (isExportRenderMode) {
            option = applyExportReadabilityOverrides(option);
        }

        return (
            <>
                {normalizedConfig.type === ChartType.SUNBURST && (
                    <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2">
                        Total Records: {Number(chartTransformed?.total || 0).toLocaleString()}
                    </div>
                )}
                <ReactECharts
                    option={option}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                    notMerge={true}
                    lazyUpdate={true}
                    onChartReady={handleChartReady}
                    onEvents={onEvents}
                />
                <DrillDownTable
                    open={drillDownOpen}
                    datasetId={config.datasetId}
                    columns={dataset?.columns?.map((c) => c.name) || []}
                    filters={drillDownFilters}
                    title={drillDownTitle}
                    onClose={() => setDrillDownOpen(false)}
                />
            </>
        );
    };

    return (
        <div className={`h-full w-full rounded-2xl border flex flex-col group overflow-hidden transition-all duration-300 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} ${isEditMode ? 'p-3 shadow-sm' : 'p-4 shadow-md border-transparent'} ${isActive ? 'ring-2 ring-gray-500 dark:ring-gray-400 shadow-lg scale-[1.005]' : 'hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'}`}>
            <div className="flex justify-between items-start mb-3 shrink-0">
                <div className="flex items-start gap-3 overflow-hidden">
                    {isEditMode && <div className="drag-handle mt-0.5 cursor-move p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 transition-colors shrink-0"><GripHorizontal size={14} /></div>}
                    <div className="overflow-hidden">
                        <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-200 tracking-tight leading-none truncate">{semanticTitle}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold tracking-wide truncate">{semanticContext}</p>
                            {normalizedConfig.filters?.length > 0 && <Filter size={8} className="text-blue-500" />}
                            {canDrill && drillPath.length === 0 && <MousePointerClick size={8} className="text-violet-500" title="Click to drill down" />}
                            {!canDrill && normalizedConfig.type !== ChartType.ORG_CHART && normalizedConfig.type !== ChartType.ORG_TREE_STRUCTURED && <MousePointerClick size={8} className="text-emerald-500" title="Click to cross-filter and drill-through" />}
                        </div>
                        <div className="flex flex-wrap items-start gap-2 mt-1.5 min-w-0">
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold whitespace-normal break-all max-w-full" title={`Dimension: ${effectiveDimension || 'N/A'}`}>
                                {`Dimension: ${effectiveDimension || 'N/A'}`}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold truncate max-w-full" title={`Values: ${valueFieldsText}`}>
                                {`Values: ${valueFieldsText}`}
                            </span>
                        </div>
                        <div className="mt-2">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Required field mapping</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                                {requiredRoleInfo.map((item) => {
                                    const displayValue = item.selected.length === 0
                                        ? (item.required ? 'Missing' : 'Optional')
                                        : (item.multi ? item.selected.join(', ') : item.selected[0]);

                                    const cls = item.isMissing
                                        ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                        : item.selected.length > 0
                                            ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                            : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600';

                                    return (
                                        <span
                                            key={`${item.label}-${item.anyOf.join('-')}`}
                                            className={`text-[9px] px-2 py-0.5 rounded-md border font-semibold max-w-full break-all ${cls}`}
                                            title={`${item.label}: ${displayValue}`}
                                        >
                                            {item.label}: {displayValue}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                        {(normalizedConfig.type === ChartType.ORG_CHART || normalizedConfig.type === ChartType.ORG_TREE_STRUCTURED) && (
                            <div className="mt-2 flex items-center gap-2">
                                <input
                                    type="text"
                                    value={orgSearchQuery}
                                    onChange={(e) => setOrgSearchQuery(e.target.value)}
                                    placeholder="Search employee / title / department"
                                    className="w-full max-w-[260px] bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 text-[10px] font-semibold text-gray-700 dark:text-gray-200"
                                />
                                {orgSearchQuery && (
                                    <button
                                        onClick={() => setOrgSearchQuery('')}
                                        className="text-[10px] font-bold px-1.5 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-300"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        )}
                        {(normalizedConfig.type === ChartType.ORG_CHART || normalizedConfig.type === ChartType.ORG_TREE_STRUCTURED) && orgSelectedPathNames.length > 0 && (
                            <div className={`mt-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold overflow-x-auto ${isDark ? 'bg-gray-700/60 text-gray-200' : 'bg-gray-50 text-gray-700'}`}>
                                {orgSelectedPathNames.map((part, idx) => (
                                    <React.Fragment key={`${part}-${idx}`}>
                                        {idx > 0 && <ChevronRight size={9} className={isDark ? 'text-gray-400' : 'text-gray-400'} />}
                                        <span className={`${idx === orgSelectedPathNames.length - 1 ? 'text-blue-500' : ''}`}>{part}</span>
                                    </React.Fragment>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* Drill-down breadcrumb */}
            {drillPath.length > 0 && (
                <div className={`flex items-center gap-1 px-1 py-1 mb-1 rounded-lg text-[11px] font-semibold shrink-0 overflow-x-auto ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    <button onClick={() => handleDrillUp(0)}
                        className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200'}`}>
                        <Home size={9} /> All
                    </button>
                    {drillPath.map((drill, i) => (
                        <React.Fragment key={i}>
                            <ChevronRight size={8} className={isDark ? 'text-gray-600' : 'text-gray-300'} />
                            <button onClick={() => handleDrillUp(i + 1)}
                                className={`px-1.5 py-0.5 rounded truncate max-w-[80px] transition-colors ${i === drillPath.length - 1
                                    ? (isDark ? 'text-blue-400 bg-blue-900/30' : 'text-blue-600 bg-blue-50')
                                    : (isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200')}`}>
                                {drill.value}
                            </button>
                        </React.Fragment>
                    ))}
                    {canDrill && (
                        <span className={`ml-auto text-[10px] italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>click to drill</span>
                    )}
                </div>
            )}

            <div className="flex-1 min-h-0 relative">
                {renderVisual()}
            </div>
        </div>
    );
};

export default Visualization;
