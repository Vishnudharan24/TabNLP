
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ChartType } from '../types';
import { buildChartOption } from '../services/echartsOptionBuilder';
import { useTheme } from '../contexts/ThemeContext';
import { MoreHorizontal, Maximize2, GripHorizontal, Filter } from 'lucide-react';

const Visualization = ({ config, dataset, isActive, isEditMode }) => {
    const { theme } = useTheme();

    if (!dataset) return null;

    const applyFilters = (data) => {
        if (!config.filters || config.filters.length === 0) return data;

        return data.filter(row => {
            return config.filters.every(f => {
                const val = row[f.column];
                const target = f.value;
                const targetSec = f.valueSecondary;

                switch (f.operator) {
                    case 'EQUALS': return String(val).toLowerCase() === String(target).toLowerCase();
                    case 'CONTAINS': return String(val).toLowerCase().includes(String(target).toLowerCase());
                    case 'STARTS_WITH': return String(val).toLowerCase().startsWith(String(target).toLowerCase());
                    case 'IS_EMPTY': return !val || val === '';
                    case 'GT': return Number(val) > Number(target);
                    case 'LT': return Number(val) < Number(target);
                    case 'BETWEEN': return Number(val) >= Number(target) && Number(val) <= Number(targetSec);
                    case 'IS_TRUE': return !!val;
                    case 'IS_FALSE': return !val;
                    default: return true;
                }
            });
        });
    };

    const processData = () => {
        const { dimension, measures, aggregation, type } = config;
        if (!dimension || !measures || measures.length === 0) return [];

        const filteredData = applyFilters(dataset.data);
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

    const renderVisual = () => {
        if (chartData.length === 0) return (
            <div className="h-full flex items-center justify-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest p-12 text-center">
                No results match the current filters
            </div>
        );

        const { type, measures } = config;

        // Table type — keep HTML renderer
        if (type === ChartType.TABLE) {
            return (
                <div className="h-full overflow-auto text-[11px] font-medium text-gray-600 dark:text-gray-300">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                <th className="py-3 px-4 uppercase tracking-widest font-black text-gray-400 dark:text-gray-500 text-[9px] sticky top-0 bg-white dark:bg-gray-800">{config.dimension}</th>
                                {measures.map(m => <th key={m} className="py-3 px-4 uppercase tracking-widest font-black text-gray-400 dark:text-gray-500 text-[9px] sticky top-0 bg-white dark:bg-gray-800">{m}</th>)}
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
                    <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.25em] mb-3 relative z-10">{config.title || measures[0]}</p>
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
        const option = buildChartOption(type, chartData, config, theme);

        return (
            <ReactECharts
                option={option}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
                notMerge={true}
                lazyUpdate={true}
            />
        );
    };

    return (
        <div className={`h-full w-full rounded-xl border flex flex-col group overflow-hidden transition-all duration-300 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} ${isEditMode ? 'p-4 shadow-md' : 'p-5 shadow-lg border-transparent'} ${isActive ? 'ring-2 ring-gray-500 dark:ring-gray-400 shadow-xl scale-[1.01]' : 'hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg'}`}>
            <div className="flex justify-between items-start mb-3 shrink-0">
                <div className="flex items-start gap-3 overflow-hidden">
                    {isEditMode && <div className="drag-handle mt-0.5 cursor-move p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 transition-colors shrink-0"><GripHorizontal size={14} /></div>}
                    <div className="overflow-hidden">
                        <h3 className="text-[11px] font-black text-gray-800 dark:text-gray-200 tracking-tight uppercase leading-none truncate">{config.title || "Analytics Card"}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-[8px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest truncate">{config.type.replace(/_/g, ' ')}</p>
                            {config.filters.length > 0 && <Filter size={8} className="text-blue-500" />}
                        </div>
                    </div>
                </div>
                {isEditMode && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"><Maximize2 size={14} /></button>
                        <button className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"><MoreHorizontal size={14} /></button>
                    </div>
                )}
            </div>
            <div className="flex-1 min-h-0 relative">
                {renderVisual()}
            </div>
        </div>
    );
};

export default Visualization;
