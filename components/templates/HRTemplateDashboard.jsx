import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import jsPDF from 'jspdf';
import { useTheme } from '../../contexts/ThemeContext';
import { backendApi } from '../../services/backendApi';
import { ChartType } from '../../types';
import { buildChartOption } from '../../services/echartsOptionBuilder';

const MODULES = [
    'summary',
    'demographics',
    'hiring',
    'attrition',
    'experience',
    'org',
    'payroll',
    'education',
    'location',
    'department',
    'lifecycle',
    'compliance',
    'contact',
    'data-quality',
];

const CHART_AXIS_FIELDS = {
    'Department Distribution': { x: 'Department', y: 'Employee Count' },
    'Gender Distribution': { x: 'Not applicable (Pie)', y: 'Employee Count' },
    'Business Unit Distribution': { x: 'Business Unit', y: 'Employee Count' },
    'Location Distribution': { x: 'Location', y: 'Employee Count' },
    'Workforce Category Distribution': { x: 'Not applicable (Pie)', y: 'Employee Count' },
    'Marital Status Distribution': { x: 'Not applicable (Pie)', y: 'Employee Count' },
    'Age Distribution': { x: 'Age Bucket', y: 'Employee Count' },
    'Monthly Hiring Trend': { x: 'Month', y: 'Hires' },
    'Yearly Hiring Trend': { x: 'Year', y: 'Hires' },
    'Hiring by Department': { x: 'Department', y: 'Hires' },
    'Hiring by Location': { x: 'Location', y: 'Hires' },
    'Gender by Department': { x: 'Department', y: 'Employee Count (per Gender series)' },
    'Nationality Distribution': { x: 'Not applicable (Pie)', y: 'Employee Count' },
    'Demographic Location Distribution': { x: 'City/Location', y: 'Employee Count' },
    'Voluntary vs Involuntary': { x: 'Not applicable (Pie)', y: 'Exit Count' },
    'Attrition by Department': { x: 'Department', y: 'Exits (Bar), Headcount (Line)' },
    'Exits by Manager': { x: 'Exit Count', y: 'Manager' },
    'Top Exit Reasons': { x: 'Exit Count', y: 'Exit Reason' },
    'Attrition by Experience': { x: 'Experience Bucket', y: 'Exit Count' },
    'Experience Distribution': { x: 'Experience Bucket', y: 'Employee Count' },
    'Senior vs Junior Ratio': { x: 'Not applicable (Pie)', y: 'Employee Count' },
    'Organization Tree': { x: 'Not applicable (Tree)', y: 'Not applicable (Tree)' },
    'Manager Team Size': { x: 'Team Size', y: 'Manager' },
    'Payment Mode Distribution': { x: 'Not applicable (Pie)', y: 'Employee Count' },
    'Bank Distribution': { x: 'Employee Count', y: 'Bank Name' },
    'Qualification Distribution': { x: 'Qualification', y: 'Employee Count' },
    'Specialization Distribution': { x: 'Employee Count', y: 'Specialization' },
    'Course Type Distribution': { x: 'Not applicable (Pie)', y: 'Employee Count' },
    'Transfer Trends': { x: 'Transfer Count', y: 'Transfer From -> Location' },
    'Movement Reasons': { x: 'Count', y: 'Reason For Movement' },
    'Headcount per Department': { x: 'Department', y: 'Headcount' },
    'Attrition per Department': { x: 'Department', y: 'Attrition Count' },
    'Lifecycle Duration (Months)': { x: 'Months', y: 'Employee ID' },
    'Null Distribution per Column': { x: 'Null Count', y: 'Column Name' },
    'Emergency Relationship Distribution': { x: 'Not applicable (Pie)', y: 'Employee Count' },
};

const COLORS = ['#2563eb', '#7c3aed', '#16a34a', '#ea580c', '#dc2626', '#0891b2', '#ca8a04'];

const asArray = (value) => (Array.isArray(value) ? value : []);

const toNameValue = (items = []) => asArray(items)
    .map((item) => {
        if (!item || typeof item !== 'object') return null;
        return {
            name: String(item.name ?? item.department ?? item.gender ?? 'Unknown'),
            value: Number(item.value ?? 0),
        };
    })
    .filter((item) => Number.isFinite(item.value));

const readChart = (analytics, moduleName, chartKey, fallbacks = []) => {
    const mod = analytics?.[moduleName] || {};
    const chartFromModule = mod?.charts?.[chartKey];
    if (chartFromModule != null) return chartFromModule;
    for (const key of fallbacks) {
        if (mod?.[key] != null) return mod[key];
    }
    return [];
};

const readKpi = (analytics, moduleName, kpiKey, fallbacks = []) => {
    const mod = analytics?.[moduleName] || {};
    if (mod?.kpis?.[kpiKey] != null) return mod.kpis[kpiKey];
    for (const key of fallbacks) {
        if (mod?.[key] != null) return mod[key];
    }
    return 0;
};

const collectTreeDepartments = (root) => {
    const set = new Set();
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.department && node.department !== 'Unknown') set.add(String(node.department));
        const children = Array.isArray(node.children) ? node.children : [];
        children.forEach(visit);
    };
    visit(root);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
};

const filterOrgTreeByDepartment = (root, department) => {
    const selected = String(department || '__all__');
    if (selected === '__all__') return root;

    const prune = (node, depth = 0) => {
        if (!node || typeof node !== 'object') return null;
        const children = (Array.isArray(node.children) ? node.children : [])
            .map((child) => prune(child, depth + 1))
            .filter(Boolean);

        const matches = String(node.department || '') === selected;
        const keep = depth === 0 || matches || children.length > 0;
        if (!keep) return null;

        return {
            ...node,
            children,
        };
    };

    return prune(root, 0) || { name: 'Organization', children: [] };
};

const toValueMap = (items = []) => {
    const map = {};
    items.forEach((item) => {
        if (item?.name != null) map[item.name] = item.value || 0;
    });
    return map;
};

const chartBase = (isDark) => ({
    backgroundColor: 'transparent',
    textStyle: { color: isDark ? '#e5e7eb' : '#0f172a' },
    tooltip: { trigger: 'item' },
});

const axisTextColor = (isDark) => (isDark ? '#d1d5db' : '#334155');

const applyAllCategoryLabels = (option = {}, isDark = false) => {
    const patchAxis = (axis) => {
        if (!axis || axis.type !== 'category') return axis;
        return {
            ...axis,
            axisLabel: {
                ...(axis.axisLabel || {}),
                interval: axis.axisLabel?.interval ?? 'auto',
                rotate: axis.axisLabel?.rotate ?? 30,
                color: axisTextColor(isDark),
            },
        };
    };

    const next = { ...option };
    if (Array.isArray(next.xAxis)) next.xAxis = next.xAxis.map(patchAxis);
    else if (next.xAxis) next.xAxis = patchAxis(next.xAxis);

    if (Array.isArray(next.yAxis)) next.yAxis = next.yAxis.map(patchAxis);
    else if (next.yAxis) next.yAxis = patchAxis(next.yAxis);

    const xAxis = Array.isArray(next.xAxis) ? next.xAxis[0] : next.xAxis;
    const yAxis = Array.isArray(next.yAxis) ? next.yAxis[0] : next.yAxis;
    const useYAxisZoom = xAxis?.type === 'value' && yAxis?.type === 'category';
    const categoryCount = (useYAxisZoom ? yAxis?.data?.length : xAxis?.data?.length) || 0;

    if (categoryCount > 20) {
        next.dataZoom = [
            useYAxisZoom
                ? { type: 'inside', yAxisIndex: 0, filterMode: 'filter', zoomLock: false }
                : { type: 'inside', xAxisIndex: 0, filterMode: 'filter', zoomLock: false },
            useYAxisZoom
                ? { type: 'slider', yAxisIndex: 0, width: 14, right: 6, top: 40, bottom: 40 }
                : { type: 'slider', xAxisIndex: 0, height: 16, bottom: 24 },
        ];
    }

    return next;
};

