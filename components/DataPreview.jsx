import React, { useState, useMemo } from 'react';
import {
    X, Search, ArrowUpDown, ChevronLeft, ChevronRight,
    Hash, Type, Calendar, ToggleLeft, Eye, EyeOff,
    Edit3, Check, ArrowUp, ArrowDown, Table, Download
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const TYPE_META = {
    number: { icon: Hash, color: 'emerald', label: 'Number' },
    string: { icon: Type, color: 'blue', label: 'Text' },
    date: { icon: Calendar, color: 'violet', label: 'Date' },
    boolean: { icon: ToggleLeft, color: 'amber', label: 'Boolean' },
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const DataPreview = ({ dataset, onClose, onUpdateDataset }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Local state
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);
    const [search, setSearch] = useState('');
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState('asc');
    const [editingCol, setEditingCol] = useState(null);
    const [editName, setEditName] = useState('');
    const [excludedCols, setExcludedCols] = useState(new Set());
    const [typeOverrides, setTypeOverrides] = useState({});

    if (!dataset) return null;

    const columns = dataset.columns.map(c => ({
        ...c,
        type: typeOverrides[c.name] || c.type,
    }));

    // Filter rows by search
    const filteredData = useMemo(() => {
        if (!search.trim()) return dataset.data;
        const q = search.toLowerCase();
        return dataset.data.filter(row =>
            Object.values(row).some(v => String(v ?? '').toLowerCase().includes(q))
        );
    }, [dataset.data, search]);

    // Sort
    const sortedData = useMemo(() => {
        if (!sortCol) return filteredData;
        return [...filteredData].sort((a, b) => {
            const av = a[sortCol], bv = b[sortCol];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') {
                return sortDir === 'asc' ? av - bv : bv - av;
            }
            const cmp = String(av).localeCompare(String(bv));
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [filteredData, sortCol, sortDir]);

    // Pagination
    const totalPages = Math.ceil(sortedData.length / pageSize);
    const pageData = sortedData.slice(page * pageSize, (page + 1) * pageSize);
    const visibleColumns = columns.filter(c => !excludedCols.has(c.name));

    const handleSort = (colName) => {
        if (sortCol === colName) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(colName);
            setSortDir('asc');
        }
    };

    const toggleExclude = (colName) => {
        setExcludedCols(prev => {
            const next = new Set(prev);
            if (next.has(colName)) next.delete(colName);
            else next.add(colName);
            return next;
        });
    };

    const startRename = (col) => {
        setEditingCol(col.name);
        setEditName(col.name);
    };

    const commitRename = (oldName) => {
        const newName = editName.trim();
        if (newName && newName !== oldName && onUpdateDataset) {
            const updatedColumns = dataset.columns.map(c =>
                c.name === oldName ? { ...c, name: newName } : c
            );
            const updatedData = dataset.data.map(row => {
                const newRow = { ...row };
                if (oldName in newRow) {
                    newRow[newName] = newRow[oldName];
                    delete newRow[oldName];
                }
                return newRow;
            });
            onUpdateDataset({ ...dataset, columns: updatedColumns, data: updatedData });
        }
        setEditingCol(null);
        setEditName('');
    };

    const cycleType = (colName) => {
        const types = ['string', 'number', 'date', 'boolean'];
        const current = typeOverrides[colName] || columns.find(c => c.name === colName)?.type || 'string';
        const idx = types.indexOf(current);
        const next = types[(idx + 1) % types.length];
        setTypeOverrides(prev => ({ ...prev, [colName]: next }));
        if (onUpdateDataset) {
            const updatedColumns = dataset.columns.map(c =>
                c.name === colName ? { ...c, type: next } : c
            );
            onUpdateDataset({ ...dataset, columns: updatedColumns });
        }
    };

    // Column stats
    const getColStats = (col) => {
        const vals = dataset.data.map(r => r[col.name]).filter(v => v != null && v !== '');
        const nullCount = dataset.data.length - vals.length;

        if (col.type === 'number') {
            const nums = vals.map(Number).filter(n => !isNaN(n));
            if (nums.length === 0) return { nullCount, unique: 0 };
            return {
                min: Math.min(...nums),
                max: Math.max(...nums),
                avg: (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1),
                nullCount,
                unique: new Set(nums).size,
            };
        }
        return {
            unique: new Set(vals.map(String)).size,
            nullCount,
        };
    };

    const exportCSV = () => {
        const cols = visibleColumns.map(c => c.name);
        const header = cols.join(',');
        const rows = sortedData.map(row =>
            cols.map(c => {
                const v = row[c];
                if (v == null) return '';
                const s = String(v);
                return s.includes(',') || s.includes('"') || s.includes('\n')
                    ? `"${s.replace(/"/g, '""')}"`
                    : s;
            }).join(',')
        );
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${dataset.name.replace(/\.\w+$/, '')}_preview.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
            <div className={`w-full max-w-7xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                {/* Header */}
                <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                            <Table size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                        </div>
                        <div>
                            <h2 className={`text-lg font-bold tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{dataset.name}</h2>
                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {dataset.data.length.toLocaleString()} rows · {columns.length} columns
                                {excludedCols.size > 0 && ` · ${excludedCols.size} hidden`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={exportCSV} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                            <Download size={14} /> Export
                        </button>
                        <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className={`flex items-center gap-3 px-6 py-3 border-b shrink-0 ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                    <div className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                        <Search size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(0); }}
                            placeholder="Search across all columns..."
                            className={`flex-1 bg-transparent text-xs outline-none ${isDark ? 'text-gray-200 placeholder-gray-600' : 'text-gray-700 placeholder-gray-400'}`}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className={isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}>
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {filteredData.length.toLocaleString()} results
                    </span>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-xs">
                        <thead className={`sticky top-0 z-10 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                            <tr>
                                <th className={`px-4 py-3 text-left font-bold text-[10px] uppercase tracking-wider w-12 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>#</th>
                                {visibleColumns.map(col => {
                                    const meta = TYPE_META[col.type] || TYPE_META.string;
                                    const Icon = meta.icon;
                                    const stats = getColStats(col);
                                    const isSorted = sortCol === col.name;

                                    return (
                                        <th key={col.name} className={`px-4 py-3 text-left group relative ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                                            <div className="flex items-center gap-2">
                                                {/* Type badge — click to cycle */}
                                                <button
                                                    onClick={() => cycleType(col.name)}
                                                    title={`Type: ${meta.label} (click to change)`}
                                                    className={`shrink-0 p-1 rounded-md transition-colors bg-${meta.color}-100 dark:bg-${meta.color}-900/30 text-${meta.color}-600 dark:text-${meta.color}-400 hover:ring-2 ring-${meta.color}-300`}
                                                >
                                                    <Icon size={12} />
                                                </button>

                                                {/* Name — click to sort, double-click to rename */}
                                                {editingCol === col.name ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            autoFocus
                                                            value={editName}
                                                            onChange={e => setEditName(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') commitRename(col.name);
                                                                if (e.key === 'Escape') setEditingCol(null);
                                                            }}
                                                            className={`w-24 px-1.5 py-0.5 text-[11px] font-bold rounded border outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'}`}
                                                        />
                                                        <button onClick={() => commitRename(col.name)} className="text-emerald-500 hover:text-emerald-600">
                                                            <Check size={12} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleSort(col.name)}
                                                        onDoubleClick={() => startRename(col)}
                                                        className={`flex items-center gap-1 font-bold text-[11px] uppercase tracking-wider truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
                                                        title="Click to sort · Double-click to rename"
                                                    >
                                                        <span className="truncate max-w-[120px]">{col.name}</span>
                                                        {isSorted && (sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                                                    </button>
                                                )}

                                                {/* Actions */}
                                                <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => startRename(col)} title="Rename" className={`p-1 rounded ${isDark ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}>
                                                        <Edit3 size={10} />
                                                    </button>
                                                    <button onClick={() => toggleExclude(col.name)} title="Hide column" className={`p-1 rounded ${isDark ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}>
                                                        <EyeOff size={10} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Mini stats bar */}
                                            <div className={`flex items-center gap-2 mt-1.5 text-[9px] font-semibold ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                                <span>{stats.unique} unique</span>
                                                {stats.nullCount > 0 && <span className="text-amber-500">{stats.nullCount} null</span>}
                                                {stats.min != null && <span>({stats.min}–{stats.max})</span>}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {pageData.map((row, rowIdx) => (
                                <tr key={rowIdx} className={`border-b transition-colors ${isDark ? 'border-gray-800 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-gray-50'}`}>
                                    <td className={`px-4 py-2.5 font-mono text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                        {page * pageSize + rowIdx + 1}
                                    </td>
                                    {visibleColumns.map(col => {
                                        const val = row[col.name];
                                        const isEmpty = val === null || val === undefined || val === '';
                                        return (
                                            <td key={col.name} className={`px-4 py-2.5 truncate max-w-[200px] ${isEmpty ? (isDark ? 'text-gray-700 italic' : 'text-gray-300 italic') : (isDark ? 'text-gray-300' : 'text-gray-700')}`}>
                                                {isEmpty ? 'null' : String(val)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {pageData.length === 0 && (
                                <tr>
                                    <td colSpan={visibleColumns.length + 1} className="text-center py-16">
                                        <p className={`text-sm font-semibold ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No matching rows</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer — pagination + hidden columns */}
                <div className={`flex items-center justify-between px-6 py-3 border-t shrink-0 ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                        {/* Hidden columns chips */}
                        {excludedCols.size > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] font-bold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Hidden:</span>
                                {[...excludedCols].map(name => (
                                    <button
                                        key={name}
                                        onClick={() => toggleExclude(name)}
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${isDark ? 'bg-gray-700 border-gray-600 text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'}`}
                                    >
                                        <Eye size={9} /> {name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <select
                            value={pageSize}
                            onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
                            className={`text-[10px] font-bold rounded-lg border px-2 py-1 ${isDark ? 'bg-gray-800 border-gray-600 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}
                        >
                            {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} rows</option>)}
                        </select>

                        <span className={`text-[10px] font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            Page {page + 1} of {Math.max(totalPages, 1)}
                        </span>

                        <div className="flex gap-1">
                            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className={`p-1.5 rounded-lg border transition-all disabled:opacity-30 ${isDark ? 'border-gray-600 text-gray-400 hover:bg-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                                <ChevronLeft size={14} />
                            </button>
                            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className={`p-1.5 rounded-lg border transition-all disabled:opacity-30 ${isDark ? 'border-gray-600 text-gray-400 hover:bg-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataPreview;
