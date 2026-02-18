
import React, { useState, useMemo, useRef } from 'react';
import { Filter, Plus, X, ChevronDown, Search, Trash2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const GlobalFilterBar = ({ datasets, globalFilters, onAddFilter, onUpdateFilter, onRemoveFilter, onClearAll }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [editingFilterId, setEditingFilterId] = useState(null);
    const menuRef = useRef(null);

    // Get all unique columns across all datasets
    const availableColumns = useMemo(() => {
        const colMap = new Map();
        datasets.forEach(ds => {
            ds.columns.forEach(col => {
                if (!colMap.has(col.name)) {
                    colMap.set(col.name, { ...col, datasets: [ds.name] });
                } else {
                    colMap.get(col.name).datasets.push(ds.name);
                }
            });
        });
        return Array.from(colMap.values());
    }, [datasets]);

    const getUniqueValues = (columnName) => {
        const values = new Set();
        datasets.forEach(ds => {
            if (ds.columns.some(c => c.name === columnName)) {
                ds.data.forEach(row => {
                    if (row[columnName] != null && row[columnName] !== '') {
                        values.add(String(row[columnName]));
                    }
                });
            }
        });
        return [...values].sort();
    };

    const getNumericRange = (columnName) => {
        let min = Infinity, max = -Infinity;
        datasets.forEach(ds => {
            if (ds.columns.some(c => c.name === columnName)) {
                ds.data.forEach(row => {
                    const val = Number(row[columnName]);
                    if (!isNaN(val)) {
                        min = Math.min(min, val);
                        max = Math.max(max, val);
                    }
                });
            }
        });
        return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 100 : max };
    };

    const handleAddFilter = (col) => {
        const filter = {
            id: Math.random().toString(36).substr(2, 9),
            column: col.name,
            columnType: col.type,
        };
        if (col.type === 'number') {
            const range = getNumericRange(col.name);
            filter.type = 'range';
            filter.min = range.min;
            filter.max = range.max;
            filter.rangeMin = range.min;
            filter.rangeMax = range.max;
        } else {
            filter.type = 'include';
            filter.values = [];
            filter.allValues = getUniqueValues(col.name);
        }
        onAddFilter(filter);
        setShowAddMenu(false);
        setEditingFilterId(filter.id);
    };

    // Close dropdown on outside click
    const handleBackdropClick = (e) => {
        if (editingFilterId) setEditingFilterId(null);
        if (showAddMenu) setShowAddMenu(false);
    };

    if (datasets.length === 0) return null;

    return (
        <>
            {/* Backdrop to close dropdowns */}
            {(editingFilterId || showAddMenu) && (
                <div className="fixed inset-0 z-30" onClick={handleBackdropClick} />
            )}
            <div className={`px-6 py-2.5 flex items-center gap-3 border-b shrink-0 z-20 ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50/80 border-gray-200'}`}>
                <div className="flex items-center gap-2 shrink-0">
                    <Filter size={13} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        Global Filters
                    </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    {globalFilters.map(filter => (
                        <FilterPill
                            key={filter.id}
                            filter={filter}
                            isEditing={editingFilterId === filter.id}
                            onEdit={() => setEditingFilterId(editingFilterId === filter.id ? null : filter.id)}
                            onUpdate={(updates) => onUpdateFilter(filter.id, updates)}
                            onRemove={() => { onRemoveFilter(filter.id); if (editingFilterId === filter.id) setEditingFilterId(null); }}
                            getUniqueValues={getUniqueValues}
                            isDark={isDark}
                        />
                    ))}

                    {/* Add Filter Button */}
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowAddMenu(!showAddMenu); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border border-dashed ${isDark ? 'border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-300' : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'}`}
                        >
                            <Plus size={12} /> Add Filter
                        </button>
                        {showAddMenu && (
                            <div onClick={e => e.stopPropagation()} className={`absolute top-full left-0 mt-1 w-56 rounded-xl shadow-xl border z-50 overflow-hidden ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                <div className={`p-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                                    <p className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Select Column</p>
                                </div>
                                <div className="max-h-48 overflow-y-auto p-1">
                                    {availableColumns.map(col => (
                                        <button key={col.name} onClick={() => handleAddFilter(col)}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                                            <span className={`text-[9px] font-black w-5 h-5 flex items-center justify-center rounded ${col.type === 'number' ? (isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600') : (isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600')}`}>
                                                {col.type === 'number' ? 'Σ' : 'Aa'}
                                            </span>
                                            <span className="truncate">{col.name}</span>
                                            <span className={`ml-auto text-[9px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{col.datasets.length} ds</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {globalFilters.length > 0 && (
                        <button onClick={onClearAll}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${isDark ? 'text-gray-500 hover:text-rose-400' : 'text-gray-400 hover:text-rose-500'}`}>
                            <Trash2 size={10} /> Clear All
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};

// Individual filter pill with dropdown editor
const FilterPill = ({ filter, isEditing, onEdit, onUpdate, onRemove, getUniqueValues, isDark }) => {
    const [searchText, setSearchText] = useState('');

    const displayValue = useMemo(() => {
        if (filter.type === 'range') {
            const minChanged = filter.rangeMin > filter.min;
            const maxChanged = filter.rangeMax < filter.max;
            if (!minChanged && !maxChanged) return 'All';
            return `${Number(filter.rangeMin).toLocaleString()} – ${Number(filter.rangeMax).toLocaleString()}`;
        }
        if (filter.type === 'include') {
            if (!filter.values || filter.values.length === 0) return 'All';
            if (filter.values.length === 1) return filter.values[0];
            return `${filter.values.length} selected`;
        }
        return '';
    }, [filter]);

    const isActive = filter.type === 'include'
        ? filter.values && filter.values.length > 0
        : (filter.rangeMin > filter.min || filter.rangeMax < filter.max);

    return (
        <div className="relative z-40">
            <div className={`flex items-center gap-1 rounded-lg border transition-all ${isActive
                ? (isDark ? 'bg-blue-900/30 border-blue-700 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700')
                : (isDark ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-white border-gray-200 text-gray-600')
                }`}>
                <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold">
                    <span className="font-bold">{filter.column}</span>
                    <span className="opacity-60 max-w-[120px] truncate">{displayValue}</span>
                    <ChevronDown size={10} />
                </button>
                <button onClick={onRemove} className={`pr-2 transition-colors ${isDark ? 'hover:text-rose-400' : 'hover:text-rose-500'}`}>
                    <X size={12} />
                </button>
            </div>

            {isEditing && (
                <div onClick={e => e.stopPropagation()} className={`absolute top-full left-0 mt-1 w-64 rounded-xl shadow-xl border z-50 overflow-hidden ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    {filter.type === 'include' ? (
                        <div>
                            <div className={`p-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                                <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                                    <Search size={12} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                                    <input type="text" placeholder="Search values..." value={searchText}
                                        onChange={e => setSearchText(e.target.value)}
                                        className={`bg-transparent text-xs flex-1 outline-none ${isDark ? 'text-gray-200 placeholder-gray-500' : 'text-gray-700 placeholder-gray-400'}`}
                                    />
                                </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto p-1">
                                {(filter.allValues || getUniqueValues(filter.column))
                                    .filter(v => v.toLowerCase().includes(searchText.toLowerCase()))
                                    .map(value => {
                                        const isSelected = filter.values?.includes(value);
                                        return (
                                            <label key={value} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-xs ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                                                <input type="checkbox" checked={isSelected}
                                                    onChange={() => {
                                                        const newValues = isSelected
                                                            ? filter.values.filter(v => v !== value)
                                                            : [...(filter.values || []), value];
                                                        onUpdate({ values: newValues });
                                                    }} className="rounded" />
                                                <span className={`truncate font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{value}</span>
                                            </label>
                                        );
                                    })}
                            </div>
                            <div className={`p-2 border-t flex items-center gap-2 ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                                <button onClick={() => onUpdate({ values: filter.allValues || getUniqueValues(filter.column) })}
                                    className={`flex-1 text-center py-1.5 rounded-lg text-[10px] font-bold ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                    Select All
                                </button>
                                <button onClick={() => onUpdate({ values: [] })}
                                    className={`flex-1 text-center py-1.5 rounded-lg text-[10px] font-bold ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                    Clear
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 space-y-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className={`text-[10px] font-bold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Min: {Number(filter.rangeMin).toLocaleString()}</span>
                                    <span className={`text-[10px] font-bold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Max: {Number(filter.rangeMax).toLocaleString()}</span>
                                </div>
                                <input type="range" min={filter.min} max={filter.max} value={filter.rangeMin}
                                    step={(filter.max - filter.min) / 100 || 1}
                                    onChange={e => onUpdate({ rangeMin: Number(e.target.value) })}
                                    className="w-full accent-blue-500" />
                                <input type="range" min={filter.min} max={filter.max} value={filter.rangeMax}
                                    step={(filter.max - filter.min) / 100 || 1}
                                    onChange={e => onUpdate({ rangeMax: Number(e.target.value) })}
                                    className="w-full accent-blue-500" />
                            </div>
                            <div className="flex gap-2">
                                <input type="number" value={filter.rangeMin}
                                    onChange={e => onUpdate({ rangeMin: Number(e.target.value) })}
                                    className={`w-1/2 px-2 py-1.5 rounded-lg text-xs border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-700'}`} />
                                <input type="number" value={filter.rangeMax}
                                    onChange={e => onUpdate({ rangeMax: Number(e.target.value) })}
                                    className={`w-1/2 px-2 py-1.5 rounded-lg text-xs border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-700'}`} />
                            </div>
                            <button onClick={() => onUpdate({ rangeMin: filter.min, rangeMax: filter.max })}
                                className={`w-full py-1.5 rounded-lg text-[10px] font-bold ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                Reset Range
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalFilterBar;
