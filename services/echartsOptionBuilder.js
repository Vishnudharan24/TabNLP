import { ChartType } from '../types';
import { CHART_COLORS, CHART_COLORS_DARK } from '../constants';

/**
 * Builds an Apache ECharts option object based on visual type, data, and theme.
 * @param {string} visualType - A ChartType key
 * @param {Array<Object>} processedData - Array of { name, measure1, measure2, ... }
 * @param {{ dimension: string, measures: string[], title: string }} config
 * @param {'light' | 'dark'} theme
 * @returns {Object} ECharts option
 */
export function buildChartOption(visualType, processedData, config, theme = 'light') {
    const isDark = theme === 'dark';
    const colors = isDark ? CHART_COLORS_DARK : CHART_COLORS;
    const textColor = isDark ? '#e2e8f0' : '#334155';
    const subTextColor = isDark ? '#94a3b8' : '#94a3b8';
    const bgColor = 'transparent';
    const borderColor = isDark ? '#334155' : '#e2e8f0';
    const gridBorderColor = isDark ? '#1e293b' : '#f1f5f9';

    const { measures = [], dimension = '' } = config;
    const categories = processedData.map(d => d.name);

    const baseTextStyle = { color: textColor, fontFamily: 'Plus Jakarta Sans, sans-serif' };
    const tooltipStyle = {
        trigger: 'axis',
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: textColor, fontSize: 11, fontFamily: 'Plus Jakarta Sans, sans-serif' },
        borderWidth: 1,
        padding: [12, 16],
        extraCssText: 'border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);',
    };
    const legendStyle = {
        textStyle: { color: subTextColor, fontSize: 11, fontFamily: 'Plus Jakarta Sans, sans-serif' },
        bottom: 0,
        itemGap: 16,
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 8,
    };
    const gridStyle = { left: 48, right: 24, top: 24, bottom: 48, containLabel: false };
    const axisLabelStyle = { color: subTextColor, fontSize: 10, fontFamily: 'Plus Jakarta Sans, sans-serif' };
    const axisLineStyle = { lineStyle: { color: gridBorderColor } };
    const splitLineStyle = { lineStyle: { color: gridBorderColor, type: 'dashed' } };

    const xAxisCategory = {
        type: 'category',
        data: categories,
        axisLabel: axisLabelStyle,
        axisLine: axisLineStyle,
        axisTick: { show: false },
        splitLine: { show: false },
    };
    const yAxisValue = {
        type: 'value',
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
        animationDuration: 600,
        animationEasing: 'cubicOut',
    };

    switch (visualType) {
        // ═══════════════════ BAR CHARTS ═══════════════════
        case ChartType.BAR_CLUSTERED:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: measures.length > 1 ? legendStyle : undefined,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m, i) => ({
                    name: m,
                    type: 'bar',
                    data: processedData.map(d => d[m]),
                    itemStyle: { borderRadius: [4, 4, 0, 0] },
                    barMaxWidth: 32,
                    emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)' } },
                })),
            };

        case ChartType.BAR_STACKED:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: legendStyle,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m, i) => ({
                    name: m,
                    type: 'bar',
                    stack: 'total',
                    data: processedData.map(d => d[m]),
                    itemStyle: { borderRadius: i === measures.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0] },
                    barMaxWidth: 32,
                })),
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
                series: measures.map((m, i) => ({
                    name: m,
                    type: 'bar',
                    stack: 'total',
                    data: processedData.map((d, idx) =>
                        totals[idx] ? ((d[m] || 0) / totals[idx]) * 100 : 0
                    ),
                    itemStyle: { borderRadius: i === measures.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0] },
                    barMaxWidth: 32,
                })),
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
                series: measures.map((m) => ({
                    name: m,
                    type: 'bar',
                    data: processedData.map(d => d[m]),
                    itemStyle: { borderRadius: [0, 4, 4, 0] },
                    barMaxWidth: 24,
                })),
            };

        // ═══════════════════ LINE CHARTS ═══════════════════
        case ChartType.LINE_SMOOTH:
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
                    data: processedData.map(d => d[m]),
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: { width: 3 },
                })),
            };

        case ChartType.LINE_STRAIGHT:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: measures.length > 1 ? legendStyle : undefined,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m) => ({
                    name: m,
                    type: 'line',
                    smooth: false,
                    data: processedData.map(d => d[m]),
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: { width: 2 },
                })),
            };

        case ChartType.LINE_STEP:
            return {
                ...base,
                tooltip: tooltipStyle,
                legend: measures.length > 1 ? legendStyle : undefined,
                grid: gridStyle,
                xAxis: xAxisCategory,
                yAxis: yAxisValue,
                series: measures.map((m) => ({
                    name: m,
                    type: 'line',
                    step: 'middle',
                    data: processedData.map(d => d[m]),
                    symbol: 'circle',
                    symbolSize: 5,
                })),
            };

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
                    label: { color: subTextColor, fontSize: 10 },
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
                    label: { show: false },
                    itemStyle: { borderRadius: 6, borderColor: isDark ? '#1e293b' : '#fff', borderWidth: 3 },
                    emphasis: {
                        label: { show: true, fontSize: 13, fontWeight: 'bold', color: textColor },
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
                    label: { color: subTextColor, fontSize: 10 },
                    itemStyle: { borderRadius: 6, borderColor: isDark ? '#1e293b' : '#fff', borderWidth: 2 },
                }],
            };

        case ChartType.SUNBURST:
            return {
                ...base,
                tooltip: { ...tooltipStyle, trigger: 'item' },
                series: [{
                    type: 'sunburst',
                    data: processedData.map((d, i) => ({
                        name: d.name,
                        value: d[measures[0]] || 0,
                        children: measures.length > 1 ? measures.slice(1).map(m => ({
                            name: m,
                            value: d[m] || 0,
                        })) : undefined,
                    })),
                    radius: ['15%', '80%'],
                    label: { fontSize: 9, color: textColor },
                    itemStyle: { borderRadius: 4, borderColor: isDark ? '#1e293b' : '#fff', borderWidth: 2 },
                }],
            };

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
                    inRange: { color: isDark ? ['#1e293b', '#3b82f6', '#ef4444'] : ['#f0f9ff', '#3b82f6', '#ef4444'] },
                    textStyle: { color: subTextColor, fontSize: 10 },
                },
                series: [{
                    type: 'heatmap',
                    data: heatData,
                    label: { show: true, fontSize: 10, color: textColor },
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
                    data: processedData.map((d) => ({
                        name: d.name,
                        value: d[measures[0]] || 0,
                    })),
                    label: { fontSize: 11, fontWeight: 'bold', color: '#fff' },
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
                        ? { itemStyle: { borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 }
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
                series: measures.map((m) => ({
                    name: m,
                    type: 'bar',
                    data: processedData.map(d => d[m]),
                    itemStyle: { borderRadius: [4, 4, 0, 0] },
                    barMaxWidth: 32,
                })),
            };
    }
}
