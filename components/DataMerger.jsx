import React, { useState, useMemo, useCallback } from 'react';
import {
    X, Merge, ArrowRight, ArrowLeftRight, ChevronDown, Check,
    Database, Table, AlertCircle, Sparkles, Hash, Type,
    Calendar, ToggleLeft, Plus, Trash2, Eye
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { mergeDatasets, suggestJoinKeys } from '../services/dataMerger';

const JOIN_TYPES = [
    { value: 'inner', label: 'Inner Join', desc: 'Only matching rows from both', icon: '⊗' },
    { value: 'left', label: 'Left Join', desc: 'All left + matching right', icon: '⊂' },
    { value: 'right', label: 'Right Join', desc: 'Matching left + all right', icon: '⊃' },
    { value: 'full', label: 'Full Outer', desc: 'All rows from both sides', icon: '⊕' },
    { value: 'append', label: 'Append (Union)', desc: 'Stack rows vertically', icon: '⊞' },
];

const TYPE_META = {
    number: { icon: Hash, color: 'emerald' },
    string: { icon: Type, color: 'blue' },
    date: { icon: Calendar, color: 'violet' },
    boolean: { icon: ToggleLeft, color: 'amber' },
};

const DataMerger = ({ datasets, onClose, onMergeComplete }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [leftId, setLeftId] = useState(datasets[0]?.id || '');
    const [rightId, setRightId] = useState(datasets[1]?.id || '');
    const [joinType, setJoinType] = useState('inner');
    const [keyPairs, setKeyPairs] = useState([{ leftKey: '', rightKey: '' }]);
    const [mergedName, setMergedName] = useState('');
    const [previewData, setPreviewData] = useState(null);
    const [error, setError] = useState('');
    const [step, setStep] = useState(1); // 1=config, 2=preview

    const leftDs = datasets.find(d => d.id === leftId);
    const rightDs = datasets.find(d => d.id === rightId);

    // Auto-suggest keys when both datasets are selected
    const suggestions = useMemo(() => {
        if (!leftDs || !rightDs) return [];
        return suggestJoinKeys(leftDs.columns, rightDs.columns);
    }, [leftDs, rightDs]);

    // Auto-fill first key pair from suggestions
    const applySuggestion = useCallback((suggestion) => {
        setKeyPairs([{ leftKey: suggestion.leftKey, rightKey: suggestion.rightKey }]);
    }, []);

    const addKeyPair = () => {
        setKeyPairs(prev => [...prev, { leftKey: '', rightKey: '' }]);
    };

    const removeKeyPair = (idx) => {
        setKeyPairs(prev => prev.filter((_, i) => i !== idx));
    };

    const updateKeyPair = (idx, field, value) => {
        setKeyPairs(prev => prev.map((kp, i) => i === idx ? { ...kp, [field]: value } : kp));
    };

    const isAppend = joinType === 'append';

    const canPreview = leftDs && rightDs && leftId !== rightId &&
        (isAppend || keyPairs.every(kp => kp.leftKey && kp.rightKey));

    const runPreview = () => {
        setError('');
        try {
            // For simplicity, use only the first key pair for merging
            // (multi-key would require a composite key approach)
            const result = mergeDatasets({
                leftData: leftDs.data,
                rightData: rightDs.data,
                leftColumns: leftDs.columns,
                rightColumns: rightDs.columns,
                leftKey: keyPairs[0]?.leftKey || '',
                rightKey: keyPairs[0]?.rightKey || '',
                joinType,
            });
            setPreviewData(result);
            setStep(2);
        } catch (e) {
            setError(e.message || 'Merge failed');
        }
    };

    const confirmMerge = () => {
        if (!previewData) return;
        const name = mergedName.trim() || `${leftDs.name} + ${rightDs.name}`;
        onMergeComplete({
            id: Math.random().toString(36).substr(2, 9),
            name,
            columns: previewData.columns,
            data: previewData.data,
            _meta: { merged: true, leftSource: leftDs.name, rightSource: rightDs.name, joinType },
        });
    };

    const previewRows = previewData?.data.slice(0, 50) || [];
    const previewCols = previewData?.columns || [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
            <div className={`w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>

                {/* Header */}
                <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                            <Merge size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                        </div>
                        <div>
                            <h2 className={`text-lg font-bold tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {step === 1 ? 'Merge Datasets' : 'Preview Merged Result'}
                            </h2>
                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {step === 1 ? 'Select two datasets and configure the join' : `${previewData?.data.length.toLocaleString()} rows · ${previewCols.length} columns`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {step === 2 && (
                            <button onClick={() => setStep(1)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                                ← Back
                            </button>
                        )}
                        <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {step === 1 ? (
                    /* ─── STEP 1: Configuration ─── */
                    <div className="flex-1 overflow-y-auto p-6 space-y-8">

                        {/* Dataset Selection */}
                        <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-start">
                            {/* Left Dataset */}
                            <DatasetSelector
                                label="Left Dataset"
                                datasets={datasets}
                                selectedId={leftId}
                                excludeId={rightId}
                                onChange={setLeftId}
                                isDark={isDark}
                            />

                            <div className="flex items-center justify-center pt-8">
                                <div className={`p-3 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                    <ArrowLeftRight size={20} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                                </div>
                            </div>

                            {/* Right Dataset */}
                            <DatasetSelector
                                label="Right Dataset"
                                datasets={datasets}
                                selectedId={rightId}
                                excludeId={leftId}
                                onChange={setRightId}
                                isDark={isDark}
                            />
                        </div>

                        {/* Join Type */}
                        <div className="space-y-3">
                            <h3 className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Join Type</h3>
                            <div className="grid grid-cols-5 gap-2">
                                {JOIN_TYPES.map(jt => (
                                    <button
                                        key={jt.value}
                                        onClick={() => setJoinType(jt.value)}
                                        className={`p-3 rounded-xl border text-center transition-all ${joinType === jt.value
                                            ? (isDark ? 'bg-gray-700 border-gray-500 ring-2 ring-gray-500' : 'bg-gray-50 border-gray-400 ring-2 ring-gray-400')
                                            : (isDark ? 'bg-gray-800 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-200 hover:border-gray-300')
                                            }`}
                                    >
                                        <div className="text-2xl mb-1">{jt.icon}</div>
                                        <div className={`text-[11px] font-bold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{jt.label}</div>
                                        <div className={`text-[9px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{jt.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Key Mapping (hidden for append) */}
                        {!isAppend && leftDs && rightDs && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Join Keys</h3>
                                    <button onClick={addKeyPair} className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}>
                                        <Plus size={12} /> Add Key
                                    </button>
                                </div>

                                {/* Suggestions */}
                                {suggestions.length > 0 && (
                                    <div className={`flex items-start gap-2 p-3 rounded-xl border ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-amber-50/50 border-amber-200'}`}>
                                        <Sparkles size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <p className={`text-[10px] font-bold mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Suggested join keys:</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {suggestions.slice(0, 5).map((s, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => applySuggestion(s)}
                                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${isDark ? 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}
                                                    >
                                                        <span>{s.leftKey}</span>
                                                        <ArrowRight size={10} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                                                        <span>{s.rightKey}</span>
                                                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[8px] font-bold ${s.confidence >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-500'}`}>
                                                            {s.confidence}%
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Key pair rows */}
                                {keyPairs.map((kp, idx) => (
                                    <div key={idx} className="grid grid-cols-[1fr,auto,1fr,auto] gap-3 items-center">
                                        <select
                                            value={kp.leftKey}
                                            onChange={e => updateKeyPair(idx, 'leftKey', e.target.value)}
                                            className={`w-full px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}
                                        >
                                            <option value="">Select left column…</option>
                                            {leftDs.columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                        </select>

                                        <div className={`flex items-center justify-center ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>
                                            <ArrowRight size={16} />
                                        </div>

                                        <select
                                            value={kp.rightKey}
                                            onChange={e => updateKeyPair(idx, 'rightKey', e.target.value)}
                                            className={`w-full px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}
                                        >
                                            <option value="">Select right column…</option>
                                            {rightDs.columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                        </select>

                                        {keyPairs.length > 1 && (
                                            <button onClick={() => removeKeyPair(idx)} className="p-1.5 text-gray-400 hover:text-rose-500 transition-colors">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                        {keyPairs.length <= 1 && <div className="w-8" />}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Column Preview */}
                        {leftDs && rightDs && (
                            <div className="grid grid-cols-2 gap-4">
                                <ColumnList columns={leftDs.columns} label={leftDs.name} isDark={isDark} />
                                <ColumnList columns={rightDs.columns} label={rightDs.name} isDark={isDark} />
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                                <AlertCircle size={14} /> {error}
                            </div>
                        )}
                    </div>
                ) : (
                    /* ─── STEP 2: Preview ─── */
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-xs">
                            <thead className={`sticky top-0 z-10 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                                <tr>
                                    <th className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider w-12 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>#</th>
                                    {previewCols.map(col => {
                                        const meta = TYPE_META[col.type] || TYPE_META.string;
                                        const Icon = meta.icon;
                                        return (
                                            <th key={col.name} className={`px-3 py-2.5 text-left`}>
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`p-0.5 rounded bg-${meta.color}-100 dark:bg-${meta.color}-900/30 text-${meta.color}-600 dark:text-${meta.color}-400`}>
                                                        <Icon size={10} />
                                                    </span>
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{col.name}</span>
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {previewRows.map((row, i) => (
                                    <tr key={i} className={`border-b ${isDark ? 'border-gray-800 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-gray-50'}`}>
                                        <td className={`px-3 py-2 font-mono text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{i + 1}</td>
                                        {previewCols.map(col => {
                                            const val = row[col.name];
                                            const isEmpty = val === null || val === undefined || val === '';
                                            return (
                                                <td key={col.name} className={`px-3 py-2 truncate max-w-[160px] ${isEmpty ? (isDark ? 'text-gray-700 italic' : 'text-gray-300 italic') : (isDark ? 'text-gray-300' : 'text-gray-700')}`}>
                                                    {isEmpty ? 'null' : String(val)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {previewData && previewData.data.length > 50 && (
                            <div className={`text-center py-3 text-[10px] font-bold ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                Showing 50 of {previewData.data.length.toLocaleString()} rows
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className={`flex items-center justify-between px-6 py-4 border-t shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                        {step === 2 && (
                            <>
                                <label className={`text-[10px] font-bold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Dataset Name</label>
                                <input
                                    type="text"
                                    value={mergedName}
                                    onChange={e => setMergedName(e.target.value)}
                                    placeholder={`${leftDs?.name || ''} + ${rightDs?.name || ''}`}
                                    className={`px-3 py-2 rounded-lg border text-xs font-semibold w-64 ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-600' : 'bg-white border-gray-200 text-gray-700 placeholder-gray-400'}`}
                                />
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className={`px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                            Cancel
                        </button>
                        {step === 1 ? (
                            <button
                                onClick={runPreview}
                                disabled={!canPreview}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}
                            >
                                <Eye size={14} /> Preview Result
                            </button>
                        ) : (
                            <button
                                onClick={confirmMerge}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${isDark ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}
                            >
                                <Check size={14} /> Confirm & Add Dataset
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Sub-components ─── */

const DatasetSelector = ({ label, datasets, selectedId, excludeId, onChange, isDark }) => {
    const ds = datasets.find(d => d.id === selectedId);
    return (
        <div className="space-y-2">
            <label className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</label>
            <select
                value={selectedId}
                onChange={e => onChange(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}
            >
                <option value="">Select dataset…</option>
                {datasets.filter(d => d.id !== excludeId).map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.data.length} rows)</option>
                ))}
            </select>
            {ds && (
                <div className={`flex flex-wrap gap-1.5 mt-2`}>
                    {ds.columns.slice(0, 8).map(c => {
                        const meta = TYPE_META[c.type] || TYPE_META.string;
                        const Icon = meta.icon;
                        return (
                            <span key={c.name} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${isDark ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                <Icon size={9} /> {c.name}
                            </span>
                        );
                    })}
                    {ds.columns.length > 8 && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                            +{ds.columns.length - 8} more
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

const ColumnList = ({ columns, label, isDark }) => (
    <div className={`p-4 rounded-xl border space-y-2 ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-2 mb-3">
            <Database size={12} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
            <span className={`text-[10px] font-bold uppercase tracking-widest truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
            <span className={`ml-auto text-[9px] font-bold ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{columns.length} cols</span>
        </div>
        {columns.map(c => {
            const meta = TYPE_META[c.type] || TYPE_META.string;
            const Icon = meta.icon;
            return (
                <div key={c.name} className={`flex items-center gap-2 py-1 px-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                    <span className={`p-0.5 rounded bg-${meta.color}-100 dark:bg-${meta.color}-900/30 text-${meta.color}-600 dark:text-${meta.color}-400`}>
                        <Icon size={10} />
                    </span>
                    <span className={`text-[11px] font-semibold truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{c.name}</span>
                </div>
            );
        })}
    </div>
);

export default DataMerger;