const applyAlwaysOnLabels = (option = {}, isDark = false) => {
    const series = Array.isArray(option?.series) ? option.series : [];
    if (series.length === 0) return option;

    const hasPie = series.some((s) => String(s?.type || '').toLowerCase() === 'pie');
    const pieSliceCount = series.reduce((max, s) => {
        const t = String(s?.type || '').toLowerCase();
        if (t !== 'pie') return max;
        const count = Array.isArray(s?.data) ? s.data.length : 0;
        return Math.max(max, count);
    }, 0);

    const nextLegend = hasPie
        ? {
            ...(option?.legend || {}),
            top: option?.legend?.top ?? 0,
            left: option?.legend?.left ?? 'center',
            orient: option?.legend?.orient || 'horizontal',
            ...(pieSliceCount > 10 ? { type: 'scroll' } : {}),
        }
        : option?.legend;

    return {
        ...option,
        legend: nextLegend,
        series: series.map((s) => {
            const type = String(s?.type || '').toLowerCase();
            const baseLabel = {
                ...(s?.label || {}),
                show: true,
                color: s?.label?.color || (isDark ? '#e5e7eb' : '#0f172a'),
            };

            if (type === 'pie') {
                const dataCount = Array.isArray(s?.data) ? s.data.length : 0;
                return {
                    ...s,
                    label: {
                        ...baseLabel,
                        position: s?.label?.position || 'outside',
                        formatter: s?.label?.formatter || '{b}: {c}',
                    },
                    labelLayout: { hideOverlap: true },
                    avoidLabelOverlap: true,
                };
            }

            if (type === 'line' || type === 'bar') {
                return {
                    ...s,
                    label: {
                        ...baseLabel,
                        position: s?.label?.position || 'top',
                        formatter: s?.label?.formatter || ((params) => formatCountLabel(params?.value)),
                    },
                    labelLayout: { hideOverlap: true },
                };
            }

            if (type === 'scatter') {
                return {
                    ...s,
                    label: {
                        ...baseLabel,
                        position: s?.label?.position || 'top',
                        formatter: s?.label?.formatter || ((params) => params?.name || ''),
                    },
                    labelLayout: { hideOverlap: true },
                };
            }

            return {
                ...s,
                label: baseLabel,
            };
        }),
    };
};

const deepCloneOption = (value) => {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            // fallback below
        }
    }
    return JSON.parse(JSON.stringify(value || {}));
};

const formatCountLabel = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value ?? '');
    if (Math.abs(num) >= 1000) return num.toLocaleString();
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

const isHorizontalBarChart = (chartOption) => {
    const xAxis = Array.isArray(chartOption?.xAxis) ? chartOption.xAxis[0] : chartOption?.xAxis;
    const yAxis = Array.isArray(chartOption?.yAxis) ? chartOption.yAxis[0] : chartOption?.yAxis;
    return xAxis?.type === 'value' && yAxis?.type === 'category';
};

const withAxisMeta = (axisConfig, axisName, isDark) => {
    if (!axisConfig) return axisConfig;
    const safeName = String(axisName || '').trim();

    return {
        ...axisConfig,
        name: safeName || axisConfig?.name || '',
        nameLocation: axisConfig?.nameLocation || 'middle',
        nameGap: axisConfig?.nameGap ?? 32,
        nameTextStyle: {
            ...(axisConfig?.nameTextStyle || {}),
            color: isDark ? '#e5e7eb' : '#0f172a',
            fontWeight: 600,
            fontSize: 11,
        },
        axisLine: {
            ...(axisConfig?.axisLine || {}),
            show: true,
            lineStyle: {
                ...((axisConfig?.axisLine || {}).lineStyle || {}),
                color: isDark ? '#9ca3af' : '#475569',
                width: 1,
            },
        },
        axisTick: {
            ...(axisConfig?.axisTick || {}),
            show: true,
        },
        axisLabel: {
            ...(axisConfig?.axisLabel || {}),
            show: true,
            color: isDark ? '#d1d5db' : '#334155',
        },
    };
};

const buildExportReadyOption = ({ option, title, axisFields, isDark }) => {
    const exportOption = applyAllCategoryLabels(
        applyAlwaysOnLabels(deepCloneOption(option || {}), isDark),
        isDark
    );
    const horizontalBar = isHorizontalBarChart(exportOption);

    exportOption.backgroundColor = isDark ? '#111827' : '#ffffff';
    exportOption.title = undefined;

    if (exportOption.grid) {
        if (Array.isArray(exportOption.grid)) {
            exportOption.grid = exportOption.grid.map((grid, idx) => (
                idx === 0
                    ? {
                        ...grid,
                        top: Math.max(Number(grid?.top) || 24, 92),
                        containLabel: true,
                    }
                    : grid
            ));
        } else {
            exportOption.grid = {
                ...exportOption.grid,
                top: Math.max(Number(exportOption.grid?.top) || 24, 92),
                containLabel: true,
            };
        }
    }

    if (exportOption.legend) {
        if (Array.isArray(exportOption.legend)) {
            exportOption.legend = exportOption.legend.map((legend, idx) => ({
                ...legend,
                top: idx === 0 ? 56 : legend?.top,
                textStyle: {
                    ...(legend?.textStyle || {}),
                    color: isDark ? '#d1d5db' : '#334155',
                },
            }));
        } else {
            exportOption.legend = {
                ...exportOption.legend,
                top: 56,
                textStyle: {
                    ...(exportOption.legend?.textStyle || {}),
                    color: isDark ? '#d1d5db' : '#334155',
                },
            };
        }
    }

    const series = Array.isArray(exportOption.series) ? exportOption.series : [];

    const xAxisName = axisFields?.x || 'X-axis';
    const yAxisName = axisFields?.y || 'Y-axis';
    if (Array.isArray(exportOption.xAxis)) {
        exportOption.xAxis = exportOption.xAxis.map((axis) => withAxisMeta(axis, xAxisName, isDark));
    } else if (exportOption.xAxis) {
        exportOption.xAxis = withAxisMeta(exportOption.xAxis, xAxisName, isDark);
    }

    if (Array.isArray(exportOption.yAxis)) {
        exportOption.yAxis = exportOption.yAxis.map((axis) => withAxisMeta(axis, yAxisName, isDark));
    } else if (exportOption.yAxis) {
        exportOption.yAxis = withAxisMeta(exportOption.yAxis, yAxisName, isDark);
    }

    exportOption.series = series.map((seriesItem) => {
        if (!seriesItem || typeof seriesItem !== 'object') return seriesItem;
        const seriesType = String(seriesItem.type || '').toLowerCase();

        if (seriesType === 'bar') {
            return {
                ...seriesItem,
                label: {
                    ...(seriesItem.label || {}),
                    show: true,
                    color: isDark ? '#e5e7eb' : '#0f172a',
                    position: horizontalBar ? 'insideRight' : 'top',
                    formatter: ({ value }) => formatCountLabel(value),
                    fontSize: 10,
                },
                labelLayout: {
                    hideOverlap: true,
                },
            };
        }

        if (seriesType === 'line') {
            return {
                ...seriesItem,
                label: {
                    ...(seriesItem.label || {}),
                    show: true,
                    color: isDark ? '#e5e7eb' : '#0f172a',
                    position: 'top',
                    formatter: ({ value }) => formatCountLabel(value),
                    fontSize: 10,
                },
                labelLayout: {
                    hideOverlap: true,
                },
            };
        }

        if (seriesType === 'pie') {
            return {
                ...seriesItem,
                label: {
                    ...(seriesItem.label || {}),
                    show: true,
                    color: isDark ? '#e5e7eb' : '#0f172a',
                    formatter: '{b}: {c} ({d}%)',
                    fontSize: 10,
                },
                labelLayout: {
                    hideOverlap: true,
                },
                avoidLabelOverlap: true,
            };
        }

        if (seriesType === 'tree') {
            return {
                ...seriesItem,
                label: {
                    ...(seriesItem.label || {}),
                    show: true,
                    color: isDark ? '#e5e7eb' : '#0f172a',
                },
                leaves: {
                    ...(seriesItem.leaves || {}),
                    label: {
                        ...(seriesItem.leaves?.label || {}),
                        show: true,
                        color: isDark ? '#e5e7eb' : '#0f172a',
                    },
                },
            };
        }

        return seriesItem;
    });

    const hasPieSeries = series.some((s) => String(s?.type || '').toLowerCase() === 'pie');
    if (hasPieSeries) {
        exportOption.legend = {
            ...(exportOption.legend || {}),
            top: exportOption.legend?.top ?? 8,
            left: exportOption.legend?.left ?? 'center',
            orient: exportOption.legend?.orient || 'horizontal',
            itemGap: exportOption.legend?.itemGap ?? 12,
            padding: exportOption.legend?.padding ?? [0, 0, 6, 0],
        };
        exportOption.series = (Array.isArray(exportOption.series) ? exportOption.series : []).map((s) => {
            if (String(s?.type || '').toLowerCase() !== 'pie') return s;

            let nextRadius = s?.radius;
            if (typeof nextRadius === 'string') {
                nextRadius = '60%';
            } else if (Array.isArray(nextRadius)) {
                nextRadius = nextRadius.length >= 2 ? ['40%', '60%'] : nextRadius;
            }

            return {
                ...s,
                center: s?.center || ['50%', '68%'],
                radius: nextRadius ?? s?.radius,
            };
        });
    }

    return exportOption;
};

const pieOption = (isDark, items = [], donut = false) => ({
    ...chartBase(isDark),
    legend: { top: 8, textStyle: { color: axisTextColor(isDark) } },
    series: [
        {
            type: 'pie',
            radius: donut ? ['42%', '70%'] : '70%',
            data: toNameValue(items),
        },
    ],
});

