import React from 'react';
import { Users, UserCheck, TrendingDown, Timer } from 'lucide-react';

const TrendPill = ({ trend = 'neutral', text = '', isDark }) => {
    const styles = trend === 'up'
        ? (isDark ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/60' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
        : trend === 'down'
            ? (isDark ? 'bg-rose-900/40 text-rose-300 border-rose-700/60' : 'bg-rose-50 text-rose-700 border-rose-200')
            : (isDark ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-600 border-gray-200');

    const icon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${styles}`}>
            {icon} {text}
        </span>
    );
};

const KpiCard = ({ title, value, hint, icon: Icon, isDark, trend, trendText }) => (
    <div className={`rounded-2xl border p-5 shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-start justify-between">
            <div>
                <p className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{title}</p>
                <p className={`text-3xl font-black mt-2 tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{value}</p>
                {trendText ? <div className="mt-2"><TrendPill trend={trend} text={trendText} isDark={isDark} /></div> : null}
                <p className={`text-xs mt-2 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{hint}</p>
            </div>
            <div className={`p-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                <Icon size={20} />
            </div>
        </div>
    </div>
);

const HRKpiCards = ({ metrics, isDark }) => {
    const cards = [
        {
            title: 'Total Employees',
            value: metrics.totalEmployees.toLocaleString(),
            hint: 'In filtered HR population',
            icon: Users,
            trend: 'neutral',
            trendText: 'Current slice',
        },
        {
            title: 'Active Employees',
            value: metrics.activeEmployees.toLocaleString(),
            hint: `${metrics.activeRate.toFixed(1)}% active workforce`,
            icon: UserCheck,
            trend: metrics.activeRate >= 70 ? 'up' : (metrics.activeRate >= 50 ? 'neutral' : 'down'),
            trendText: `${metrics.activeRate.toFixed(1)}% active`,
        },
        {
            title: 'Attrition Rate',
            value: `${metrics.attritionRate.toFixed(1)}%`,
            hint: `${metrics.exitedEmployees.toLocaleString()} exited employees`,
            icon: TrendingDown,
            trend: metrics.attritionRate <= 8 ? 'up' : (metrics.attritionRate <= 15 ? 'neutral' : 'down'),
            trendText: metrics.attritionRate <= 8 ? 'Healthy' : (metrics.attritionRate <= 15 ? 'Watchlist' : 'High risk'),
        },
        {
            title: 'Avg Experience',
            value: `${metrics.avgExperience.toFixed(1)} yrs`,
            hint: 'Average years of experience',
            icon: Timer,
            trend: metrics.avgExperience >= 5 ? 'up' : 'neutral',
            trendText: metrics.avgExperience >= 5 ? 'Experienced base' : 'Growing base',
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {cards.map(card => (
                <KpiCard key={card.title} {...card} isDark={isDark} />
            ))}
        </div>
    );
};

export default HRKpiCards;
