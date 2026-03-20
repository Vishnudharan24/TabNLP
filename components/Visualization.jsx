
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { ChartType } from '../types';
import { buildChartOption } from '../services/echartsOptionBuilder';
import { useTheme } from '../contexts/ThemeContext';
import { GripHorizontal, Filter, ChevronRight, Home, MousePointerClick } from 'lucide-react';

const Visualization = ({ config, dataset, isActive, isEditMode, globalFilters = [], groupId, onChartInstanceChange, chartClarityMode = 'standard', chartPaletteMode = 'vibrant', onDataPointClick, isExportRenderMode = false }) => {
    const { theme } = useTheme();
    const [drillPath, setDrillPath] = useState([]);
    const chartRef = useRef(null);

    useEffect(() => {
        return () => {
            if (onChartInstanceChange) {
                onChartInstanceChange(config.id, null);
            }
        };
    }, [onChartInstanceChange, config.id]);

    if (!dataset) return null;

    // Apply global filters (cross-dataset filtering)
    const applyGlobalFilters = (data) => {
        if (!globalFilters || globalFilters.length === 0) return data;
        return data.filter(row => {
            return globalFilters.every(gf => {
                if (!(gf.column in row)) return true;
                const val = row[gf.column];
                if (gf.type === 'include' && gf.values && gf.values.length > 0) {
                    return gf.values.includes(String(val));
                }
                if (gf.type === 'range') {
                    const num = Number(val);
                    if (isNaN(num)) return false;
                    return num >= gf.rangeMin && num <= gf.rangeMax;
                }
                return true;
            });
        });
    };

    // Apply drill-down path filters
    const applyDrillFilters = (data) => {
        if (drillPath.length === 0) return data;
        return drillPath.reduce((filtered, drill) => {
            return filtered.filter(row => String(row[drill.dimensionCol]) === drill.value);
        }, data);
    };

    // Get effective dimension considering drill-down
    const getEffectiveDimension = () => {
        if (drillPath.length === 0) return config.dimension;
        const usedDims = [config.dimension, ...drillPath.map(d => d.dimensionCol)];
        const stringCols = dataset.columns.filter(c =>
            (c.type === 'string' || c.type === 'date') && !usedDims.includes(c.name)
        );
        return stringCols.length > 0 ? stringCols[0].name : config.dimension;
    };

    const effectiveDimension = getEffectiveDimension();

    const toTitleCase = (value = '') => String(value)
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());

    const semanticTitle = (() => {
        const configured = (config.title || '').trim();
        const isGeneric = !configured || /^new visual$/i.test(configured) || /^analytics card$/i.test(configured);
        if (!isGeneric) return configured;

        const firstMeasure = config?.measures?.[0] ? toTitleCase(config.measures[0]) : 'Value';
        const dim = effectiveDimension ? toTitleCase(effectiveDimension) : 'Category';
        return `${firstMeasure} by ${dim}`;
    })();

    const semanticContext = effectiveDimension
        ? `Grouped by ${toTitleCase(effectiveDimension)}`
        : toTitleCase(config.type.replace(/_/g, ' '));

    const valueFieldsText = Array.isArray(config?.measures) && config.measures.length > 0
        ? config.measures.map(toTitleCase).join(', ')
        : 'None';

    const aggregationText = config?.aggregation ? toTitleCase(config.aggregation) : 'N/A';

    const applyFilters = (data) => {
        if (!config.filters || config.filters.length === 0) return data;

        const columnTypeMap = new Map((dataset?.columns || []).map(col => [col.name, col.type]));
        const toComparable = (raw, typeHint) => {
            if (typeHint === 'date') {
                const ts = new Date(raw).getTime();
                return Number.isNaN(ts) ? null : ts;
            }

            const numeric = Number(raw);
            if (!Number.isNaN(numeric) && `${raw}`.trim() !== '') {
                return numeric;
            }

            const parsedDate = new Date(raw).getTime();
            if (!Number.isNaN(parsedDate)) {
                return parsedDate;
            }

            return null;
        };

        return data.filter(row => {
            return config.filters.every(f => {
                const val = row[f.column];
                const target = f.value;
                const targetSec = f.valueSecondary;
                const inferredType = f.columnType || columnTypeMap.get(f.column);

                switch (f.operator) {
                    case 'EQUALS': return String(val).toLowerCase() === String(target).toLowerCase();
                    case 'CONTAINS': return String(val).toLowerCase().includes(String(target).toLowerCase());
                    case 'STARTS_WITH': return String(val).toLowerCase().startsWith(String(target).toLowerCase());
                    case 'IS_EMPTY': return !val || val === '';
                    case 'GT': {
                        const left = toComparable(val, inferredType);
                        const right = toComparable(target, inferredType);
                        return left !== null && right !== null ? left > right : false;
                    }
                    case 'LT': {
                        const left = toComparable(val, inferredType);
                        const right = toComparable(target, inferredType);
                        return left !== null && right !== null ? left < right : false;
                    }
                    case 'BETWEEN': {
                        const left = toComparable(val, inferredType);
                        const min = toComparable(target, inferredType);
                        const max = toComparable(targetSec, inferredType);
                        return left !== null && min !== null && max !== null ? left >= min && left <= max : false;
                    }
                    case 'IS_TRUE': return !!val;
                    case 'IS_FALSE': return !val;
                    default: return true;
                }
            });
        });
    };

    const processData = () => {
        const { measures, aggregation, type } = config;
        const dimension = effectiveDimension;
        if (!dimension || !measures || measures.length === 0) return [];

        let filteredData = applyGlobalFilters(dataset.data);
        filteredData = applyFilters(filteredData);
        filteredData = applyDrillFilters(filteredData);
        const groups = {};

        filteredData.forEach(row => {
            const dimVal = String(row[dimension] || 'Unknown');
            if (!groups[dimVal]) groups[dimVal] = {};

            measures.forEach(m => {
                if (!groups[dimVal][m]) groups[dimVal][m] = { sum: 0, count: 0, min: Infinity, max: -Infinity };
                const val = Number(row[m]);
                if (!isNaN(val)) {
                    groups[dimVal][m].sum += val;
                    groups[dimVal][m].count += 1;
                    groups[dimVal][m].min = Math.min(groups[dimVal][m].min, val);
                    groups[dimVal][m].max = Math.max(groups[dimVal][m].max, val);
                }
            });
        });

        let result = Object.entries(groups).map(([name, statsMap]) => {
            const row = { name };
            measures.forEach(m => {
                const s = statsMap[m] || { sum: 0, count: 0, min: 0, max: 0 };
                if (aggregation === 'AVG') row[m] = s.count > 0 ? s.sum / s.count : 0;
                else if (aggregation === 'COUNT') row[m] = s.count;
                else if (aggregation === 'MIN') row[m] = s.min === Infinity ? 0 : s.min;
                else if (aggregation === 'MAX') row[m] = s.max === -Infinity ? 0 : s.max;
                else row[m] = s.sum;
            });
            return row;
        });

        return result.sort((a, b) => (b[measures[0]] || 0) - (a[measures[0]] || 0)).slice(0, 15);
    };

    const chartData = processData();
    const isDark = theme === 'dark';

    // Can we drill further?
    const canDrill = useMemo(() => {
        const usedDims = [config.dimension, ...drillPath.map(d => d.dimensionCol)];
        return dataset.columns.some(c =>
            (c.type === 'string' || c.type === 'date') && !usedDims.includes(c.name)
        );
    }, [config.dimension, drillPath, dataset.columns]);

    const handleDrillDown = useCallback((params) => {
        if (!canDrill || !params.name) return;
        setDrillPath(prev => [...prev, { dimensionCol: effectiveDimension, value: params.name }]);
    }, [canDrill, effectiveDimension]);

    const handlePointClick = useCallback((params) => {
        if (!params?.name) return;

        if (onDataPointClick) {
            onDataPointClick({
                chartId: config.id,
                chartTitle: config.title,
                datasetId: config.datasetId,
                dimension: effectiveDimension,
                value: params.name,
                params,
            });
        }

        if (canDrill) {
            handleDrillDown(params);
        }
    }, [onDataPointClick, config.id, config.title, config.datasetId, effectiveDimension, canDrill, handleDrillDown]);

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
                    fontSize: Math.max(Number(currentLabel.fontSize || 10), 11),
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
                    fontSize: Math.max(Number(item?.axisLabel?.fontSize || 11), 12),
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
                    fontSize: Math.max(Number(option.legend?.textStyle?.fontSize || 11), 12),
                },
            } : option.legend,
            xAxis: patchAxis(option.xAxis),
            yAxis: patchAxis(option.yAxis),
            series: Array.isArray(option.series) ? option.series.map(forceSeriesLabel) : option.series,
        };
    };

    const renderVisual = () => {
        if (chartData.length === 0) return (
            <div className="h-full flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide p-12 text-center">
                No results match the current filters
            </div>
        );

        const { type, measures } = config;

        // Table type — keep HTML renderer
        if (type === ChartType.TABLE) {
            return (
                <div className="h-full overflow-auto text-xs font-medium text-gray-600 dark:text-gray-300">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                <th className="py-3 px-4 font-semibold text-gray-500 dark:text-gray-400 text-[11px] sticky top-0 bg-white dark:bg-gray-800">{config.dimension}</th>
                                {measures.map(m => <th key={m} className="py-3 px-4 font-semibold text-gray-500 dark:text-gray-400 text-[11px] sticky top-0 bg-white dark:bg-gray-800">{m}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {chartData.map((row, idx) => (
                                <tr key={idx} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="py-3 px-4 font-bold text-gray-900 dark:text-gray-100">{row.name}</td>
                                    {measures.map(m => <td key={m} className="py-3 px-4">{Number(row[m]).toLocaleString()}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // KPI_SINGLE type — keep custom renderer
        if (type === ChartType.KPI_SINGLE) {
            const primaryValue = chartData.reduce((acc, curr) => acc + (curr[measures[0]] || 0), 0);
            return (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-5 bg-gray-500 dark:bg-gray-300"></div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider mb-3 relative z-10">{config.title || measures[0]}</p>
                    <h2 className="text-6xl font-black text-gray-900 dark:text-gray-100 tracking-tight leading-none mb-5 relative z-10 animate-fade-in">
                        {primaryValue > 1000 ? (primaryValue / 1000).toFixed(1) + 'k' : primaryValue.toLocaleString()}
                    </h2>
                    <div className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest relative z-10 shadow-lg bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800">
                        Filtered Total
                    </div>
                </div>
            );
        }

        // All other types — render via ECharts
        const exportStyleOverrides = isExportRenderMode
            ? {
                ...(config.style || {}),
                labelMode: 'show',
                tooltipEnabled: false,
                fontSize: Math.max(Number(config?.style?.fontSize || 11), 12),
            }
            : (config.style || {});

        let option = buildChartOption(
            type,
            chartData,
            { ...config, dimension: effectiveDimension, style: exportStyleOverrides },
            theme,
            chartClarityMode,
            chartPaletteMode
        );

        if (isExportRenderMode) {
            option = applyExportReadabilityOverrides(option);
        }

        return (
            <ReactECharts
                option={option}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
                notMerge={true}
                lazyUpdate={true}
                onChartReady={handleChartReady}
                onEvents={onEvents}
            />
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
                            {config.filters.length > 0 && <Filter size={8} className="text-blue-500" />}
                            {canDrill && drillPath.length === 0 && <MousePointerClick size={8} className="text-violet-500" title="Click to drill down" />}
                            {!canDrill && <MousePointerClick size={8} className="text-emerald-500" title="Click to cross-filter and drill-through" />}
                        </div>
                        <div className="flex flex-wrap items-start gap-2 mt-1.5 min-w-0">
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold whitespace-normal break-all max-w-full" title={`Dimension: ${effectiveDimension || 'N/A'}`}>
                                {`Dimension: ${effectiveDimension || 'N/A'}`}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold truncate max-w-full" title={`Values: ${valueFieldsText}`}>
                                {`Values: ${valueFieldsText}`}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold" title={`Aggregation: ${aggregationText}`}>
                                {`Aggregation: ${aggregationText}`}
                            </span>
                        </div>
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
