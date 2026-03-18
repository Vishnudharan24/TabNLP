import React from 'react';
import { Search, X } from 'lucide-react';

const FilterSelect = ({ label, value, onChange, options, isDark }) => (
    <label className="flex flex-col gap-1.5 min-w-[170px]">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
        >
            <option value="__all__">All</option>
            {options.map(option => (
                <option key={option} value={option}>{option}</option>
            ))}
        </select>
    </label>
);

const HRFiltersBar = ({
    dimensions,
    filters,
    onFiltersChange,
    isDark,
}) => {
    const update = (key, value) => onFiltersChange(prev => ({ ...prev, [key]: value }));

    return (
        <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="flex flex-wrap items-end gap-3">
                <div className={`flex items-center gap-2 flex-1 min-w-[260px] px-3 py-2 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
                    <Search size={14} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                    <input
                        value={filters.search}
                        onChange={(e) => update('search', e.target.value)}
                        placeholder="Search by employee ID, name, or email"
                        className={`flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-gray-100 placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'}`}
                    />
                    {filters.search && (
                        <button onClick={() => update('search', '')} className={isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}>
                            <X size={14} />
                        </button>
                    )}
                </div>

                <FilterSelect
                    label="Department"
                    value={filters.department}
                    onChange={(value) => update('department', value)}
                    options={dimensions.departments}
                    isDark={isDark}
                />
                <FilterSelect
                    label="Gender"
                    value={filters.gender}
                    onChange={(value) => update('gender', value)}
                    options={dimensions.genders}
                    isDark={isDark}
                />
                <FilterSelect
                    label="Location"
                    value={filters.location}
                    onChange={(value) => update('location', value)}
                    options={dimensions.locations}
                    isDark={isDark}
                />
                <FilterSelect
                    label="Employment Status"
                    value={filters.status}
                    onChange={(value) => update('status', value)}
                    options={dimensions.statuses}
                    isDark={isDark}
                />

                <label className="flex flex-col gap-1.5 min-w-[170px]">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Join Date From</span>
                    <input
                        type="date"
                        value={filters.fromDate}
                        onChange={(e) => update('fromDate', e.target.value)}
                        className={`px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                    />
                </label>

                <label className="flex flex-col gap-1.5 min-w-[170px]">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Join Date To</span>
                    <input
                        type="date"
                        value={filters.toDate}
                        onChange={(e) => update('toDate', e.target.value)}
                        className={`px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                    />
                </label>

                <button
                    onClick={() => onFiltersChange({
                        department: '__all__',
                        gender: '__all__',
                        location: '__all__',
                        status: '__all__',
                        fromDate: '',
                        toDate: '',
                        search: '',
                    })}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border ${isDark ? 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                    Reset Filters
                </button>
            </div>
        </div>
    );
};

export default HRFiltersBar;
