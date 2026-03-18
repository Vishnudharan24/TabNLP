import React from 'react';
import { Users, UserCheck, TrendingDown, Timer } from 'lucide-react';

const KpiCard = ({ title, value, hint, icon: Icon, isDark }) => (
    <div className={`rounded-2xl border p-5 shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-start justify-between">
            <div>
                <p className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{title}</p>
                <p className={`text-3xl font-black mt-2 tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{value}</p>
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
        },
        {
            title: 'Active Employees',
            value: metrics.activeEmployees.toLocaleString(),
            hint: `${metrics.activeRate.toFixed(1)}% active workforce`,
            icon: UserCheck,
        },
        {
            title: 'Attrition Rate',
            value: `${metrics.attritionRate.toFixed(1)}%`,
            hint: `${metrics.exitedEmployees.toLocaleString()} exited employees`,
            icon: TrendingDown,
        },
        {
            title: 'Avg Experience',
            value: `${metrics.avgExperience.toFixed(1)} yrs`,
            hint: 'Average years of experience',
            icon: Timer,
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
