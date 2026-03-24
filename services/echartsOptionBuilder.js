import { ChartType } from '../types';
import { configFromAssignments, convertOldConfig } from './chartConfigSystem';
import {
    CHART_COLORS,
    CHART_COLORS_DARK,
    CHART_COLORS_NEUTRAL,
    CHART_COLORS_DARK_NEUTRAL,
} from '../constants';

/**
 * Builds an Apache ECharts option object based on visual type, data, and theme.
 * @param {string} visualType - A ChartType key
 * @param {Array<Object>} processedData - Array of { name, measure1, measure2, ... }
 * @param {{ dimension: string, measures: string[], title: string }} config
 * @param {'light' | 'dark'} theme
 * @returns {Object} ECharts option
 */
export function buildChartOption(visualType, processedData, config, theme = 'light', clarityMode = 'standard', paletteMode = 'vibrant') {
    const isDark = theme === 'dark';
    const isClearMode = clarityMode === 'clear';
    const useNeutralPalette = paletteMode === 'neutral';
    const basePalette = useNeutralPalette
        ? (isDark ? CHART_COLORS_DARK_NEUTRAL : CHART_COLORS_NEUTRAL)
        : (isDark ? CHART_COLORS_DARK : CHART_COLORS);
    const textColor = isDark ? '#f1f5f9' : '#1f2937';
    const subTextColor = isDark ? (isClearMode ? '#cbd5e1' : '#a8b4c5') : (isClearMode ? '#475569' : '#64748b');
    const bgColor = 'transparent';
    const borderColor = isDark ? '#334155' : '#e2e8f0';
    const gridBorderColor = isDark ? (isClearMode ? 'rgba(148,163,184,0.24)' : 'rgba(148,163,184,0.14)') : (isClearMode ? 'rgba(148,163,184,0.26)' : 'rgba(148,163,184,0.14)');

    const normalizedRoleConfig = Array.isArray(config?.assignments) && config.assignments.length > 0
        ? configFromAssignments(visualType, config.assignments)
        : configFromAssignments(visualType, convertOldConfig(config).assignments || []);

    const resolvedConfig = {
        ...config,
        ...normalizedRoleConfig,
    };

    const { measures = [], dimension = '' } = resolvedConfig;
    const style = config?.style || {};
    const colorMode = style.colorMode === 'single' ? 'single' : 'multi';
    const normalizedSingle = typeof style.singleColor === 'string' && style.singleColor.trim() ? style.singleColor.trim() : null;
    const normalizedMulti = Array.isArray(style.multiColors)
        ? style.multiColors.map(c => String(c || '').trim()).filter(Boolean)
        : [];

    const colors = colorMode === 'single' && normalizedSingle
        ? [normalizedSingle]
        : (colorMode === 'multi' && normalizedMulti.length > 0 ? normalizedMulti : basePalette);
    const fontFamily = style.fontFamily || 'Plus Jakarta Sans, sans-serif';
    const fontSize = Number(style.fontSize) || (isClearMode ? 12 : 11);
    const labelMode = style.labelMode || 'auto';
    const tooltipEnabled = style.tooltipEnabled !== false;
    const tooltipDecimals = Number.isFinite(Number(style.tooltipDecimals)) ? Number(style.tooltipDecimals) : 2;
    const categories = processedData.map(d => d.name);
    const axisNameFromDimension = String(dimension || 'Category');
    const axisNameFromMeasure = measures.length === 1
        ? String(measures[0] || 'Value')
        : 'Values';

    const baseTextStyle = { color: textColor, fontFamily };
    const numberFormatter = (value) => {
        const num = Number(value);
        if (Number.isNaN(num)) return value;
        return num.toLocaleString(undefined, { maximumFractionDigits: tooltipDecimals });
    };
    const resolveLabel = (fallback = {}) => {
        if (labelMode === 'hide') return { ...fallback, show: false };
        if (labelMode === 'show') return { ...fallback, show: true };
        return fallback;
    };
    const tooltipStyle = {
        trigger: 'axis',
        show: tooltipEnabled,
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: textColor, fontSize, fontFamily },
        borderWidth: 1,
        padding: [12, 16],
        extraCssText: 'border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);',
        valueFormatter: (value) => numberFormatter(value),
    };
    const legendStyle = {
        textStyle: { color: subTextColor, fontSize, fontFamily },
        bottom: 0,
        itemGap: isClearMode ? 18 : 16,
        icon: 'roundRect',
        itemWidth: isClearMode ? 14 : 12,
        itemHeight: isClearMode ? 9 : 8,
    };
    const gridStyle = { left: 52, right: 22, top: 24, bottom: 48, containLabel: true };
    const axisLabelStyle = { color: subTextColor, fontSize, fontFamily };
    const axisNameStyle = {
        color: textColor,
        fontSize: Math.max(fontSize + 1, 12),
        fontWeight: 700,
        fontFamily,
    };
    const axisLineStyle = { lineStyle: { color: gridBorderColor } };
    const splitLineStyle = {
        lineStyle: {
            color: gridBorderColor,
            type: 'solid',
            opacity: isClearMode ? 0.55 : 0.35,
        },
    };

    const xAxisCategory = {
        type: 'category',
        data: categories,
        name: axisNameFromDimension,
        nameLocation: 'middle',
        nameGap: 34,
        nameTextStyle: axisNameStyle,
        axisLabel: axisLabelStyle,
        axisLine: axisLineStyle,
        axisTick: { show: false },
        splitLine: { show: false },
    };
    const yAxisValue = {
        type: 'value',
        name: axisNameFromMeasure,
        nameLocation: 'middle',
        nameGap: 48,
        nameTextStyle: axisNameStyle,
        axisLabel: axisLabelStyle,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: splitLineStyle,
    };

    const base = {
        backgroundColor: bgColor,
        textStyle: baseTextStyle,
        color: colors,
        animation: true,
        animationDuration: isClearMode ? 420 : 600,
        animationEasing: 'cubicOut',
        animationDurationUpdate: 650,
        animationEasingUpdate: 'cubicInOut',
    };

    const lineUi = {
        text: isDark ? '#E2E8F0' : '#111827',
        subtext: isDark ? '#94A3B8' : '#111827',
        tooltipBg: isDark ? '#0F172A' : '#FFFFFF',
        tooltipBorder: isDark ? '#334155' : '#E5E7EB',
        markerBorder: isDark ? '#0F172A' : '#FFFFFF',
        axisPointer: isDark ? '#60A5FA' : '#93C5FD',
        splitLine: isDark ? 'rgba(148,163,184,0.16)' : '#E5E7EB',
        lineShadow: isDark ? 'rgba(96,165,250,0.35)' : 'rgba(59,130,246,0.28)',
        emphasisShadow: isDark ? 'rgba(96,165,250,0.45)' : 'rgba(37,99,235,0.35)',
    };

    const formatMetric = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const getLineInsights = (values = []) => {
        if (!Array.isArray(values) || values.length === 0) {
            return {
                maxIndex: -1,
                minIndex: -1,
                dropIndex: -1,
                subtitle: 'No trend data available',
            };
        }

        let maxValue = -Infinity;
        let minValue = Infinity;
        let maxIndex = -1;
        let minIndex = -1;
        let dropIndex = -1;

        values.forEach((v, i) => {
            const value = Number(v || 0);
            if (value > maxValue) {
                maxValue = value;
                maxIndex = i;
            }
            if (value < minValue) {
                minValue = value;
                minIndex = i;
            }
            if (i > 0 && dropIndex === -1 && value < Number(values[i - 1] || 0)) {
                dropIndex = i;
            }
        });

        const maxLabel = maxIndex >= 0 ? `${categories[maxIndex]} (${formatMetric(maxValue)})` : 'n/a';
        const minLabel = minIndex >= 0 ? `${categories[minIndex]} (${formatMetric(minValue)})` : 'n/a';

        return {
            maxIndex,
            minIndex,
            dropIndex,
            subtitle: `Peak: ${maxLabel}  •  Low: ${minLabel}`,
        };
    };

    const buildPremiumLineSeries = ({ measure, values, smooth = true, step = false, index = 0 }) => {
        const isPrimarySeries = index === 0;
        const insights = isPrimarySeries ? getLineInsights(values) : null;
        const lineColor = colors[index % colors.length] || '#3B82F6';

        return {
            name: measure,
            type: 'line',
            smooth,
            step: step ? 'middle' : undefined,
            data: values,
            symbol: 'circle',
            symbolSize: 7,
            showSymbol: true,
            lineStyle: {
                width: 3.5,
                color: isPrimarySeries
                    ? {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 1,
                        y2: 0,
                        colorStops: [
                            { offset: 0, color: lineColor },
                            { offset: 1, color: lineColor },
                        ],
                    }
                    : lineColor,
                shadowColor: lineUi.lineShadow,
                shadowBlur: 10,
                shadowOffsetY: 3,
            },
            itemStyle: {
                color: lineColor,
                borderColor: lineUi.markerBorder,
                borderWidth: 2,
            },
            areaStyle: {
                opacity: isPrimarySeries ? 0.18 : 0.08,
                color: {
                    type: 'linear',
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                            { offset: 0, color: lineColor },
                            { offset: 1, color: lineColor },
                    ],
                },
            },
            label: resolveLabel({ show: false }),
            emphasis: {
                focus: 'series',
                scale: true,
                itemStyle: {
                    color: '#2563EB',
                    borderColor: lineUi.markerBorder,
                    borderWidth: 3,
                    shadowBlur: 14,
                    shadowColor: lineUi.emphasisShadow,
                },
            },
            markPoint: isPrimarySeries && insights ? {
                symbolSize: 44,
                label: { color: lineUi.text, fontWeight: 700, fontSize: 12 },
                itemStyle: { color: lineUi.tooltipBg, borderColor: '#3B82F6', borderWidth: 2 },
                data: [
                    ...(insights.maxIndex >= 0 ? [{ name: 'Max', type: 'max' }] : []),
                    ...(insights.minIndex >= 0 ? [{ name: 'Min', type: 'min' }] : []),
                ],
            } : undefined,
            markLine: isPrimarySeries && insights && insights.dropIndex >= 0 ? {
                symbol: 'none',
                lineStyle: { type: 'dashed', color: lineUi.text, opacity: 0.35, width: 1.5 },
                label: {
                    show: true,
                    formatter: 'Drop starts here',
                    color: lineUi.text,
                    backgroundColor: lineUi.tooltipBg,
                    padding: [4, 8],
                    borderRadius: 8,
                },
                data: [{ xAxis: categories[insights.dropIndex] }],
            } : undefined,
            animationDuration: 1100,
            animationEasing: 'cubicOut',
        };
    };

    const applyBarColorStyle = (series, seriesIndex, seriesCount) => {
        const next = { ...series };

        if (colorMode === 'single' && colors[0]) {
            next.itemStyle = { ...(next.itemStyle || {}), color: colors[0] };
            return next;
        }

        if (colorMode === 'multi' && seriesCount === 1 && Array.isArray(colors) && colors.length > 1) {
            next.colorBy = 'data';
            next.itemStyle = {
                ...(next.itemStyle || {}),
                color: (params) => colors[params.dataIndex % colors.length],
            };
            return next;
        }

        return next;
    };

    const toNumeric = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    const cloneHierarchyNode = (node = {}) => ({
        ...node,
        value: toNumeric(node.value),
        children: Array.isArray(node.children)
            ? node.children.map(cloneHierarchyNode)
            : undefined,
    });

    const nodeTotal = (node = {}) => {
        const own = toNumeric(node.value);
        const childrenTotal = Array.isArray(node.children)
            ? node.children.reduce((sum, child) => sum + nodeTotal(child), 0)
            : 0;
        return Math.max(own, childrenTotal);
    };

    const sortNodesByValue = (nodes = []) => {
        const safe = Array.isArray(nodes) ? nodes : [];
        return [...safe]
            .map((node) => ({
                ...node,
                value: toNumeric(node.value),
                children: Array.isArray(node.children)
                    ? sortNodesByValue(node.children)
                    : undefined,
            }))
            .sort((a, b) => toNumeric(b.value) - toNumeric(a.value));
    };

    const groupSmallNodes = (nodes = [], totalValue = 0, threshold = 0.03) => {
        const safe = Array.isArray(nodes) ? nodes : [];
        if (safe.length === 0) return [];

        const fallbackTotal = safe.reduce((sum, node) => sum + toNumeric(node.value), 0);
        const levelTotal = toNumeric(totalValue) > 0 ? toNumeric(totalValue) : fallbackTotal;

        const kept = [];
        let othersValue = 0;
        let othersChildren = [];

        safe.forEach((node) => {
            const value = toNumeric(node.value);
            const groupedChildren = Array.isArray(node.children)
                ? groupSmallNodes(node.children, value, threshold)
                : undefined;

            const ratio = levelTotal > 0 ? value / levelTotal : 1;
            if (ratio < threshold) {
                othersValue += value;
                if (Array.isArray(groupedChildren) && groupedChildren.length > 0) {
                    othersChildren = othersChildren.concat(groupedChildren);
                }
            } else {
                kept.push({
                    ...node,
                    value,
                    children: groupedChildren,
                });
            }
        });

        if (othersValue > 0) {
            const mergedOtherChildren = othersChildren.length > 0
                ? groupSmallNodes(othersChildren, othersValue, threshold)
                : undefined;
            kept.push({
                name: 'Others',
                value: othersValue,
                children: mergedOtherChildren,
                itemStyle: { opacity: 0.78 },
            });
        }

        return sortNodesByValue(kept);
    };

    const limitDepth = (nodes = [], maxDepth = 3, depth = 1) => {
        const safe = Array.isArray(nodes) ? nodes : [];
        return safe.map((node) => {
            const value = toNumeric(node.value);
            if (!Array.isArray(node.children) || node.children.length === 0) {
                return { ...node, value, children: undefined };
            }

            if (depth >= maxDepth) {
                const aggregated = node.children.reduce((sum, child) => sum + nodeTotal(child), 0);
                return {
                    ...node,
                    value: Math.max(value, aggregated),
                    children: undefined,
                };
            }

            return {
                ...node,
                value,
                children: limitDepth(node.children, maxDepth, depth + 1),
            };
        });
    };

    const preprocessSunburstData = (nodes = [], options = {}) => {
        const {
            threshold = 0.03,
            maxDepth = 3,
        } = options;

        const base = (Array.isArray(nodes) ? nodes : [])
            .map(cloneHierarchyNode)
            .map((node) => ({ ...node, value: nodeTotal(node) }));
        const sorted = sortNodesByValue(base);
        const total = sorted.reduce((sum, node) => sum + toNumeric(node.value), 0);
        const grouped = groupSmallNodes(sorted, total, threshold);
        const depthLimited = limitDepth(grouped, maxDepth);
        return sortNodesByValue(depthLimited);
    };

    const normalizeVisualType = (type, cfg = {}) => {
        const preferredMode = String(cfg?.mode || cfg?.variant || '').toLowerCase();

        if (type === ChartType.BAR) {
            if (preferredMode === 'percent') return ChartType.BAR_PERCENT;
            if (preferredMode === 'stacked') return ChartType.BAR_STACKED;
            if (preferredMode === 'horizontal') return ChartType.BAR_HORIZONTAL;
            return ChartType.BAR_CLUSTERED;
        }

        if (type === ChartType.LINE) {
            if (preferredMode === 'step') return ChartType.LINE_STEP;
            if (preferredMode === 'straight') return ChartType.LINE_STRAIGHT;
            return ChartType.LINE_SMOOTH;
        }

        if (type === ChartType.AREA) {
            if (preferredMode === 'percent') return ChartType.AREA_PERCENT;
            if (preferredMode === 'stacked') return ChartType.AREA_STACKED;
            return ChartType.AREA_SMOOTH;
        }

        return type;
    };

    const resolvedVisualType = normalizeVisualType(visualType, config);

    switch (resolvedVisualType) {
        // ═══════════════════ BAR CHARTS ═══════════════════
        case ChartType.BAR_CLUSTERED:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: measures.length > 1 ? legendStyle : undefined,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m, i) => applyBarColorStyle({
                    name: m,
                    type: 'bar',
                    data: processedData.map(d => d[m]),
                    itemStyle: { borderRadius: [4, 4, 0, 0] },
                    barMaxWidth: 38,
                    label: {
                        show: true,
                        position: 'top',
                        color: subTextColor,
                        fontSize: Math.max(10, fontSize - 1),
                        formatter: ({ value }) => Number(value || 0).toLocaleString(),
                    },
                    emphasis: {
                        focus: 'series',
                        itemStyle: {
                            shadowBlur: 18,
                            shadowColor: isDark ? 'rgba(96,165,250,0.35)' : 'rgba(37,99,235,0.28)',
                            borderColor: isDark ? '#bfdbfe' : '#1d4ed8',
                            borderWidth: 1,
                        },
                    },
                }, i, measures.length)),
            };

        case ChartType.BAR_STACKED:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: legendStyle,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m, i) => applyBarColorStyle({
                    name: m,
                    type: 'bar',
                    stack: 'total',
                    data: processedData.map(d => d[m]),
                    itemStyle: { borderRadius: i === measures.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0] },
                    barMaxWidth: 38,
                    emphasis: {
                        focus: 'series',
                        itemStyle: {
                            shadowBlur: 14,
                            shadowColor: isDark ? 'rgba(96,165,250,0.3)' : 'rgba(37,99,235,0.22)',
                        },
                    },
                }, i, measures.length)),
            };

        case ChartType.BAR_PERCENT: {
            const totals = processedData.map((d, idx) =>
                measures.reduce((sum, m) => sum + (d[m] || 0), 0)
            );
            return {
                ...base,
                tooltip: {
                    ...tooltipStyle,
                    formatter: (params) => {
                        const idx = params[0]?.dataIndex;
                        let html = `<div style="font-weight:700;margin-bottom:6px">${params[0]?.name}</div>`;
                        params.forEach(p => {
                            const pct = totals[idx] ? ((p.value / totals[idx]) * 100).toFixed(1) : 0;
                            html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>${p.seriesName}: ${pct}%</div>`;
                        });
                        return html;
                    },
                },
                legend: legendStyle,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: { ...yAxisValue, max: 100 },
                series: measures.map((m, i) => applyBarColorStyle({
                    name: m,
                    type: 'bar',
                    stack: 'total',
                    data: processedData.map((d, idx) =>
                        totals[idx] ? ((d[m] || 0) / totals[idx]) * 100 : 0
                    ),
                    itemStyle: { borderRadius: i === measures.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0] },
                    barMaxWidth: 38,
                }, i, measures.length)),
            };
        }

        case ChartType.BAR_HORIZONTAL:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: measures.length > 1 ? legendStyle : undefined,
                grid: { ...gridStyle, left: 80 },
                yAxis: { ...xAxisCategory, type: 'category' },
                xAxis: { ...yAxisValue, type: 'value' },
                series: measures.map((m, i) => applyBarColorStyle({
                    name: m,
                    type: 'bar',
                    data: processedData.map(d => d[m]),
                    itemStyle: { borderRadius: [0, 4, 4, 0] },
                    barMaxWidth: 28,
                    label: {
                        show: true,
                        position: 'right',
                        color: subTextColor,
                        fontSize: Math.max(10, fontSize - 1),
                        formatter: ({ value }) => Number(value || 0).toLocaleString(),
                    },
                    emphasis: {
                        focus: 'series',
                        itemStyle: {
                            shadowBlur: 16,
                            shadowColor: isDark ? 'rgba(96,165,250,0.3)' : 'rgba(37,99,235,0.22)',
                        },
                    },
                }, i, measures.length)),
            };

        // ═══════════════════ LINE CHARTS ═══════════════════
        case ChartType.LINE_SMOOTH:
        case ChartType.LINE_STRAIGHT:
        case ChartType.LINE_STEP: {
            const primaryMeasure = measures[0] || '';
            const primaryValues = processedData.map(d => d[primaryMeasure]);
            const insights = getLineInsights(primaryValues);
            const smooth = resolvedVisualType !== ChartType.LINE_STRAIGHT;
            const step = resolvedVisualType === ChartType.LINE_STEP;

            return {
                ...base,
                title: {
                    text: config?.title || (primaryMeasure ? `${primaryMeasure} Trend` : 'Trend Overview'),
                    subtext: insights.subtitle,
                    left: 16,
                    top: 8,
                    textStyle: {
                        color: lineUi.text,
                        fontSize: 16,
                        fontWeight: 700,
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                    },
                    subtextStyle: {
                        color: lineUi.subtext,
                        fontSize: 12,
                        fontWeight: 500,
                        opacity: 0.75,
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                    },
                },
                tooltip: {
                    ...tooltipStyle,
                    backgroundColor: lineUi.tooltipBg,
                    borderColor: lineUi.tooltipBorder,
                    textStyle: { color: lineUi.text, fontSize: 12, fontFamily: 'Plus Jakarta Sans, sans-serif' },
                    axisPointer: {
                        type: 'line',
                        lineStyle: { color: lineUi.axisPointer, width: 1.5 },
                    },
                    formatter: (params) => {
                        const p = params?.[0];
                        if (!p) return '';
                        const value = Number(p.value || 0);
                        const delta = p.dataIndex > 0 ? Number(processedData[p.dataIndex - 1]?.[p.seriesName] || 0) : null;
                        const deltaText = p.dataIndex > 0 && delta !== null && !Number.isNaN(delta)
                            ? ` (${value >= delta ? '+' : ''}${formatMetric(value - delta)} vs prev)`
                            : '';

                        return `
                            <div style="font-weight:700;margin-bottom:6px;color:${lineUi.text}">${p.axisValue}</div>
                            <div style="display:flex;align-items:center;gap:8px;color:${lineUi.text}">
                                <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#3B82F6"></span>
                                <span style="font-weight:600">${p.seriesName}:</span>
                                <span>${formatMetric(value)}${deltaText}</span>
                            </div>
                        `;
                    },
                },
                legend: measures.length > 1 ? legendStyle : undefined,
                grid: { ...gridStyle, top: 88, left: 56, right: 24, bottom: 56 },
                xAxis: {
                    ...xAxisCategory,
                    axisLabel: { ...xAxisCategory.axisLabel, color: lineUi.text, fontSize: 12 },
                },
                yAxis: {
                    ...yAxisValue,
                    axisLabel: { ...yAxisValue.axisLabel, color: lineUi.text, fontSize: 12 },
                    splitLine: { lineStyle: { color: lineUi.splitLine, type: 'solid', opacity: 0.9 } },
                },
                series: measures.map((m, i) => buildPremiumLineSeries({
                    measure: m,
                    values: processedData.map(d => d[m]),
                    smooth,
                    step,
                    index: i,
                })),
            };
        }

        // ═══════════════════ AREA CHARTS ═══════════════════
        case ChartType.AREA_SMOOTH:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: measures.length > 1 ? legendStyle : undefined,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m, i) => ({
                    name: m,
                    type: 'line',
                    smooth: true,
                    areaStyle: { opacity: 0.25 },
                    data: processedData.map(d => d[m]),
                    symbol: 'none',
                    lineStyle: { width: 2 },
                })),
            };

        case ChartType.AREA_STACKED:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: legendStyle,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m) => ({
                    name: m,
                    type: 'line',
                    stack: 'total',
                    smooth: true,
                    areaStyle: { opacity: 0.35 },
                    data: processedData.map(d => d[m]),
                    symbol: 'none',
                })),
            };

        case ChartType.AREA_PERCENT: {
            const totals = processedData.map((d) =>
                measures.reduce((sum, m) => sum + (d[m] || 0), 0)
            );
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: legendStyle,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: { ...yAxisValue, max: 100 },
                series: measures.map((m) => ({
                    name: m,
                    type: 'line',
                    stack: 'total',
                    smooth: true,
                    areaStyle: { opacity: 0.5 },
                    data: processedData.map((d, idx) =>
                        totals[idx] ? ((d[m] || 0) / totals[idx]) * 100 : 0
                    ),
                    symbol: 'none',
                })),
            };
        }

        // ═══════════════════ CIRCULAR CHARTS ═══════════════════
        case ChartType.PIE:
            return {
                ...base,
                tooltip: { ...tooltipStyle, trigger: 'item' },
                legend: legendStyle,
                series: [{
                    type: 'pie',
                    radius: ['0%', '75%'],
                    data: processedData.map((d, i) => ({
                        name: d.name,
                        value: d[measures[0]] || 0,
                    })),
                    label: resolveLabel({ color: subTextColor, fontSize: Math.max(10, fontSize - 1) }),
                    itemStyle: { borderRadius: 4, borderColor: isDark ? '#1e293b' : '#fff', borderWidth: 2 },
                    emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)' } },
                }],
            };

        case ChartType.DONUT:
            return {
                ...base,
                tooltip: { ...tooltipStyle, trigger: 'item' },
                legend: legendStyle,
                series: [{
                    type: 'pie',
                    radius: ['50%', '78%'],
                    data: processedData.map((d) => ({
                        name: d.name,
                        value: d[measures[0]] || 0,
                    })),
                    label: resolveLabel({ show: false }),
                    itemStyle: { borderRadius: 6, borderColor: isDark ? '#1e293b' : '#fff', borderWidth: 3 },
                    emphasis: {
                        label: resolveLabel({ show: true, fontSize: Math.max(12, fontSize + 1), fontWeight: 'bold', color: textColor }),
                        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)' },
                    },
                }],
            };

        case ChartType.ROSE:
            return {
                ...base,
                tooltip: { ...tooltipStyle, trigger: 'item' },
                legend: legendStyle,
                series: [{
                    type: 'pie',
                    roseType: 'area',
                    radius: ['20%', '75%'],
                    data: processedData.map(d => ({
                        name: d.name,
                        value: d[measures[0]] || 0,
                    })),
                    label: resolveLabel({ color: subTextColor, fontSize: Math.max(10, fontSize - 1) }),
                    itemStyle: { borderRadius: 6, borderColor: isDark ? '#1e293b' : '#fff', borderWidth: 2 },
                }],
            };

        case ChartType.SUNBURST:
            {
                const rawSunburstData = Array.isArray(processedData?.[0]?.__hierarchy)
                    ? processedData[0].__hierarchy
                    : processedData.map((d, i) => ({
                        name: d.name,
                        value: d[measures[0]] || 0,
                        children: measures.length > 1 ? measures.slice(1).map(m => ({
                            name: m,
                            value: d[m] || 0,
                        })) : undefined,
                    }));

                const sunburstData = preprocessSunburstData(rawSunburstData, {
                    threshold: 0.03,
                    maxDepth: 3,
                });

                const totalSunburst = sunburstData.reduce((sum, node) => sum + toNumeric(node.value), 0);

            return {
                ...base,
                tooltip: {
                    ...tooltipStyle,
                    trigger: 'item',
                    formatter: (params) => {
                        const path = Array.isArray(params?.treePathInfo)
                            ? params.treePathInfo.slice(1).map(p => p.name).filter(Boolean).join(' ▸ ')
                            : (params?.name || '');
                        const value = toNumeric(params?.value);
                        const pctRaw = totalSunburst > 0 ? ((value / totalSunburst) * 100) : 0;
                        const pct = Number.isFinite(pctRaw) ? pctRaw.toFixed(2) : '0.00';
                        return `
                            <div style="font-weight:700;margin-bottom:6px">${path || params?.name || 'Node'}</div>
                            <div>Count: ${numberFormatter(value)}</div>
                            <div>Percentage: ${pct}%</div>
                        `;
                    },
                },
                series: [{
                    type: 'sunburst',
                    data: sunburstData,
                    radius: ['0%', '90%'],
                    sort: null,
                    colorMappingBy: 'index',
                    nodeClick: 'zoomToNode',
                    emphasis: { focus: 'ancestor' },
                    levels: [
                        {},
                        {
                            r0: '0%',
                            r: '30%',
                            itemStyle: {
                                borderWidth: 2,
                                borderColor: isDark ? '#0f172a' : '#ffffff',
                            },
                            label: {
                                show: false,
                                rotate: 'tangential',
                                color: textColor,
                                fontSize: Math.max(10, fontSize),
                                overflow: 'truncate',
                            },
                        },
                        {
                            r0: '30%',
                            r: '65%',
                            itemStyle: {
                                borderWidth: 2,
                                borderColor: isDark ? '#0f172a' : '#ffffff',
                            },
                            label: {
                                show: false,
                                rotate: 'radial',
                                color: textColor,
                                fontSize: Math.max(9, fontSize - 1),
                                overflow: 'truncate',
                            },
                        },
                        {
                            r0: '65%',
                            r: '90%',
                            itemStyle: {
                                borderWidth: 1.5,
                                borderColor: isDark ? '#0f172a' : '#ffffff',
                            },
                            label: {
                                show: false,
                            },
                        },
                    ],
                    labelLayout: {
                        hideOverlap: true,
                    },
                    label: resolveLabel({
                        show: false,
                        color: textColor,
                        fontSize: Math.max(10, fontSize),
                    }),
                    emphasis: {
                        focus: 'ancestor',
                        label: {
                            show: true,
                            fontSize: Math.max(14, fontSize + 2),
                            fontWeight: 700,
                            color: textColor,
                            formatter: (params) => {
                                const name = String(params?.name || '');
                                const value = toNumeric(params?.value);
                                return `${name}\n${numberFormatter(value)}`;
                            },
                        },
                    },
                    itemStyle: { borderRadius: 4, borderColor: isDark ? '#1e293b' : '#fff', borderWidth: 2 },
                }],
            };
            }

        // ═══════════════════ DISTRIBUTION ═══════════════════
        case ChartType.SCATTER:
            return {
                ...base,
                tooltip: { ...tooltipStyle, trigger: 'item' },
                grid: gridStyle,
                xAxis: { ...yAxisValue, name: measures[0] || '', nameLocation: 'center', nameGap: 30, nameTextStyle: axisLabelStyle },
                yAxis: { ...yAxisValue, name: measures[1] || measures[0] || '', nameTextStyle: axisLabelStyle },
                series: [{
                    type: 'scatter',
                    data: processedData.map(d => [d[measures[0]] || 0, d[measures[1]] || d[measures[0]] || 0]),
                    symbolSize: 12,
                    itemStyle: { opacity: 0.75 },
                    emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
                }],
            };

        case ChartType.BUBBLE:
            return {
                ...base,
                tooltip: { ...tooltipStyle, trigger: 'item' },
                grid: gridStyle,
                xAxis: { ...yAxisValue, name: measures[0] || '', nameLocation: 'center', nameGap: 30, nameTextStyle: axisLabelStyle },
                yAxis: { ...yAxisValue, name: measures[1] || '', nameTextStyle: axisLabelStyle },
                series: [{
                    type: 'scatter',
                    data: processedData.map(d => [
                        d[measures[0]] || 0,
                        d[measures[1]] || 0,
                        d[measures[2]] || d[measures[0]] || 10,
                    ]),
                    symbolSize: (val) => Math.max(8, Math.min(40, val[2] / 5)),
                    itemStyle: { opacity: 0.65 },
                }],
            };

        case ChartType.HEATMAP: {
            const yNames = [...new Set(processedData.map(d => d.name))];
            const xNames = measures;
            const heatData = [];
            yNames.forEach((yName, yi) => {
                const row = processedData.find(d => d.name === yName);
                xNames.forEach((xName, xi) => {
                    heatData.push([xi, yi, row ? row[xName] || 0 : 0]);
                });
            });
            const allValues = heatData.map(d => d[2]);
            return {
                ...base,
                tooltip: { ...tooltipStyle, trigger: 'item' },
                grid: { ...gridStyle, left: 80, bottom: 60 },
                xAxis: { type: 'category', data: xNames, axisLabel: axisLabelStyle, splitArea: { show: true } },
                yAxis: { type: 'category', data: yNames, axisLabel: axisLabelStyle, splitArea: { show: true } },
                visualMap: {
                    min: Math.min(...allValues),
                    max: Math.max(...allValues),
                    calculable: true,
                    orient: 'horizontal',
                    left: 'center',
                    bottom: 0,
                    inRange: {
                        color: (Array.isArray(colors) && colors.length >= 3)
                            ? [colors[0], colors[Math.floor(colors.length / 2)], colors[colors.length - 1]]
                            : (isDark ? ['#1e293b', '#3b82f6', '#ef4444'] : ['#f0f9ff', '#3b82f6', '#ef4444']),
                    },
                    textStyle: { color: subTextColor, fontSize: 10 },
                },
                series: [{
                    type: 'heatmap',
                    data: heatData,
                    label: resolveLabel({ show: true, fontSize: Math.max(10, fontSize - 1), color: textColor }),
                    itemStyle: { borderRadius: 2, borderColor: isDark ? '#1e293b' : '#fff', borderWidth: 2 },
                }],
            };
        }

        case ChartType.TREEMAP:
            return {
                ...base,
                tooltip: { ...tooltipStyle, trigger: 'item' },
                series: [{
                    type: 'treemap',
                    data: Array.isArray(processedData?.[0]?.__hierarchy)
                        ? processedData[0].__hierarchy
                        : processedData.map((d) => ({
                            name: d.name,
                            value: d[measures[0]] || 0,
                        })),
                    label: { fontSize: 11, fontWeight: 'bold', color: '#fff' },
                    upperLabel: resolveLabel({ show: false }),
                    breadcrumb: { show: false },
                    itemStyle: { borderColor: isDark ? '#1e293b' : '#fff', borderWidth: 2, borderRadius: 4 },
                    levels: [{
                        itemStyle: { borderColor: isDark ? '#0f172a' : '#fff', borderWidth: 3 },
                    }],
                }],
            };

        // ═══════════════════ COMBOS ═══════════════════
        case ChartType.COMBO_BAR_LINE:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: legendStyle,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m, i) => ({
                    name: m,
                    type: i === 0 ? 'bar' : 'line',
                    data: processedData.map(d => d[m]),
                    ...(i === 0
                        ? applyBarColorStyle({
                            itemStyle: { borderRadius: [4, 4, 0, 0] },
                            barMaxWidth: 34,
                            label: {
                                show: true,
                                position: 'top',
                                color: subTextColor,
                                fontSize: Math.max(10, fontSize - 1),
                                formatter: ({ value }) => Number(value || 0).toLocaleString(),
                            },
                            emphasis: {
                                itemStyle: {
                                    shadowBlur: 16,
                                    shadowColor: isDark ? 'rgba(96,165,250,0.3)' : 'rgba(37,99,235,0.22)',
                                },
                            },
                        }, i, measures.length)
                        : { smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3 } }),
                })),
            };

        case ChartType.COMBO_AREA_LINE:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: legendStyle,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m, i) => ({
                    name: m,
                    type: 'line',
                    smooth: true,
                    data: processedData.map(d => d[m]),
                    areaStyle: i === 0 ? { opacity: 0.2 } : undefined,
                    symbol: 'circle',
                    symbolSize: 5,
                    lineStyle: { width: i === 0 ? 2 : 3 },
                })),
            };

        // ═══════════════════ INDICATORS ═══════════════════
        case ChartType.GAUGE: {
            const total = processedData.reduce((acc, d) => acc + (d[measures[0]] || 0), 0);
            const avg = processedData.length > 0 ? total / processedData.length : 0;
            return {
                ...base,
                series: [{
                    type: 'gauge',
                    startAngle: 210,
                    endAngle: -30,
                    min: 0,
                    max: Math.max(avg * 2, 100),
                    pointer: { width: 5, length: '60%', itemStyle: { color: colors[0] } },
                    axisLine: {
                        lineStyle: {
                            width: 20,
                            color: [
                                [0.3, isDark ? '#334155' : '#e2e8f0'],
                                [0.7, colors[1] || colors[0]],
                                [1, colors[0]],
                            ],
                        },
                    },
                    axisTick: { show: false },
                    splitLine: { length: 12, lineStyle: { color: isDark ? '#475569' : '#94a3b8', width: 2 } },
                    axisLabel: { distance: 28, color: subTextColor, fontSize: 10 },
                    detail: {
                        valueAnimation: true,
                        fontSize: 24,
                        fontWeight: 'bold',
                        color: textColor,
                        formatter: (val) => val > 1000 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(1),
                        offsetCenter: [0, '70%'],
                    },
                    data: [{ value: parseFloat(avg.toFixed(1)), name: measures[0] || '' }],
                    title: { color: subTextColor, fontSize: 11, offsetCenter: [0, '90%'] },
                }],
            };
        }

        case ChartType.SPARKLINE:
            return {
                ...base,
                grid: { left: 4, right: 4, top: 4, bottom: 4 },
                xAxis: { type: 'category', show: false, data: categories },
                yAxis: { type: 'value', show: false },
                series: [{
                    type: 'line',
                    smooth: true,
                    data: processedData.map(d => d[measures[0]] || 0),
                    symbol: 'none',
                    lineStyle: { width: 2, color: colors[0] },
                    areaStyle: { opacity: 0.1, color: colors[0] },
                }],
            };

        case ChartType.RADAR: {
            const indicators = processedData.map(d => ({
                name: d.name,
                max: Math.max(...processedData.map(dd => Math.max(...measures.map(m => dd[m] || 0)))) * 1.2 || 100,
            }));
            return {
                ...base,
                tooltip: { ...tooltipStyle, trigger: 'item' },
                legend: measures.length > 1 ? legendStyle : undefined,
                radar: {
                    indicator: indicators,
                    axisName: { color: subTextColor, fontSize: 10 },
                    splitArea: { areaStyle: { color: isDark ? ['#1e293b', '#0f172a'] : ['#f8fafc', '#ffffff'] } },
                    splitLine: { lineStyle: { color: gridBorderColor } },
                    axisLine: { lineStyle: { color: gridBorderColor } },
                },
                series: measures.map((m, i) => ({
                    type: 'radar',
                    data: [{
                        value: processedData.map(d => d[m] || 0),
                        name: m,
                        areaStyle: { opacity: 0.15 },
                    }],
                    lineStyle: { width: 2 },
                    symbol: 'circle',
                    symbolSize: 5,
                })),
            };
        }

        case ChartType.RADIAL_BAR: {
            const maxVal = Math.max(...processedData.map(d => d[measures[0]] || 0)) || 100;
            return {
                ...base,
                tooltip: { ...tooltipStyle, trigger: 'item' },
                polar: { radius: ['15%', '80%'] },
                angleAxis: {
                    max: maxVal * 1.1,
                    show: false,
                },
                radiusAxis: {
                    type: 'category',
                    data: categories,
                    axisLabel: axisLabelStyle,
                    axisLine: { show: false },
                    axisTick: { show: false },
                },
                series: [{
                    type: 'bar',
                    data: processedData.map((d, i) => ({
                        value: d[measures[0]] || 0,
                        itemStyle: { color: colors[i % colors.length] },
                    })),
                    coordinateSystem: 'polar',
                    barMaxWidth: 16,
                    itemStyle: { borderRadius: 4 },
                }],
            };
        }

        // ═══════════════════ FALLBACK ═══════════════════
        default:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: measures.length > 1 ? legendStyle : undefined,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m, i) => applyBarColorStyle({
                    name: m,
                    type: 'bar',
                    data: processedData.map(d => d[m]),
                    itemStyle: { borderRadius: [4, 4, 0, 0] },
                    barMaxWidth: 38,
                    label: {
                        show: true,
                        position: 'top',
                        color: subTextColor,
                        fontSize: Math.max(10, fontSize - 1),
                        formatter: ({ value }) => Number(value || 0).toLocaleString(),
                    },
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 16,
                            shadowColor: isDark ? 'rgba(96,165,250,0.3)' : 'rgba(37,99,235,0.22)',
                        },
                    },
                }, i, measures.length)),
            };
    }
}
