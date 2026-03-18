import React from 'react';
import ReactECharts from 'echarts-for-react';

const HRChartCard = ({ title, subtitle, option, isDark, height = 300, onEvents }) => (
    <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="mb-2">
            <h3 className={`text-sm font-bold tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
            {subtitle && <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{subtitle}</p>}
        </div>
        <ReactECharts
            option={option}
            style={{ width: '100%', height }}
            notMerge={true}
            lazyUpdate={true}
            onEvents={onEvents}
        />
    </div>
);

export default HRChartCard;