const barOption = (isDark, items = [], color = COLORS[0], horizontal = false) => {
    const values = toNameValue(items);
    return {
        ...chartBase(isDark),
        grid: { left: 40, right: 16, top: 20, bottom: 40, containLabel: true },
        xAxis: horizontal
            ? { type: 'value', axisLabel: { color: axisTextColor(isDark) } }
            : { type: 'category', data: values.map((i) => i.name), axisLabel: { color: axisTextColor(isDark), rotate: values.length > 10 ? 30 : 0 } },
        yAxis: horizontal
            ? { type: 'category', data: values.map((i) => i.name), axisLabel: { color: axisTextColor(isDark) } }
            : { type: 'value', axisLabel: { color: axisTextColor(isDark) } },
        series: [{ type: 'bar', data: values.map((i) => i.value), itemStyle: { color } }],
    };
};

const lineOption = (isDark, items = [], color = COLORS[1]) => {
    const values = toNameValue(items);
    return {
        ...chartBase(isDark),
        grid: { left: 40, right: 16, top: 20, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: values.map((i) => i.name), axisLabel: { color: axisTextColor(isDark) } },
        yAxis: { type: 'value', axisLabel: { color: axisTextColor(isDark) } },
        series: [{ type: 'line', smooth: true, data: values.map((i) => i.value), itemStyle: { color } }],
    };
};

const treeOption = (isDark, treeData) => ({
    ...chartBase(isDark),
    series: [
        {
            type: 'tree',
            data: [treeData || { name: 'Organization', children: [] }],
            top: '5%',
            left: '8%',
            bottom: '5%',
            right: '20%',
            symbolSize: 8,
            initialTreeDepth: 2,
            expandAndCollapse: true,
            label: {
                position: 'left',
                verticalAlign: 'middle',
                align: 'right',
                fontSize: 11,
                color: axisTextColor(isDark),
            },
            leaves: {
                label: {
                    position: 'right',
                    align: 'left',
                    color: axisTextColor(isDark),
                },
            },
        },
    ],
});

const isDismissOverlayKey = (key = '') => key === 'Escape' || key === 'Enter' || key === ' ';

const KpiCard = ({ title, value, hint, isDark }) => (
    <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{title}</p>
        <h3 className={`mt-2 text-3xl font-black ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{value}</h3>
        {hint && <p className={`mt-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{hint}</p>}
    </div>
);

