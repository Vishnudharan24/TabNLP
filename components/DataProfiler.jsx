
import React, { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
    X, BarChart2, Hash, Type, Calendar, ToggleLeft,
    AlertTriangle, TrendingUp, Database, Columns3,
    ChevronDown, ChevronRight, ArrowUpDown
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const DataProfiler = ({ dataset, onClose }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [expandedCol, setExpandedCol] = useState(null);
    const [sortBy, setSortBy] = useState('name');

    const profile = useMemo(() => {
        if (!dataset) return null;
        const { data, columns } = dataset;
        const rowCount = data.length;

        const columnProfiles = columns.map(col => {
            const values = data.map(row => row[col.name]);
            const nonNull = values.filter(v => v != null && v !== '' && v !== undefined);
            const nullCount = rowCount - nonNull.length;
            const nullPercent = rowCount > 0 ? (nullCount / rowCount) * 100 : 0;
            const uniqueValues = [...new Set(nonNull.map(String))];
            const uniqueCount = uniqueValues.length;
            const uniquePercent = rowCount > 0 ? (uniqueCount / rowCount) * 100 : 0;

            let stats = {};

            if (col.type === 'number') {
                const nums = nonNull.map(Number).filter(n => !isNaN(n));
                if (nums.length > 0) {
                    const sorted = [...nums].sort((a, b) => a - b);
                    const sum = nums.reduce((a, b) => a + b, 0);
                    const mean = sum / nums.length;
                    const median = sorted.length % 2 === 0
                        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                        : sorted[Math.floor(sorted.length / 2)];
                    const variance = nums.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / nums.length;
                    const stdDev = Math.sqrt(variance);
                    const q1 = sorted[Math.floor(sorted.length * 0.25)];
                    const q3 = sorted[Math.floor(sorted.length * 0.75)];
                    const iqr = q3 - q1;
                    const outlierLow = q1 - 1.5 * iqr;
                    const outlierHigh = q3 + 1.5 * iqr;
                    const outliers = nums.filter(n => n < outlierLow || n > outlierHigh);

                    const binCount = Math.min(20, Math.max(5, Math.ceil(Math.sqrt(nums.length))));
                    const min = sorted[0];
                    const max = sorted[sorted.length - 1];
                    const binWidth = (max - min) / binCount || 1;
                    const bins = Array.from({ length: binCount }, (_, i) => ({
                        label: (min + i * binWidth).toFixed(1),
                        count: 0,
                        from: min + i * binWidth,
                        to: min + (i + 1) * binWidth,
                    }));
                    nums.forEach(n => {
                        const idx = Math.min(Math.floor((n - min) / binWidth), binCount - 1);
                        if (bins[idx]) bins[idx].count++;
                    });

                    stats = {
                        min: sorted[0], max: sorted[sorted.length - 1],
                        mean, median, stdDev, q1, q3, iqr, sum,
                        zeros: nums.filter(n => n === 0).length,
                        negatives: nums.filter(n => n < 0).length,
                        outlierCount: outliers.length,
                        outlierPercent: nums.length > 0 ? (outliers.length / nums.length) * 100 : 0,
                        histogram: bins,
                    };
                }
            } else {
                const freq = {};
                nonNull.forEach(v => { freq[String(v)] = (freq[String(v)] || 0) + 1; });
                const topValues = Object.entries(freq)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([value, count]) => ({ value, count, percent: (count / rowCount) * 100 }));
                const avgLength = nonNull.length > 0
                    ? nonNull.reduce((s, v) => s + String(v).length, 0) / nonNull.length : 0;

                stats = {
                    topValues, avgLength: avgLength.toFixed(1),
                    minLength: nonNull.length > 0 ? Math.min(...nonNull.map(v => String(v).length)) : 0,
                    maxLength: nonNull.length > 0 ? Math.max(...nonNull.map(v => String(v).length)) : 0,
                };
            }

            return {
                ...col, nullCount, nullPercent, uniqueCount, uniquePercent, stats,
                completeness: 100 - nullPercent,
            };
        });

        // Correlation matrix for numeric columns
        const numericCols = columnProfiles.filter(c => c.type === 'number');
        const correlations = [];
        for (let i = 0; i < numericCols.length; i++) {
            for (let j = i + 1; j < numericCols.length; j++) {
                const col1 = numericCols[i].name;
                const col2 = numericCols[j].name;
                const pairs = data
                    .map(row => [Number(row[col1]), Number(row[col2])])
                    .filter(([a, b]) => !isNaN(a) && !isNaN(b));
                if (pairs.length > 2) {
                    const mean1 = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
                    const mean2 = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
                    const cov = pairs.reduce((s, p) => s + (p[0] - mean1) * (p[1] - mean2), 0) / pairs.length;
                    const std1 = Math.sqrt(pairs.reduce((s, p) => s + Math.pow(p[0] - mean1, 2), 0) / pairs.length);
                    const std2 = Math.sqrt(pairs.reduce((s, p) => s + Math.pow(p[1] - mean2, 2), 0) / pairs.length);
                    const correlation = std1 && std2 ? cov / (std1 * std2) : 0;
                    correlations.push({ col1, col2, value: parseFloat(correlation.toFixed(3)) });
                }
            }
        }

        return { rowCount, columnCount: columns.length, columnProfiles, correlations, numericCols };
    }, [dataset]);

    if (!dataset || !profile) return null;

    const sortedColumns = useMemo(() => {
        const cols = [...profile.columnProfiles];
        switch (sortBy) {
            case 'type': return cols.sort((a, b) => a.type.localeCompare(b.type));
            case 'nulls': return cols.sort((a, b) => b.nullPercent - a.nullPercent);
            case 'unique': return cols.sort((a, b) => b.uniqueCount - a.uniqueCount);
            default: return cols;
        }
    }, [profile, sortBy]);

    const getTypeIcon = (type) => {
        switch (type) {
            case 'number': return Hash;
            case 'date': return Calendar;
            case 'boolean': return ToggleLeft;
            default: return Type;
        }
    };

    const getCompletenessColor = (pct) => {
        if (pct >= 95) return 'text-emerald-500';
        if (pct >= 80) return 'text-amber-500';
        return 'text-rose-500';
    };

    const getCorrelationColor = (val) => {
        const abs = Math.abs(val);
        if (abs >= 0.7) return val > 0 ? '#10b981' : '#ef4444';
        if (abs >= 0.4) return val > 0 ? '#34d399' : '#f87171';
        return isDark ? '#475569' : '#cbd5e1';
    };

    const buildHistogramOption = (bins) => ({
        backgroundColor: 'transparent',
        grid: { left: 0, right: 0, top: 2, bottom: 0 },
        xAxis: { type: 'category', show: false, data: bins.map(b => b.label) },
        yAxis: { type: 'value', show: false },
        series: [{
            type: 'bar', data: bins.map(b => b.count),
            itemStyle: { color: isDark ? '#60a5fa' : '#3b82f6', borderRadius: [2, 2, 0, 0] },
            barCategoryGap: '20%',
        }],
        animation: false,
    });

    const buildFrequencyOption = (topValues) => ({
        backgroundColor: 'transparent',
        grid: { left: 0, right: 0, top: 2, bottom: 0 },
        xAxis: { type: 'category', show: false, data: topValues.map(v => v.value) },
        yAxis: { type: 'value', show: false },
        series: [{
            type: 'bar', data: topValues.map(v => v.count),
            itemStyle: { color: isDark ? '#a78bfa' : '#8b5cf6', borderRadius: [2, 2, 0, 0] },
            barCategoryGap: '20%',
        }],
        animation: false,
    });

    const buildCorrelationOption = () => {
        const cols = profile.numericCols.map(c => c.name);
        const data = [];
        cols.forEach((_, i) => data.push([i, i, 1]));
        profile.correlations.forEach(({ col1, col2, value }) => {
            const i = cols.indexOf(col1);
            const j = cols.indexOf(col2);
            if (i >= 0 && j >= 0) { data.push([i, j, value]); data.push([j, i, value]); }
        });
        return {
            backgroundColor: 'transparent',
            tooltip: { formatter: (params) => `${cols[params.data[0]]} × ${cols[params.data[1]]}: ${params.data[2]}` },
            grid: { left: 80, right: 20, top: 20, bottom: 60 },
            xAxis: { type: 'category', data: cols, axisLabel: { fontSize: 9, color: isDark ? '#94a3b8' : '#64748b', rotate: 45 }, splitArea: { show: true } },
            yAxis: { type: 'category', data: cols, axisLabel: { fontSize: 9, color: isDark ? '#94a3b8' : '#64748b' }, splitArea: { show: true } },
            visualMap: {
                min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
                inRange: { color: ['#ef4444', isDark ? '#1e293b' : '#f8fafc', '#10b981'] },
                textStyle: { color: isDark ? '#94a3b8' : '#64748b', fontSize: 9 },
            },
            series: [{
                type: 'heatmap', data,
                label: { show: cols.length <= 8, fontSize: 9, color: isDark ? '#e2e8f0' : '#334155' },
                itemStyle: { borderRadius: 2, borderColor: isDark ? '#1e293b' : '#fff', borderWidth: 2 },
            }],
        };
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className={`w-[95vw] h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                {/* Header */}
                <div className={`px-6 py-4 flex items-center justify-between border-b shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                            <BarChart2 size={20} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                        </div>
                        <div>
                            <h2 className={`text-lg font-bold tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                Data Profiler — {dataset.name}
                            </h2>
                            <div className="flex items-center gap-4 mt-0.5">
                                <span className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{profile.rowCount.toLocaleString()} rows</span>
                                <span className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{profile.columnCount} columns</span>
                                <span className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {profile.numericCols.length} numeric · {profile.columnCount - profile.numericCols.length} categorical
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <ArrowUpDown size={12} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                                className={`text-xs font-semibold px-2 py-1.5 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-600 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                                <option value="name">Sort by Name</option>
                                <option value="type">Sort by Type</option>
                                <option value="nulls">Sort by Nulls</option>
                                <option value="unique">Sort by Unique</option>
                            </select>
                        </div>
                        <button onClick={onClose} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Overview Cards */}
                    <div className="grid grid-cols-5 gap-4">
                        {[
                            { label: 'Total Rows', value: profile.rowCount.toLocaleString(), icon: Database },
                            { label: 'Columns', value: profile.columnCount, icon: Columns3 },
                            { label: 'Numeric', value: profile.numericCols.length, icon: Hash },
                            { label: 'Categorical', value: profile.columnCount - profile.numericCols.length, icon: Type },
                            { label: 'Correlations', value: profile.correlations.filter(c => Math.abs(c.value) >= 0.5).length + ' strong', icon: TrendingUp },
                        ].map((card, i) => (
                            <div key={i} className={`p-4 rounded-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                                <card.icon size={14} className={isDark ? 'text-gray-500 mb-2' : 'text-gray-400 mb-2'} />
                                <p className={`text-2xl font-black tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{card.value}</p>
                                <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{card.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Column Profiles */}
                    <div className="space-y-3">
                        <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Column Profiles</h3>
                        {sortedColumns.map(col => {
                            const TypeIcon = getTypeIcon(col.type);
                            const isExpanded = expandedCol === col.name;
                            return (
                                <div key={col.name} className={`rounded-xl border overflow-hidden transition-all ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                    <div className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors ${isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}
                                        onClick={() => setExpandedCol(isExpanded ? null : col.name)}>
                                        {isExpanded
                                            ? <ChevronDown size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                                            : <ChevronRight size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />}
                                        <div className={`p-1.5 rounded-lg ${col.type === 'number' ? (isDark ? 'bg-emerald-900/30' : 'bg-emerald-50') : (isDark ? 'bg-blue-900/30' : 'bg-blue-50')}`}>
                                            <TypeIcon size={14} className={col.type === 'number' ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-blue-400' : 'text-blue-600')} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-bold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{col.name}</p>
                                            <p className={`text-[10px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{col.type}</p>
                                        </div>
                                        <div className="flex items-center gap-6 shrink-0">
                                            <div className="text-center">
                                                <p className={`text-xs font-bold ${getCompletenessColor(col.completeness)}`}>{col.completeness.toFixed(1)}%</p>
                                                <p className={`text-[9px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Complete</p>
                                            </div>
                                            <div className="text-center">
                                                <p className={`text-xs font-bold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{col.uniqueCount}</p>
                                                <p className={`text-[9px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Unique</p>
                                            </div>
                                            <div className="text-center">
                                                <p className={`text-xs font-bold ${col.nullCount > 0 ? 'text-amber-500' : (isDark ? 'text-gray-400' : 'text-gray-500')}`}>{col.nullCount}</p>
                                                <p className={`text-[9px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Nulls</p>
                                            </div>
                                            <div className="w-32 h-8">
                                                {col.type === 'number' && col.stats.histogram ? (
                                                    <ReactECharts option={buildHistogramOption(col.stats.histogram)} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
                                                ) : col.stats.topValues ? (
                                                    <ReactECharts option={buildFrequencyOption(col.stats.topValues.slice(0, 8))} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className={`px-5 pb-5 pt-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                                            {col.type === 'number' ? (
                                                <div className="grid grid-cols-3 gap-6">
                                                    <div className="space-y-3">
                                                        <h4 className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Statistics</h4>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {[
                                                                { label: 'Min', value: col.stats.min?.toLocaleString() },
                                                                { label: 'Max', value: col.stats.max?.toLocaleString() },
                                                                { label: 'Mean', value: col.stats.mean?.toFixed(2) },
                                                                { label: 'Median', value: col.stats.median?.toLocaleString() },
                                                                { label: 'Std Dev', value: col.stats.stdDev?.toFixed(2) },
                                                                { label: 'Sum', value: col.stats.sum?.toLocaleString() },
                                                                { label: 'Q1', value: col.stats.q1?.toLocaleString() },
                                                                { label: 'Q3', value: col.stats.q3?.toLocaleString() },
                                                                { label: 'IQR', value: col.stats.iqr?.toLocaleString() },
                                                                { label: 'Zeros', value: col.stats.zeros },
                                                            ].map((s, i) => (
                                                                <div key={i} className={`p-2 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                                                                    <p className={`text-[9px] font-bold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{s.label}</p>
                                                                    <p className={`text-xs font-bold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{s.value}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2 space-y-3">
                                                        <h4 className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Distribution</h4>
                                                        <div className="h-48">
                                                            {col.stats.histogram && (
                                                                <ReactECharts
                                                                    option={{
                                                                        ...buildHistogramOption(col.stats.histogram),
                                                                        grid: { left: 40, right: 10, top: 10, bottom: 30 },
                                                                        xAxis: { type: 'category', data: col.stats.histogram.map(b => b.label), axisLabel: { fontSize: 9, color: isDark ? '#94a3b8' : '#64748b', rotate: 45 }, axisLine: { lineStyle: { color: isDark ? '#334155' : '#e2e8f0' } } },
                                                                        yAxis: { type: 'value', axisLabel: { fontSize: 9, color: isDark ? '#94a3b8' : '#64748b' }, splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9' } } },
                                                                    }}
                                                                    style={{ height: '100%', width: '100%' }}
                                                                />
                                                            )}
                                                        </div>
                                                        {col.stats.outlierCount > 0 && (
                                                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-amber-900/20' : 'bg-amber-50'}`}>
                                                                <AlertTriangle size={12} className="text-amber-500" />
                                                                <span className={`text-xs font-semibold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                                                                    {col.stats.outlierCount} outliers detected ({col.stats.outlierPercent.toFixed(1)}%)
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-3 gap-6">
                                                    <div className="space-y-3">
                                                        <h4 className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Statistics</h4>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {[
                                                                { label: 'Unique', value: col.uniqueCount },
                                                                { label: 'Unique %', value: col.uniquePercent.toFixed(1) + '%' },
                                                                { label: 'Avg Length', value: col.stats.avgLength },
                                                                { label: 'Min Length', value: col.stats.minLength },
                                                                { label: 'Max Length', value: col.stats.maxLength },
                                                                { label: 'Nulls', value: col.nullCount },
                                                            ].map((s, i) => (
                                                                <div key={i} className={`p-2 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                                                                    <p className={`text-[9px] font-bold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{s.label}</p>
                                                                    <p className={`text-xs font-bold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{s.value}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2 space-y-3">
                                                        <h4 className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Top Values</h4>
                                                        <div className="space-y-1.5">
                                                            {col.stats.topValues?.map((v, i) => (
                                                                <div key={i} className="flex items-center gap-3">
                                                                    <span className={`text-xs font-semibold truncate w-32 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{v.value}</span>
                                                                    <div className="flex-1 h-5 relative">
                                                                        <div className={`absolute inset-0 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`} />
                                                                        <div className="absolute inset-y-0 left-0 rounded-full bg-violet-500/70" style={{ width: `${Math.max(4, v.percent)}%` }} />
                                                                    </div>
                                                                    <span className={`text-[10px] font-bold w-16 text-right ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                        {v.count} ({v.percent.toFixed(1)}%)
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Correlation Matrix */}
                    {profile.numericCols.length >= 2 && (
                        <div className="space-y-3">
                            <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Correlation Matrix</h3>
                            <div className={`rounded-xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                <div style={{ height: Math.max(300, profile.numericCols.length * 50 + 100) }}>
                                    <ReactECharts option={buildCorrelationOption()} style={{ height: '100%', width: '100%' }} />
                                </div>
                                {profile.correlations.filter(c => Math.abs(c.value) >= 0.5).length > 0 && (
                                    <div className={`mt-4 pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Notable Correlations</p>
                                        <div className="flex flex-wrap gap-2">
                                            {profile.correlations
                                                .filter(c => Math.abs(c.value) >= 0.5)
                                                .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                                                .map((c, i) => (
                                                    <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                                        <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{c.col1} × {c.col2}</span>
                                                        <span style={{ color: getCorrelationColor(c.value) }} className="font-bold">{c.value > 0 ? '+' : ''}{c.value}</span>
                                                    </span>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DataProfiler;