const ChartCard = ({ title, option, isDark, height = 320, onEvents, headerExtras = null, renderExpandedControls = null, chartRef = null }) => {
    const [expanded, setExpanded] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const [expandedChartRef, setExpandedChartRef] = useState(null);
    const [expandedZoomPct, setExpandedZoomPct] = useState(100);
    const axisFields = CHART_AXIS_FIELDS[title] || { x: 'Category', y: 'Value' };

    const runExpandedZoom = (factor = 1) => {
        const instance = expandedChartRef?.getEchartsInstance?.();
        if (!instance) return;
        const width = instance.getWidth?.() || 1200;
        const heightPx = instance.getHeight?.() || 700;

        instance.dispatchAction({
            type: 'treeRoam',
            zoom: factor,
            originX: width / 2,
            originY: heightPx / 2,
        });
        setExpandedZoomPct((prev) => Math.max(30, Math.min(350, Math.round(prev * factor))));
    };

    const resetExpandedView = () => {
        const instance = expandedChartRef?.getEchartsInstance?.();
        if (!instance) return;
        instance.dispatchAction({ type: 'restore' });
        setExpandedZoomPct(100);
    };

    useEffect(() => {
        if (!expanded) return;
        setExpandedZoomPct(100);

        const onKeyDown = (event) => {
            if (isDismissOverlayKey(event.key)) {
                setExpanded(false);
            }
        };

        globalThis.addEventListener('keydown', onKeyDown);
        return () => globalThis.removeEventListener('keydown', onKeyDown);
    }, [expanded]);

    const getExpandedChartImage = async () => {
        const instance = expandedChartRef?.getEchartsInstance?.();
        if (!instance) {
            throw new Error('Chart is not ready for export');
        }

        const originalOption = instance.getOption();
        const exportOption = buildExportReadyOption({ option: originalOption, title, axisFields, isDark });

        instance.setOption(exportOption, true);
        await new Promise((resolve) => setTimeout(resolve, 120));

        const width = instance.getWidth?.() || 1200;
        const heightPx = instance.getHeight?.() || 700;
        const dataUrl = instance.getDataURL({
            type: 'png',
            pixelRatio: 2,
            backgroundColor: isDark ? '#111827' : '#ffffff',
        });

        instance.setOption(originalOption, true);

        return { dataUrl, width, height: heightPx };
    };

    const triggerDownload = (href, fileName) => {
        const a = document.createElement('a');
        a.href = href;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const exportPng = async () => {
        setExportError('');
        setIsExporting(true);
        try {
            const { dataUrl } = await getExpandedChartImage();
            triggerDownload(dataUrl, `${toSafeFileName(title)}.png`);
        } catch (error) {
            setExportError(error?.message || 'Failed to export PNG');
        } finally {
            setIsExporting(false);
        }
    };

    const exportPdf = async () => {
        setExportError('');
        setIsExporting(true);
        try {
            const { dataUrl, width, height: imageHeight } = await getExpandedChartImage();
            const pdf = appendChartPdfPage(null, {
                title,
                axisFields,
                dataUrl,
                width,
                height: imageHeight,
            });
            pdf.save(`${toSafeFileName(title)}.pdf`);
        } catch (error) {
            setExportError(error?.message || 'Failed to export PDF');
        } finally {
            setIsExporting(false);
        }
    };

    const labeledOption = useMemo(() => {
        const withLabels = applyAlwaysOnLabels(option, isDark);
        return applyAllCategoryLabels(withLabels, isDark);
    }, [option, isDark]);

    return (
        <>
            <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <h3 className={`text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
                        <p className={`mt-1 text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            X-axis: {axisFields.x} · Y-axis: {axisFields.y}
                        </p>
                        {headerExtras}
                    </div>
                    <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        className={`rounded-lg border px-2 py-1 text-xs font-semibold ${isDark ? 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                        Expand
                    </button>
                </div>
                <ReactECharts
                    ref={chartRef}
                    option={labeledOption}
                    style={{ width: '100%', height }}
                    notMerge
                    lazyUpdate
                    onEvents={onEvents}
                />
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
                            <div>
                                <h3 className={`text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
                                <p className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    X-axis: {axisFields.x} · Y-axis: {axisFields.y}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {isExporting && (
                                    <span
                                        className={`inline-flex h-4 w-4 animate-spin rounded-full border-2 ${isDark ? 'border-gray-600 border-t-gray-200' : 'border-gray-300 border-t-gray-700'}`}
                                        aria-label="Exporting"
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={exportPng}
                                    disabled={isExporting}
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${isDark ? 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'} ${isExporting ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                    Export PNG
                                </button>
                                <button
                                    type="button"
                                    onClick={exportPdf}
                                    disabled={isExporting}
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${isDark ? 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'} ${isExporting ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                    Export PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setExpanded(false)}
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${isDark ? 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                                >
                                    Close
                                </button>
                            </div>
                        </div>

                        {exportError && (
                            <p className={`mb-2 text-xs ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{exportError}</p>
                        )}

                        {typeof renderExpandedControls === 'function' && (
                            <div className="mb-3">
                                {renderExpandedControls({
                                    zoomPct: expandedZoomPct,
                                    zoomIn: () => runExpandedZoom(1.15),
                                    zoomOut: () => runExpandedZoom(0.87),
                                    resetZoom: resetExpandedView,
                                    close: () => setExpanded(false),
                                })}
                            </div>
                        )}

                        <ReactECharts
                            ref={(ref) => setExpandedChartRef(ref)}
                            option={labeledOption}
                            style={{ width: '100%', height: 'calc(92vh - 90px)' }}
                            notMerge
                            lazyUpdate
                            onEvents={onEvents}
                        />
                    </div>
                </div>
            )}
        </>
    );
};

const OrgFilterControls = ({
    isDark,
    orgSearchQuery,
    orgDepartmentFilter,
    orgDepartmentOptions,
    orgSelectedPathNames,
    onOrgSearchChange,
    onOrgDepartmentChange,
    onCollapseAll,
    onExpandAll,
    onReset,
    showZoomControls = false,
    showSelectedPath = true,
    zoomPct = 100,
    onZoomIn = null,
    onZoomOut = null,
}) => (
    <div className="flex flex-wrap items-center gap-2">
        <input
            value={orgSearchQuery}
            onChange={onOrgSearchChange}
            placeholder="Search employee..."
            className={`px-2 py-1 rounded border text-[11px] ${isDark ? 'bg-gray-900 border-gray-600 text-gray-100 placeholder:text-gray-500' : 'bg-white border-gray-300 text-gray-700 placeholder:text-gray-400'}`}
        />
        <select
            value={orgDepartmentFilter}
            onChange={onOrgDepartmentChange}
            className={`px-2 py-1 rounded border text-[11px] ${isDark ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-700'}`}
        >
            <option value="__all__">All Departments</option>
            {orgDepartmentOptions.map((dep) => (
                <option key={dep} value={dep}>{dep}</option>
            ))}
        </select>
        <button
            type="button"
            onClick={onCollapseAll}
            className={`rounded border px-2 py-1 text-[10px] font-semibold ${isDark ? 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
        >
            Collapse All
        </button>
        <button
            type="button"
            onClick={onExpandAll}
            className={`rounded border px-2 py-1 text-[10px] font-semibold ${isDark ? 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
        >
            Expand All
        </button>
        <button
            type="button"
            onClick={onReset}
            className={`rounded border px-2 py-1 text-[10px] font-semibold ${isDark ? 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
        >
            Reset
        </button>

        {showZoomControls && (
            <div className="ml-auto flex items-center gap-2">
                <button
                    type="button"
                    onClick={onZoomIn}
                    className={`rounded border px-2 py-1 text-[10px] font-semibold ${isDark ? 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                    Zoom +
                </button>
                <button
                    type="button"
                    onClick={onZoomOut}
                    className={`rounded border px-2 py-1 text-[10px] font-semibold ${isDark ? 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                    Zoom -
                </button>
                <span className={`text-[11px] font-semibold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{zoomPct}%</span>
            </div>
        )}

        {showSelectedPath && orgSelectedPathNames.length > 0 && (
            <span className={`max-w-full truncate text-[10px] ${isDark ? 'text-gray-300' : 'text-gray-600'}`} title={orgSelectedPathNames.join(' / ')}>
                {orgSelectedPathNames.join(' / ')}
            </span>
        )}
    </div>
);

const TemplateStateCard = ({ isDark, children }) => (
    <section className={`cv-template-page ${isDark ? 'cv-template-page--dark' : ''}`}>
        <div className="cv-state-card">{children}</div>
    </section>
);

const HRDashboardNotices = ({
    exportAllError,
    loading,
    error,
    mappingMissingFields,
    hasValidationWarnings,
    validation,
}) => (
    <>
        {exportAllError && (
            <div className="cv-validation-summary">
                <p>{exportAllError}</p>
            </div>
        )}

        {loading && <div className="cv-state-card">Generating HR analytics...</div>}
        {!loading && error && <div className="cv-validation-summary"><p>{error}</p></div>}

        {!loading && !error && mappingMissingFields.length > 0 && (
            <div className="cv-validation-summary">
                <p>
                    Partial analysis mode: some template fields were not mapped ({mappingMissingFields.join(', ')}).
                    Related analytics are not available for missing fields.
                </p>
            </div>
        )}

        {!loading && !error && hasValidationWarnings && (
            <div className="cv-validation-summary">
                {validation.map((v) => (
                    <div key={v.module}>
                        {v.missingFields?.length > 0 && <p>{v.module}: missing fields - {v.missingFields.join(', ')}</p>}
                        {v.typeWarnings?.length > 0 && <p>{v.module}: type warnings - {v.typeWarnings.map((w) => w.field).join(', ')}</p>}
                    </div>
                ))}
            </div>
        )}
    </>
);

const MappedFieldsCard = ({ isDark, mappedFields }) => (
    <div data-tour="templates-dashboard-mapped-fields" className={`rounded-2xl border p-4 mb-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h3 className={`text-sm font-bold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Mapped Fields</h3>
        {mappedFields.length === 0 ? (
            <p className={isDark ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>No field mappings found.</p>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs">
                {mappedFields.map(([field, column]) => (
                    <div key={field} className={`px-2 py-1 rounded border ${isDark ? 'border-gray-600 bg-gray-900 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                        <strong>{field}</strong> → {column}
                    </div>
                ))}
            </div>
        )}
    </div>
);

const HRSummaryKpis = ({
    isDark,
    summaryTotal,
    summaryActive,
    summaryInactive,
    attrRatePct,
    avgExp,
    probationSuccess,
    completenessPct,
    missingEmergencyContact,
}) => (
    <div data-tour="templates-dashboard-kpis" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Total Employees" value={summaryTotal} hint="Across mapped dataset" isDark={isDark} />
        <KpiCard title="Active Employees" value={summaryActive} hint="Current active workforce" isDark={isDark} />
        <KpiCard title="Inactive Employees" value={summaryInactive} hint="Derived from workforce status" isDark={isDark} />
        <KpiCard title="Attrition Rate" value={`${Number(attrRatePct || 0).toFixed(2)}%`} hint="Based on exits" isDark={isDark} />
        <KpiCard title="Avg Experience" value={`${Number(avgExp || 0).toFixed(2)} yrs`} hint="Experience module" isDark={isDark} />
        <KpiCard title="Probation Success" value={`${Number(probationSuccess || 0).toFixed(2)}%`} hint="Lifecycle module" isDark={isDark} />
        <KpiCard title="Completeness" value={`${Number(completenessPct || 0).toFixed(2)}%`} hint="Data quality module" isDark={isDark} />
        <KpiCard title="Missing Emergency Contacts" value={missingEmergencyContact} hint="Contact module" isDark={isDark} />
    </div>
);

const toSafeFileName = (title = 'chart') => {
    const text = String(title || 'chart').toLowerCase();
    let out = '';
    let lastDash = false;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const code = ch.charCodeAt(0);
        const isLetter = code >= 97 && code <= 122;
        const isDigit = code >= 48 && code <= 57;
        if (isLetter || isDigit) {
            out += ch;
            lastDash = false;
            continue;
        }
        if (!lastDash) {
            out += '-';
            lastDash = true;
        }
    }
    while (out.startsWith('-')) out = out.slice(1);
    while (out.endsWith('-')) out = out.slice(0, -1);
    return out || 'chart';
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

const appendChartPdfPage = (pdf, image) => {
    const orientation = image.width >= image.height ? 'landscape' : 'portrait';
    const nextPdf = pdf || new jsPDF({ orientation, unit: 'pt', format: 'a4' });
    if (pdf) {
        nextPdf.addPage('a4', orientation);
    }
    const pageWidth = nextPdf.internal.pageSize.getWidth();
    const pageHeight = nextPdf.internal.pageSize.getHeight();
    const margin = 24;
    const headerY = 24;
    const axisLine = `X-axis: ${image.axisFields.x} | Y-axis: ${image.axisFields.y}`;
    nextPdf.setFontSize(14);
    nextPdf.setTextColor(30, 41, 59);
    nextPdf.text(String(image.title || 'Chart'), margin, headerY);
    nextPdf.setFontSize(10);
    nextPdf.setTextColor(71, 85, 105);
    nextPdf.text(axisLine, margin, headerY + 16);
    nextPdf.text(`Exported on: ${new Date().toLocaleString()}`, margin, headerY + 30);
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin * 2 - 44;
    const ratio = Math.min(maxW / image.width, maxH / image.height);
    const renderWidth = image.width * ratio;
    const renderHeight = image.height * ratio;
    const x = (pageWidth - renderWidth) / 2;
    const y = headerY + 44 + ((maxH - renderHeight) / 2);
    nextPdf.addImage(image.dataUrl, 'PNG', x, y, renderWidth, renderHeight, undefined, 'FAST');
    return nextPdf;
};
const collectChartExportImages = async (entries = [], getChartImageFromRef) => {
    const images = [];
    for (const entry of entries) {
        const { title, ref } = entry || {};
        // eslint-disable-next-line no-await-in-loop
        const image = await getChartImageFromRef(ref, title);
        if (image) images.push(image);
    }
    return images;
};

const buildSharedDashboardUrl = ({ reportId, shareToken, pathTemplate }) => {
    const basePathRaw = String(import.meta.env.BASE_URL || '/').trim() || '/';
    const sharePath = joinPathSegments(basePathRaw, pathTemplate, encodeURIComponent(reportId));
    const url = new URL(globalThis.location.origin + sharePath);
    url.searchParams.set('shareToken', shareToken);
    return url.toString();
};

const summarizeHrModuleResponses = (moduleNames = [], responses = []) => {
    const nextAnalytics = {};
    const validationList = [];
    let successCount = 0;

    responses.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
            const value = res.value;
            nextAnalytics[value.module] = value.data || {};
            if (value.validation) {
                validationList.push({ module: value.module, ...value.validation });
            }
            successCount += 1;
            return;
        }

        const moduleName = moduleNames[idx];
        validationList.push({
            module: moduleName,
            missingFields: [],
            missingColumns: [],
            typeWarnings: [],
            isValid: false,
            error: res.reason?.message || 'Module unavailable',
        });
    });

    return { nextAnalytics, validationList, successCount };
};

const canLoadHrDashboardAnalytics = ({ id, mapping, datasetData }) => (
    id === 'hr' && !!mapping && Array.isArray(datasetData) && datasetData.length > 0
);

const fetchHrModuleResponses = ({ datasetData, mapping }) => {
    const payload = { data: datasetData, mapping };
    return Promise.allSettled(
        MODULES.map((moduleName) => backendApi.getHrAnalytics(moduleName, payload))
    );
};

const extractHrKpiValues = (analytics) => ({
    summaryTotal: readKpi(analytics, 'summary', 'totalEmployees', ['totalEmployees']),
    summaryActive: readKpi(analytics, 'summary', 'activeEmployees', ['activeEmployees']),
    summaryInactive: readKpi(analytics, 'summary', 'inactiveEmployees', ['inactiveEmployees']),
    attrRatePct: readKpi(analytics, 'attrition', 'attrition_rate_percentage', ['attritionRate']),
    avgExp: readKpi(analytics, 'experience', 'avg_experience', ['averageExperience']),
    probationSuccess: readKpi(analytics, 'lifecycle', 'probation_success_rate', ['probationSuccessRate']),
    completenessPct: readKpi(analytics, 'data-quality', 'completeness_percentage', ['completenessPercentage']),
    missingPan: readKpi(analytics, 'compliance', 'missingPAN', ['missingPAN']),
    missingAadhar: readKpi(analytics, 'compliance', 'missingAadhar', ['missingAadhar']),
    missingPf: readKpi(analytics, 'compliance', 'missingPF', ['missingPF']),
    missingUan: readKpi(analytics, 'compliance', 'missingUAN', ['missingUAN']),
    missingEmergencyContact: readKpi(analytics, 'contact', 'missingEmergencyContact', ['missingEmergencyContact']),
    totalNullValues: readKpi(analytics, 'data-quality', 'total_null_values'),
    duplicateEmployeeCount: readKpi(analytics, 'data-quality', 'duplicate_employees', ['duplicateEmployees']),
});

const extractHrChartValues = (analytics) => ({
    deptItems: readChart(analytics, 'summary', 'headcount_by_department', ['headcountByDepartment']),
    businessUnitItems: readChart(analytics, 'summary', 'headcount_by_business_unit', ['headcountByBusinessUnit']),
    locationItems: readChart(analytics, 'summary', 'headcount_by_location', ['headcountByLocation']),
    workforceCategoryItems: readChart(analytics, 'summary', 'workforce_category_distribution', ['workforceCategoryDistribution']),
    genderItems: readChart(analytics, 'summary', 'gender_ratio', ['genderRatio']),
    maritalStatusItems: readChart(analytics, 'summary', 'marital_status_distribution', ['maritalStatusDistribution']),
    ageItems: readChart(analytics, 'demographics', 'age_distribution', ['ageDistribution']),
    genderByDepartmentRaw: readChart(analytics, 'demographics', 'gender_by_department', ['genderDiversityByDepartment']),
    nationalityItems: readChart(analytics, 'demographics', 'nationality_distribution', ['nationalityDistribution']),
    demographicLocationItems: readChart(analytics, 'demographics', 'location_distribution', ['locationDistribution']),
    monthlyHiring: readChart(analytics, 'hiring', 'monthly_hiring_trend', ['monthlyHiringTrend']),
    yearlyHiring: readChart(analytics, 'hiring', 'yearly_hiring_trend', ['yearlyHiringTrend']),
    hiringByDepartment: readChart(analytics, 'hiring', 'hiring_by_department', ['hiringByDepartment']),
    hiringByLocation: readChart(analytics, 'hiring', 'hiring_by_location', ['hiringByLocation']),
    voluntaryVsInvoluntary: readChart(analytics, 'attrition', 'voluntary_vs_involuntary'),
    exitsByDepartment: readChart(analytics, 'attrition', 'exits_by_department', ['exitsByDepartment']),
    exitsByManager: readChart(analytics, 'attrition', 'exits_by_manager', ['exitsByManager']),
    topExitReasons: readChart(analytics, 'attrition', 'top_exit_reasons', ['topExitReasons']),
    attritionByExperience: readChart(analytics, 'attrition', 'attrition_by_experience', ['attritionByExperience']),
    experienceDistribution: readChart(analytics, 'experience', 'experience_distribution', ['experienceDistribution']),
    seniorVsJuniorRatio: readChart(analytics, 'experience', 'senior_vs_junior_ratio'),
    orgTree: readChart(analytics, 'org', 'org_tree', ['hierarchy']),
    managerTeamSize: readChart(analytics, 'org', 'manager_team_size', ['managerWiseTeamSize']),
    paymentModeDistribution: readChart(analytics, 'payroll', 'payment_mode_distribution', ['paymentModeDistribution']),
    bankDistribution: readChart(analytics, 'payroll', 'bank_distribution', ['bankDistribution']),
    qualificationDistribution: readChart(analytics, 'education', 'qualification_distribution', ['qualificationDistribution']),
    specializationDistribution: readChart(analytics, 'education', 'specialization_distribution', ['specializationDistribution']),
    courseTypeDistribution: readChart(analytics, 'education', 'course_type_distribution', ['courseTypeDistribution']),
    locationDistribution: readChart(analytics, 'location', 'location_distribution', ['locationDistribution']),
    transferTrends: readChart(analytics, 'location', 'transfer_trends', ['transferTrends']),
    movementReasons: readChart(analytics, 'location', 'movement_reasons', ['movementReasons']),
    headcountPerDepartment: readChart(analytics, 'department', 'headcount_per_department', ['headcountPerDepartment']),
    attritionPerDepartment: readChart(analytics, 'department', 'attrition_per_department', ['attritionPerDepartment']),
    lifecycleDuration: readChart(analytics, 'lifecycle', 'lifecycle_duration'),
    nullDistributionPerColumn: readChart(analytics, 'data-quality', 'null_distribution_per_column', ['nullCountsPerColumn']),
    duplicateEmployees: asArray(analytics?.['data-quality']?.duplicateEmployees),
    relationshipDistribution: readChart(analytics, 'contact', 'relationship_distribution', ['relationshipDistribution']),
});

const parseOrgChartClick = (params = {}) => {
    const pathInfo = Array.isArray(params?.treePathInfo) ? params.treePathInfo : [];
    const names = pathInfo.map((p) => p?.name).filter(Boolean);
    const ids = pathInfo
        .map((p) => p?.data?.id || p?.data?.key || p?.name || '')
        .map(String)
        .map((value) => value.trim())
        .filter(Boolean);
    const clickedId = String(params?.data?.id || params?.data?.key || params?.name || '').trim();
    return { names, ids, clickedId };
};

const normalizeGenderByDepartmentRows = (rows = []) => {
    const normalized = [];

    rows.forEach((row) => {
        if (Array.isArray(row?.distribution)) {
            row.distribution.forEach((entry) => {
                normalized.push({ department: row.department || 'Unknown', gender: entry.name || 'Unknown', value: Number(entry.value || 0) });
            });
            return;
        }

        normalized.push({
            department: row.department || 'Unknown',
            gender: row.gender || 'Unknown',
            value: Number(row.value || 0),
        });
    });

    return normalized;
};

const buildGenderByDepartmentChartData = (rows = []) => {
    const departments = Array.from(new Set(rows.map((i) => i.department)));
    const genders = Array.from(new Set(rows.map((i) => i.gender)));
    const valueByKey = new Map(rows.map((i) => [`${i.department}::${i.gender}`, i.value]));

    return {
        departments,
        series: genders.map((gender, idx) => ({
            name: gender,
            type: 'bar',
            data: departments.map((dept) => valueByKey.get(`${dept}::${gender}`) || 0),
            itemStyle: { color: COLORS[idx % COLORS.length] },
        })),
    };
};

const HRDashboardChartsGrid = ({
    isDark,
    registerChartRef,
    deptItems,
    genderItems,
    businessUnitItems,
    locationItems,
    workforceCategoryItems,
    maritalStatusItems,
    ageItems,
    monthlyHiring,
    yearlyHiring,
    hiringByDepartment,
    hiringByLocation,
    genderByDepartmentChart,
    nationalityItems,
    demographicLocationItems,
    voluntaryVsInvoluntary,
    attritionBarData,
    exitsByManager,
    topExitReasons,
    attritionByExperience,
    experienceDistribution,
    seniorVsJuniorRatio,
    orgChartEvents,
    orgHeaderExtras,
    renderExpandedOrgControls,
    orgChartOption,
    managerTeamSize,
    paymentModeDistribution,
    bankDistribution,
    qualificationDistribution,
    specializationDistribution,
    courseTypeDistribution,
    locationDistribution,
    transferTrends,
    movementReasons,
    headcountPerDepartment,
    attritionPerDepartment,
    lifecycleDuration,
    nullDistributionPerColumn,
    relationshipDistribution,
    missingPan,
    missingAadhar,
    missingPf,
    missingUan,
    totalNullValues,
    duplicateEmployeeCount,
    duplicateEmployees,
}) => (
    <div data-tour="templates-dashboard-charts" className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <ChartCard
            title="Department Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Department Distribution')}
            option={{
                ...chartBase(isDark),
                ...barOption(isDark, deptItems, COLORS[0]),
            }}
        />

        <ChartCard
            title="Gender Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Gender Distribution')}
            option={{
                ...chartBase(isDark),
                ...pieOption(isDark, genderItems, true),
            }}
        />

        <ChartCard
            title="Business Unit Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Business Unit Distribution')}
            option={{
                ...barOption(isDark, businessUnitItems, COLORS[1]),
            }}
        />

        <ChartCard
            title="Location Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Location Distribution', 'summary-location-distribution')}
            option={{
                ...barOption(isDark, locationItems, COLORS[2]),
            }}
        />

        <ChartCard
            title="Workforce Category Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Workforce Category Distribution')}
            option={{
                ...pieOption(isDark, workforceCategoryItems, true),
            }}
        />

        <ChartCard
            title="Marital Status Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Marital Status Distribution')}
            option={{
                ...pieOption(isDark, maritalStatusItems, true),
            }}
        />

        <ChartCard
            title="Age Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Age Distribution')}
            option={{
                ...barOption(isDark, ageItems, COLORS[2]),
            }}
        />

        <ChartCard
            title="Monthly Hiring Trend"
            isDark={isDark}
            chartRef={registerChartRef('Monthly Hiring Trend')}
            option={{
                ...lineOption(isDark, monthlyHiring, COLORS[3]),
            }}
        />

        <ChartCard
            title="Yearly Hiring Trend"
            isDark={isDark}
            chartRef={registerChartRef('Yearly Hiring Trend')}
            option={{
                ...barOption(isDark, yearlyHiring, COLORS[4]),
            }}
        />

        <ChartCard
            title="Hiring by Department"
            isDark={isDark}
            chartRef={registerChartRef('Hiring by Department')}
            option={{
                ...barOption(isDark, hiringByDepartment, COLORS[5]),
            }}
        />

        <ChartCard
            title="Hiring by Location"
            isDark={isDark}
            chartRef={registerChartRef('Hiring by Location')}
            option={{
                ...barOption(isDark, hiringByLocation, COLORS[6]),
            }}
        />

        <ChartCard
            title="Gender by Department"
            isDark={isDark}
            chartRef={registerChartRef('Gender by Department')}
            option={{
                ...chartBase(isDark),
                legend: { top: 8, textStyle: { color: axisTextColor(isDark) } },
                xAxis: { type: 'category', data: genderByDepartmentChart.departments, axisLabel: { color: axisTextColor(isDark) } },
                yAxis: { type: 'value', axisLabel: { color: axisTextColor(isDark) } },
                series: genderByDepartmentChart.series,
            }}
        />

        <ChartCard
            title="Nationality Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Nationality Distribution')}
            option={{
                ...pieOption(isDark, nationalityItems),
            }}
        />

        <ChartCard
            title="Demographic Location Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Demographic Location Distribution')}
            option={{
                ...barOption(isDark, demographicLocationItems, COLORS[0]),
            }}
        />

        <ChartCard
            title="Voluntary vs Involuntary Exits"
            isDark={isDark}
            chartRef={registerChartRef('Voluntary vs Involuntary Exits')}
            option={{
                ...pieOption(isDark, voluntaryVsInvoluntary, true),
            }}
        />

        <ChartCard
            title="Attrition by Department"
            isDark={isDark}
            chartRef={registerChartRef('Attrition by Department')}
            option={{
                ...chartBase(isDark),
                grid: { left: 40, right: 16, top: 20, bottom: 40, containLabel: true },
                legend: { top: 0, textStyle: { color: axisTextColor(isDark) } },
                xAxis: { type: 'category', data: attritionBarData.map((d) => d.name), axisLabel: { color: axisTextColor(isDark) } },
                yAxis: { type: 'value', axisLabel: { color: axisTextColor(isDark) } },
                series: [
                    { name: 'Exits', type: 'bar', data: attritionBarData.map((d) => d.value), itemStyle: { color: '#dc2626' } },
                    { name: 'Headcount', type: 'line', data: attritionBarData.map((d) => d.total), itemStyle: { color: '#2563eb' } },
                ],
            }}
        />

        <ChartCard
            title="Exits by Manager"
            isDark={isDark}
            chartRef={registerChartRef('Exits by Manager')}
            option={{
                ...barOption(isDark, exitsByManager, COLORS[4], true),
            }}
        />

        <ChartCard
            title="Top Exit Reasons"
            isDark={isDark}
            chartRef={registerChartRef('Top Exit Reasons')}
            option={{
                ...barOption(isDark, topExitReasons, COLORS[3], true),
            }}
        />

        <ChartCard
            title="Attrition by Experience"
            isDark={isDark}
            chartRef={registerChartRef('Attrition by Experience')}
            option={{
                ...barOption(isDark, attritionByExperience, COLORS[2]),
            }}
        />

        <ChartCard
            title="Experience Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Experience Distribution')}
            option={{
                ...barOption(isDark, experienceDistribution, COLORS[1]),
            }}
        />

        <ChartCard
            title="Senior vs Junior Ratio"
            isDark={isDark}
            chartRef={registerChartRef('Senior vs Junior Ratio')}
            option={{
                ...pieOption(isDark, seniorVsJuniorRatio, true),
            }}
        />

        <ChartCard
            title="Organization Tree"
            isDark={isDark}
            height={420}
            chartRef={registerChartRef('Organization Tree')}
            onEvents={orgChartEvents}
            headerExtras={orgHeaderExtras}
            renderExpandedControls={renderExpandedOrgControls}
            option={{
                ...orgChartOption,
            }}
        />

        <ChartCard
            title="Manager Team Size"
            isDark={isDark}
            chartRef={registerChartRef('Manager Team Size')}
            option={{
                ...barOption(isDark, managerTeamSize, COLORS[0], true),
            }}
        />

        <ChartCard
            title="Payment Mode Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Payment Mode Distribution')}
            option={{
                ...pieOption(isDark, paymentModeDistribution, true),
            }}
        />

        <ChartCard
            title="Bank Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Bank Distribution')}
            option={{
                ...barOption(isDark, bankDistribution, COLORS[5], true),
            }}
        />

        <ChartCard
            title="Qualification Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Qualification Distribution')}
            option={{
                ...barOption(isDark, qualificationDistribution, COLORS[1]),
            }}
        />

        <ChartCard
            title="Specialization Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Specialization Distribution')}
            option={{
                ...barOption(isDark, specializationDistribution, COLORS[2], true),
            }}
        />

        <ChartCard
            title="Course Type Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Course Type Distribution')}
            option={{
                ...pieOption(isDark, courseTypeDistribution, true),
            }}
        />

        <ChartCard
            title="Location Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Location Distribution', 'detail-location-distribution')}
            option={{
                ...barOption(isDark, locationDistribution, COLORS[0]),
            }}
        />

        <ChartCard
            title="Transfer Trends"
            isDark={isDark}
            chartRef={registerChartRef('Transfer Trends')}
            option={{
                ...barOption(isDark, transferTrends, COLORS[3], true),
            }}
        />

        <ChartCard
            title="Movement Reasons"
            isDark={isDark}
            chartRef={registerChartRef('Movement Reasons')}
            option={{
                ...barOption(isDark, movementReasons, COLORS[4], true),
            }}
        />

        <ChartCard
            title="Headcount per Department"
            isDark={isDark}
            chartRef={registerChartRef('Headcount per Department')}
            option={{
                ...barOption(isDark, headcountPerDepartment, COLORS[1]),
            }}
        />

        <ChartCard
            title="Attrition per Department"
            isDark={isDark}
            chartRef={registerChartRef('Attrition per Department')}
            option={{
                ...barOption(isDark, attritionPerDepartment, COLORS[4]),
            }}
        />

        <ChartCard
            title="Lifecycle Duration (Months)"
            isDark={isDark}
            chartRef={registerChartRef('Lifecycle Duration (Months)')}
            option={{
                ...barOption(isDark, asArray(lifecycleDuration).slice(0, 50), COLORS[6], true),
            }}
        />

        <ChartCard
            title="Null Distribution per Column"
            isDark={isDark}
            chartRef={registerChartRef('Null Distribution per Column')}
            option={{
                ...barOption(isDark, asArray(nullDistributionPerColumn).slice(0, 40), COLORS[4], true),
            }}
        />

        <ChartCard
            title="Emergency Relationship Distribution"
            isDark={isDark}
            chartRef={registerChartRef('Emergency Relationship Distribution')}
            option={{
                ...pieOption(isDark, relationshipDistribution, true),
            }}
        />

        <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h3 className={`mb-3 text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Compliance & Data Quality KPIs</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
                <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>Missing PAN: <strong>{missingPan}</strong></div>
                <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>Missing Aadhar: <strong>{missingAadhar}</strong></div>
                <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>Missing PF: <strong>{missingPf}</strong></div>
                <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>Missing UAN: <strong>{missingUan}</strong></div>
                <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>Total Null Values: <strong>{totalNullValues}</strong></div>
                <div className={isDark ? 'text-gray-300' : 'text-gray-700'}>Duplicate Employees: <strong>{duplicateEmployeeCount}</strong></div>
            </div>
            {duplicateEmployees.length > 0 && (
                <div className="mt-4">
                    <p className={`text-xs mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Duplicate Employee IDs</p>
                    <div className="max-h-44 overflow-auto text-xs">
                        {duplicateEmployees.slice(0, 100).map((item) => (
                            <div key={item.employeeId} className={`py-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                {item.employeeId}: {item.count}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    </div>
);

const HRTemplateDashboard = ({ sessionByTemplate, datasetData = [], isSharedView = false }) => {
    const { id } = useParams();
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const session = sessionByTemplate?.[id] || null;
    const mapping = session?.mapping || null;
    const mappingMissingFields = Array.isArray(session?.missingFields) ? session.missingFields : [];

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [analytics, setAnalytics] = useState({});
    const [validation, setValidation] = useState([]);
    const [orgSearchQuery, setOrgSearchQuery] = useState('');
    const [orgTreeExpandMode, setOrgTreeExpandMode] = useState('default');
    const [orgSelectedPathIds, setOrgSelectedPathIds] = useState([]);
    const [orgSelectedPathNames, setOrgSelectedPathNames] = useState([]);
    const [orgSelectedNodeId, setOrgSelectedNodeId] = useState('');
    const [orgDepartmentFilter, setOrgDepartmentFilter] = useState('__all__');
    const [exportAllLoading, setExportAllLoading] = useState(false);
    const [exportAllError, setExportAllError] = useState('');
    const [isSharingDashboard, setIsSharingDashboard] = useState(false);
    const chartRefs = useRef(new Map());

    const shareDashboard = useCallback(async () => {
        if (isSharedView || isSharingDashboard) return;
        if (!mapping || !Array.isArray(datasetData) || datasetData.length === 0) {
            globalThis.alert?.('Dashboard data is not ready to share yet.');
            return;
        }

        const rawRecipients = globalThis.prompt?.('Enter recipient emails (comma separated):', '') ?? '';
        const recipientEmails = Array.from(new Set(
            String(rawRecipients || '')
                .split(',')
                .map((item) => String(item || '').trim().toLowerCase())
                .filter(Boolean)
        ));
        if (recipientEmails.length === 0) {
            globalThis.alert?.('Please add at least one recipient email.');
            return;
        }

        setIsSharingDashboard(true);
        try {
            const payload = {
                name: `HR Dashboard ${new Date().toLocaleString()}`,
                pages: [{ id: 'hr-dashboard', name: 'HR Dashboard' }],
                charts: [
                    {
                        id: 'hr-template-dashboard-snapshot',
                        type: 'hr-template-dashboard',
                        payload: {
                            templateId: id || 'hr',
                            mapping,
                            missingFields: mappingMissingFields,
                            datasetData,
                        },
                    },
                ],
                global_filters: [],
                selected_dataset_id: null,
                active_page_id: 'hr-dashboard',
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
                pathTemplate: '/templates/hr/dashboard/shared',
            });

            if (globalThis.navigator?.clipboard?.writeText) {
                await globalThis.navigator.clipboard.writeText(finalUrl);
                globalThis.alert?.('HR dashboard share link copied to clipboard.');
                return;
            }

            globalThis.prompt?.('Copy your HR dashboard share link:', finalUrl);
        } catch (error) {
            globalThis.alert?.(error?.message || 'Unable to generate HR dashboard share link.');
        } finally {
            setIsSharingDashboard(false);
        }
    }, [isSharedView, isSharingDashboard, mapping, datasetData, id, mappingMissingFields]);

    const registerChartRef = useCallback((title, key = title) => (ref) => {
        if (!title) return;
        const mapKey = key || title;
        if (ref) chartRefs.current.set(mapKey, { title, ref });
        else chartRefs.current.delete(mapKey);
    }, []);

    useEffect(() => {
        let mounted = true;

        const run = async () => {
            if (!canLoadHrDashboardAnalytics({ id, mapping, datasetData })) return;

            setLoading(true);
            setError('');

            try {
                const responses = await fetchHrModuleResponses({ datasetData, mapping });

                if (!mounted) return;

                const { nextAnalytics, validationList, successCount } = summarizeHrModuleResponses(MODULES, responses);

                setAnalytics(nextAnalytics);
                setValidation(validationList);
                setError(successCount > 0 ? '' : 'Failed to load HR analytics');
            } catch (e) {
                if (!mounted) return;
                setError(e?.message || 'Failed to load HR analytics');
            } finally {
                if (mounted) setLoading(false);
            }
        };

        run();

        return () => {
            mounted = false;
        };
    }, [id, mapping, datasetData]);

    const hasValidationWarnings = useMemo(
        () => validation.some((v) => (v?.missingFields?.length || 0) > 0 || (v?.typeWarnings?.length || 0) > 0),
        [validation]
    );
    const kpiValues = useMemo(() => extractHrKpiValues(analytics), [analytics]);
    const chartValues = useMemo(() => extractHrChartValues(analytics), [analytics]);

    const {
        summaryTotal,
        summaryActive,
        summaryInactive,
        attrRatePct,
        avgExp,
        probationSuccess,
        completenessPct,
        missingPan,
        missingAadhar,
        missingPf,
        missingUan,
        missingEmergencyContact,
        totalNullValues,
        duplicateEmployeeCount,
    } = kpiValues;

    const {
        deptItems,
        businessUnitItems,
        locationItems,
        workforceCategoryItems,
        genderItems,
        maritalStatusItems,
        ageItems,
        genderByDepartmentRaw,
        nationalityItems,
        demographicLocationItems,
        monthlyHiring,
        yearlyHiring,
        hiringByDepartment,
        hiringByLocation,
        voluntaryVsInvoluntary,
        exitsByDepartment,
        exitsByManager,
        topExitReasons,
        attritionByExperience,
        experienceDistribution,
        seniorVsJuniorRatio,
        orgTree,
        managerTeamSize,
        paymentModeDistribution,
        bankDistribution,
        qualificationDistribution,
        specializationDistribution,
        courseTypeDistribution,
        locationDistribution,
        transferTrends,
        movementReasons,
        headcountPerDepartment,
        attritionPerDepartment,
        lifecycleDuration,
        nullDistributionPerColumn,
        duplicateEmployees,
        relationshipDistribution,
    } = chartValues;

    const orgDepartmentOptions = useMemo(
        () => collectTreeDepartments(orgTree),
        [orgTree]
    );

    const filteredOrgTree = useMemo(
        () => filterOrgTreeByDepartment(orgTree && typeof orgTree === 'object' ? orgTree : { name: 'Organization', children: [] }, orgDepartmentFilter),
        [orgTree, orgDepartmentFilter]
    );

    useEffect(() => {
        setOrgSelectedPathIds([]);
        setOrgSelectedPathNames([]);
        setOrgSelectedNodeId('');
    }, [orgDepartmentFilter]);

    const orgChartOption = useMemo(() => {
        const treeRoot = filteredOrgTree && typeof filteredOrgTree === 'object'
            ? filteredOrgTree
            : { name: 'Organization', children: [] };

        return buildChartOption(
            ChartType.ORG_CHART,
            [{ __orgTree: treeRoot }],
            {
                type: ChartType.ORG_CHART,
                assignments: [],
                nodeField: 'id',
                parentField: 'manager_id',
                labelField: 'name',
                colorField: 'department',
                orgSearchQuery,
                orgSelectedPathIds,
                orgSelectedNodeId,
                orgTreeExpandMode,
                orgCollapseDepth: orgTreeExpandMode === 'expand-all' ? -1 : 1,
                style: { labelMode: 'show' },
            },
            isDark ? 'dark' : 'light',
            'clear',
            'vibrant'
        );
    }, [filteredOrgTree, orgSearchQuery, orgSelectedPathIds, orgSelectedNodeId, orgTreeExpandMode, isDark]);

    const orgChartEvents = useMemo(() => ({
        click: (params) => {
            const { names, ids, clickedId } = parseOrgChartClick(params);
            setOrgSelectedPathNames(names);
            setOrgSelectedPathIds(ids);
            setOrgSelectedNodeId(clickedId || ids[ids.length - 1] || '');
        },
    }), []);

    const resetOrgFiltersAndSelection = useCallback(() => {
        setOrgSearchQuery('');
        setOrgDepartmentFilter('__all__');
        setOrgTreeExpandMode('default');
        setOrgSelectedPathIds([]);
        setOrgSelectedPathNames([]);
        setOrgSelectedNodeId('');
    }, []);

    const onOrgSearchChange = useCallback((event) => {
        setOrgSearchQuery(event.target.value);
        setOrgTreeExpandMode('default');
    }, []);

    const onOrgDepartmentChange = useCallback((event) => {
        setOrgDepartmentFilter(event.target.value);
        setOrgTreeExpandMode('default');
    }, []);

    const onOrgCollapseAll = useCallback(() => {
        setOrgTreeExpandMode('collapse-all');
    }, []);

    const onOrgExpandAll = useCallback(() => {
        setOrgTreeExpandMode('expand-all');
    }, []);

    const getChartImageFromRef = useCallback(async (ref, title) => {
        const instance = ref?.getEchartsInstance?.();
        if (!instance) return null;

        const originalOption = instance.getOption();
        const axisFields = CHART_AXIS_FIELDS[title] || { x: 'Category', y: 'Value' };
        const exportOption = buildExportReadyOption({ option: originalOption, title, axisFields, isDark });

        instance.setOption(exportOption, true);
        await new Promise((resolve) => setTimeout(resolve, 120));

        const width = instance.getWidth?.() || 1200;
        const height = instance.getHeight?.() || 700;
        const dataUrl = instance.getDataURL({
            type: 'png',
            pixelRatio: 2,
            backgroundColor: isDark ? '#111827' : '#ffffff',
        });

        instance.setOption(originalOption, true);

        return { title, axisFields, dataUrl, width, height };
    }, [isDark]);

    const exportAllPdf = useCallback(async () => {
        setExportAllError('');
        setExportAllLoading(true);

        try {
            const entries = Array.from(chartRefs.current.values());
            const images = await collectChartExportImages(entries, getChartImageFromRef);

            if (images.length === 0) throw new Error('No charts available for export');

            let pdf = null;

            images.forEach((image) => {
                pdf = appendChartPdfPage(pdf, image);
            });

            const fileName = `hr-analytics-charts-${new Date().toISOString().slice(0, 10)}.pdf`;
            pdf?.save(fileName);
        } catch (error) {
            setExportAllError(error?.message || 'Failed to export all charts');
        } finally {
            setExportAllLoading(false);
        }
    }, [getChartImageFromRef]);

    const orgFilterControlBaseProps = useMemo(() => ({
        isDark,
        orgSearchQuery,
        orgDepartmentFilter,
        orgDepartmentOptions,
        orgSelectedPathNames,
        onOrgSearchChange,
        onOrgDepartmentChange,
        onCollapseAll: onOrgCollapseAll,
        onExpandAll: onOrgExpandAll,
    }), [
        isDark,
        orgSearchQuery,
        orgDepartmentFilter,
        orgDepartmentOptions,
        orgSelectedPathNames,
        onOrgSearchChange,
        onOrgDepartmentChange,
        onOrgCollapseAll,
        onOrgExpandAll,
    ]);

    const orgHeaderExtras = (
        <div className="mt-2">
            <OrgFilterControls
                {...orgFilterControlBaseProps}
                onReset={resetOrgFiltersAndSelection}
            />
        </div>
    );

    const renderExpandedOrgControls = ({ zoomPct, zoomIn, zoomOut, resetZoom }) => (
        <div className={`rounded-lg border p-2 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
            <OrgFilterControls
                {...orgFilterControlBaseProps}
                onReset={() => {
                    resetOrgFiltersAndSelection();
                    resetZoom();
                }}
                showZoomControls
                showSelectedPath={false}
                zoomPct={zoomPct}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
            />
            {orgSelectedPathNames.length > 0 && (
                <div className={`mt-2 text-[11px] ${isDark ? 'text-gray-300' : 'text-gray-600'}`} title={orgSelectedPathNames.join(' / ')}>
                    {orgSelectedPathNames.join(' / ')}
                </div>
            )}
        </div>
    );

    const mappedFields = useMemo(() => Object.entries(mapping || {}).filter(([, v]) => v), [mapping]);

    const headcountMap = toValueMap(deptItems);
    const attritionBarData = asArray(exitsByDepartment).map((item) => ({
        name: item.name,
        value: item.value,
        total: headcountMap[item.name] || 0,
    }));

    const genderByDepartmentNormalized = useMemo(
        () => normalizeGenderByDepartmentRows(asArray(genderByDepartmentRaw)),
        [genderByDepartmentRaw]
    );

    const genderByDepartmentChart = useMemo(
        () => buildGenderByDepartmentChartData(genderByDepartmentNormalized),
        [genderByDepartmentNormalized]
    );

    if (id !== 'hr') return <TemplateStateCard isDark={isDark}>Dashboard is available only for HR template. <Link to="/templates">Go back</Link></TemplateStateCard>;

    if (!session || !mapping) {
        return <TemplateStateCard isDark={isDark}>Mapping not found. Please map your template fields first. <Link to="/templates/hr/map">Go to mapping</Link></TemplateStateCard>;
    }

    if (!Array.isArray(datasetData) || datasetData.length === 0) return <TemplateStateCard isDark={isDark}>No dataset rows available for analytics.</TemplateStateCard>;

    return (
        <section data-tour="templates-dashboard-root" className={`cv-template-page ${isDark ? 'cv-template-page--dark' : ''}`}>
            <header data-tour="templates-dashboard-header" className="cv-template-page__header cv-template-page__header--map">
                <div>
                    <h1>HR Analytics Dashboard</h1>
                    <p>Template-driven HR insights generated from mapped fields and dataset rows.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {!isSharedView && (
                        <button
                            data-tour="templates-dashboard-share"
                            type="button"
                            onClick={shareDashboard}
                            disabled={isSharingDashboard || loading || !!error}
                            className={`cv-btn ${isSharingDashboard || loading || !!error ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                            {isSharingDashboard ? 'Preparing Share Link...' : 'Share Dashboard'}
                        </button>
                    )}
                    {exportAllLoading && (
                        <span
                            className={`inline-flex h-4 w-4 animate-spin rounded-full border-2 ${isDark ? 'border-gray-600 border-t-gray-200' : 'border-gray-300 border-t-gray-700'}`}
                            aria-label="Exporting"
                        />
                    )}
                    <button
                        data-tour="templates-dashboard-export"
                        type="button"
                        onClick={exportAllPdf}
                        disabled={exportAllLoading}
                        className={`cv-btn ${exportAllLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                        Export All PDF
                    </button>
                    {!isSharedView && <Link className="cv-btn cv-btn--ghost" to="/templates/hr/map">Back to Mapping</Link>}
                </div>
            </header>

            <HRDashboardNotices
                exportAllError={exportAllError}
                loading={loading}
                error={error}
                mappingMissingFields={mappingMissingFields}
                hasValidationWarnings={hasValidationWarnings}
                validation={validation}
            />

            {!loading && !error && (
                <>
                    <MappedFieldsCard isDark={isDark} mappedFields={mappedFields} />

                    <HRSummaryKpis
                        isDark={isDark}
                        summaryTotal={summaryTotal}
                        summaryActive={summaryActive}
                        summaryInactive={summaryInactive}
                        attrRatePct={attrRatePct}
                        avgExp={avgExp}
                        probationSuccess={probationSuccess}
                        completenessPct={completenessPct}
                        missingEmergencyContact={missingEmergencyContact}
                    />

                    <HRDashboardChartsGrid
                        isDark={isDark}
                        registerChartRef={registerChartRef}
                        deptItems={deptItems}
                        genderItems={genderItems}
                        businessUnitItems={businessUnitItems}
                        locationItems={locationItems}
                        workforceCategoryItems={workforceCategoryItems}
                        maritalStatusItems={maritalStatusItems}
                        ageItems={ageItems}
                        monthlyHiring={monthlyHiring}
                        yearlyHiring={yearlyHiring}
                        hiringByDepartment={hiringByDepartment}
                        hiringByLocation={hiringByLocation}
                        genderByDepartmentChart={genderByDepartmentChart}
                        nationalityItems={nationalityItems}
                        demographicLocationItems={demographicLocationItems}
                        voluntaryVsInvoluntary={voluntaryVsInvoluntary}
                        attritionBarData={attritionBarData}
                        exitsByManager={exitsByManager}
                        topExitReasons={topExitReasons}
                        attritionByExperience={attritionByExperience}
                        experienceDistribution={experienceDistribution}
                        seniorVsJuniorRatio={seniorVsJuniorRatio}
                        orgChartEvents={orgChartEvents}
                        orgHeaderExtras={orgHeaderExtras}
                        renderExpandedControls={renderExpandedOrgControls}
                        orgChartOption={orgChartOption}
                        managerTeamSize={managerTeamSize}
                        paymentModeDistribution={paymentModeDistribution}
                        bankDistribution={bankDistribution}
                        qualificationDistribution={qualificationDistribution}
                        specializationDistribution={specializationDistribution}
                        courseTypeDistribution={courseTypeDistribution}
                        locationDistribution={locationDistribution}
                        transferTrends={transferTrends}
                        movementReasons={movementReasons}
                        headcountPerDepartment={headcountPerDepartment}
                        attritionPerDepartment={attritionPerDepartment}
                        lifecycleDuration={lifecycleDuration}
                        nullDistributionPerColumn={nullDistributionPerColumn}
                        relationshipDistribution={relationshipDistribution}
                        missingPan={missingPan}
                        missingAadhar={missingAadhar}
                        missingPf={missingPf}
                        missingUan={missingUan}
                        totalNullValues={totalNullValues}
                        duplicateEmployeeCount={duplicateEmployeeCount}
                        duplicateEmployees={duplicateEmployees}
                    />
                </>
            )}
        </section>
    );
};

export default HRTemplateDashboard;
