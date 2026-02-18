
import React, { useRef, useState, useMemo } from 'react';
import {
    Upload, FileText, Trash2, Database, Table, CheckCircle2, Eye, Merge,
    Building2, Plus, X, Edit3, Check, ChevronDown, Tag, Search, FolderOpen
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1'];

const DataSourceView = ({
    datasets,
    companies,
    activeCompanyId,
    onSetActiveCompany,
    onAddCompany,
    onRemoveCompany,
    onRenameCompany,
    onAssignDatasetCompany,
    onAddDataset,
    onRemoveDataset,
    onPreviewDataset,
    onOpenMerge,
}) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);

    // Company management
    const [showAddCompany, setShowAddCompany] = useState(false);
    const [newCompanyName, setNewCompanyName] = useState('');
    const [newCompanyColor, setNewCompanyColor] = useState(PRESET_COLORS[0]);
    const [editingCompanyId, setEditingCompanyId] = useState(null);
    const [editCompanyName, setEditCompanyName] = useState('');

    // Dataset assignment dropdown
    const [assigningDatasetId, setAssigningDatasetId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Filtered datasets by active company
    const filteredDatasets = useMemo(() => {
        let result = datasets;
        if (activeCompanyId !== '__all__') {
            if (activeCompanyId === '__unassigned__') {
                result = datasets.filter(d => !d.companyId);
            } else {
                result = datasets.filter(d => d.companyId === activeCompanyId);
            }
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(d =>
                d.name.toLowerCase().includes(q) ||
                d.columns.some(c => c.name.toLowerCase().includes(q))
            );
        }
        return result;
    }, [datasets, activeCompanyId, searchQuery]);

    const getCompanyForDataset = (ds) => companies.find(c => c.id === ds.companyId);
    const unassignedCount = datasets.filter(d => !d.companyId).length;

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result;
                const rows = text.split('\n').map(row => row.trim()).filter(row => row !== '');

                if (rows.length < 1) throw new Error("Empty file");

                const headers = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                const data = rows.slice(1).map(row => {
                    const values = row.split(',');
                    return headers.reduce((obj, header, i) => {
                        let val = values[i]?.trim().replace(/^"|"$/g, '');
                        obj[header] = isNaN(Number(val)) || val === "" ? val : Number(val);
                        return obj;
                    }, {});
                });

                const columns = headers.map(h => ({
                    name: h,
                    type: typeof data[0][h] === 'number' ? 'number' : 'string'
                }));

                onAddDataset({
                    id: Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    columns,
                    data,
                    companyId: activeCompanyId !== '__all__' && activeCompanyId !== '__unassigned__' ? activeCompanyId : null,
                });
            } catch (err) {
                alert("Failed to parse CSV. Please ensure it is a valid comma-separated file.");
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleCreateCompany = () => {
        if (!newCompanyName.trim()) return;
        onAddCompany(newCompanyName, newCompanyColor);
        setNewCompanyName('');
        setNewCompanyColor(PRESET_COLORS[(companies.length + 1) % PRESET_COLORS.length]);
        setShowAddCompany(false);
    };

    const handleCommitRename = (companyId) => {
        if (editCompanyName.trim()) {
            onRenameCompany(companyId, editCompanyName);
        }
        setEditingCompanyId(null);
        setEditCompanyName('');
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* ─── Top Header ─── */}
            <div className={`px-10 pt-10 pb-6 shrink-0`}>
                <div className="flex justify-between items-end">
                    <div className="space-y-2">
                        <div className={`flex items-center gap-3 w-fit px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-gray-300 bg-gray-700' : 'text-gray-600 bg-gray-100'}`}>
                            <Building2 size={12} />
                            Conglomerate Data Hub
                        </div>
                        <h2 className={`text-4xl font-black tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>External Sources</h2>
                        <p className={`max-w-lg ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Organize data by company. Upload CSV files, assign them to subsidiaries, and build cross-entity insights.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {datasets.length >= 2 && (
                            <button onClick={onOpenMerge} className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-bold border transition-all shadow-sm active:scale-95 ${isDark ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                                <Merge size={20} />
                                <span>Merge Datasets</span>
                            </button>
                        )}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 ${isDark ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}
                        >
                            {isUploading ? (
                                <div className={`animate-spin rounded-full h-5 w-5 border-2 border-t-transparent ${isDark ? 'border-gray-800' : 'border-white'}`} />
                            ) : (
                                <Upload size={20} />
                            )}
                            <span>{isUploading ? 'Processing...' : 'Add New CSV'}</span>
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv" />
                    </div>
                </div>
            </div>

            {/* ─── Company Tabs ─── */}
            <div className={`px-10 shrink-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-1 overflow-x-auto pb-0 -mb-px">
                    {/* All tab */}
                    <CompanyTab
                        active={activeCompanyId === '__all__'}
                        onClick={() => onSetActiveCompany('__all__')}
                        isDark={isDark}
                        label="All Sources"
                        count={datasets.length}
                        color={null}
                        icon={<Database size={13} />}
                    />

                    {/* Per-company tabs */}
                    {companies.map(company => {
                        const count = datasets.filter(d => d.companyId === company.id).length;
                        return editingCompanyId === company.id ? (
                            <div key={company.id} className={`flex items-center gap-1 px-3 py-2.5 border-b-2 ${isDark ? 'border-gray-400' : 'border-gray-800'}`}>
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: company.color }} />
                                <input
                                    autoFocus
                                    value={editCompanyName}
                                    onChange={e => setEditCompanyName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleCommitRename(company.id);
                                        if (e.key === 'Escape') setEditingCompanyId(null);
                                    }}
                                    className={`w-28 px-1.5 py-0.5 text-xs font-bold rounded border outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'}`}
                                />
                                <button onClick={() => handleCommitRename(company.id)} className="text-emerald-500 hover:text-emerald-600">
                                    <Check size={12} />
                                </button>
                            </div>
                        ) : (
                            <CompanyTab
                                key={company.id}
                                active={activeCompanyId === company.id}
                                onClick={() => onSetActiveCompany(company.id)}
                                isDark={isDark}
                                label={company.name}
                                count={count}
                                color={company.color}
                                onDoubleClick={() => { setEditingCompanyId(company.id); setEditCompanyName(company.name); }}
                                onRemove={(e) => { e.stopPropagation(); onRemoveCompany(company.id); }}
                            />
                        );
                    })}

                    {/* Unassigned tab */}
                    {unassignedCount > 0 && companies.length > 0 && (
                        <CompanyTab
                            active={activeCompanyId === '__unassigned__'}
                            onClick={() => onSetActiveCompany('__unassigned__')}
                            isDark={isDark}
                            label="Unassigned"
                            count={unassignedCount}
                            color={null}
                            icon={<FolderOpen size={13} />}
                            muted
                        />
                    )}

                    {/* Add company button */}
                    {showAddCompany ? (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ml-2 ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200 shadow-sm'}`}>
                            <div className="flex gap-1">
                                {PRESET_COLORS.slice(0, 6).map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setNewCompanyColor(c)}
                                        className={`w-4 h-4 rounded-full transition-all ${newCompanyColor === c ? 'ring-2 ring-offset-1 scale-110' : 'opacity-60 hover:opacity-100'}`}
                                        style={{ background: c }}
                                    />
                                ))}
                            </div>
                            <input
                                autoFocus
                                value={newCompanyName}
                                onChange={e => setNewCompanyName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleCreateCompany();
                                    if (e.key === 'Escape') { setShowAddCompany(false); setNewCompanyName(''); }
                                }}
                                placeholder="Company name…"
                                className={`w-36 px-2 py-1 text-xs font-semibold rounded-lg border outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400'}`}
                            />
                            <button onClick={handleCreateCompany} disabled={!newCompanyName.trim()} className="text-emerald-500 hover:text-emerald-600 disabled:opacity-30">
                                <Check size={14} />
                            </button>
                            <button onClick={() => { setShowAddCompany(false); setNewCompanyName(''); }} className={isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}>
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowAddCompany(true)}
                            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors rounded-t-lg ml-2 ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                        >
                            <Plus size={14} />
                            <span>Add Company</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ─── Search + Stats Bar ─── */}
            <div className={`px-10 py-4 flex items-center gap-4 shrink-0`}>
                <div className={`flex items-center gap-2 flex-1 max-w-md px-3 py-2 rounded-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <Search size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search datasets or columns..."
                        className={`flex-1 bg-transparent text-xs font-medium outline-none ${isDark ? 'text-gray-200 placeholder-gray-600' : 'text-gray-700 placeholder-gray-400'}`}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className={isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}>
                            <X size={12} />
                        </button>
                    )}
                </div>
                <div className={`flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                    <span>{filteredDatasets.length} dataset{filteredDatasets.length !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>{companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}</span>
                    <span>·</span>
                    <span>{datasets.reduce((sum, d) => sum + d.data.length, 0).toLocaleString()} total records</span>
                </div>
            </div>

            {/* ─── Dataset Cards ─── */}
            <div className="flex-1 overflow-y-auto px-10 pb-10">
                {filteredDatasets.length === 0 ? (
                    <div className={`border-2 border-dashed rounded-2xl p-32 flex flex-col items-center justify-center ${isDark ? 'border-gray-600 bg-gray-800/40 text-gray-500' : 'border-gray-200 bg-white/40 text-gray-400'}`}>
                        <div className={`p-6 rounded-2xl shadow-sm mb-6 ${isDark ? 'bg-gray-700' : 'bg-white'}`}>
                            <Database size={48} className="opacity-40" />
                        </div>
                        <p className={`text-lg font-bold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                            {datasets.length === 0 ? 'No data connected' : 'No datasets match'}
                        </p>
                        <p className="text-sm opacity-60 mt-2">
                            {datasets.length === 0
                                ? 'Add a company and upload CSV files to begin.'
                                : 'Try switching company tabs or clearing the search.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filteredDatasets.map(ds => {
                            const company = getCompanyForDataset(ds);
                            return (
                                <div key={ds.id} className={`p-8 rounded-2xl border shadow-sm group hover:shadow-xl transition-all duration-500 hover:-translate-y-1 flex flex-col h-full relative ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                    {/* Company color strip */}
                                    {company && (
                                        <div className="absolute top-0 left-6 right-6 h-1 rounded-b-full" style={{ background: company.color }} />
                                    )}

                                    {/* Header */}
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-4 rounded-xl group-hover:scale-110 transition-transform ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                                <FileText size={28} />
                                            </div>
                                            <div>
                                                <h4 className={`font-black tracking-tight text-lg truncate max-w-[160px] ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{ds.name}</h4>
                                                <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                    <CheckCircle2 size={12} className="text-emerald-500" />
                                                    <span>{ds.data.length} Records</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => onPreviewDataset && onPreviewDataset(ds.id)} className={`p-2.5 rounded-xl transition-all ${isDark ? 'text-gray-500 hover:text-blue-400 hover:bg-blue-900/20' : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50'}`} title="Preview Data">
                                                <Eye size={20} />
                                            </button>
                                            <button onClick={() => onRemoveDataset(ds.id)} className={`p-2.5 rounded-xl transition-all ${isDark ? 'text-gray-500 hover:text-rose-400 hover:bg-rose-900/20' : 'text-gray-300 hover:text-rose-500 hover:bg-rose-50'}`} title="Remove Source">
                                                <Trash2 size={20} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Company Assignment */}
                                    <div className="mb-5">
                                        {assigningDatasetId === ds.id ? (
                                            <div className={`p-3 rounded-xl border space-y-2 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                                                <p className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Assign to company</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    <button
                                                        onClick={() => { onAssignDatasetCompany(ds.id, null); setAssigningDatasetId(null); }}
                                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${!ds.companyId ? (isDark ? 'bg-gray-600 border-gray-500 text-gray-200' : 'bg-gray-200 border-gray-300 text-gray-700') : (isDark ? 'border-gray-600 text-gray-400 hover:border-gray-500' : 'border-gray-200 text-gray-500 hover:border-gray-300')}`}
                                                    >
                                                        None
                                                    </button>
                                                    {companies.map(c => (
                                                        <button
                                                            key={c.id}
                                                            onClick={() => { onAssignDatasetCompany(ds.id, c.id); setAssigningDatasetId(null); }}
                                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${ds.companyId === c.id ? (isDark ? 'bg-gray-600 border-gray-500 text-gray-200' : 'bg-gray-200 border-gray-300 text-gray-700') : (isDark ? 'border-gray-600 text-gray-400 hover:border-gray-500' : 'border-gray-200 text-gray-500 hover:border-gray-300')}`}
                                                        >
                                                            <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                                                            {c.name}
                                                        </button>
                                                    ))}
                                                </div>
                                                <button onClick={() => setAssigningDatasetId(null)} className={`text-[10px] font-semibold mt-1 ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>Done</button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setAssigningDatasetId(ds.id)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all w-fit ${company ? '' : (isDark ? 'border-dashed border-gray-600 text-gray-500 hover:border-gray-500' : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400')}`}
                                                style={company ? { borderColor: company.color + '40', background: company.color + '10', color: company.color } : {}}
                                            >
                                                {company ? (
                                                    <>
                                                        <span className="w-2 h-2 rounded-full" style={{ background: company.color }} />
                                                        {company.name}
                                                        <ChevronDown size={10} className="opacity-50" />
                                                    </>
                                                ) : (
                                                    <>
                                                        <Tag size={11} />
                                                        Assign Company
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>

                                    {/* Column Dictionary */}
                                    <div className="flex-1">
                                        <p className={`text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                            <Table size={12} />
                                            Column Dictionary
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {ds.columns.map(col => (
                                                <div key={col.name} className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${isDark ? 'bg-gray-700 border border-gray-600 hover:bg-gray-600 hover:border-gray-500' : 'bg-gray-50 border border-gray-100 hover:bg-white hover:border-gray-300'}`}>
                                                    <span className={`w-2 h-2 rounded-full ${col.type === 'number' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                                                    <span className={`text-[11px] font-bold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{col.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className={`mt-8 pt-6 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                                        <div className={`flex justify-between text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>
                                            <span>Source: {ds._meta?.merged ? 'Merged' : 'CSV'}</span>
                                            <span>Ready for Design</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

/* ─── Company Tab ─── */
const CompanyTab = ({ active, onClick, isDark, label, count, color, icon, onDoubleClick, onRemove, muted }) => (
    <button
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={`group relative flex items-center gap-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
            active
                ? (isDark ? 'text-gray-100 border-gray-300' : 'text-gray-900 border-gray-800')
                : (isDark
                    ? `text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-600 ${muted ? 'opacity-60' : ''}`
                    : `text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-300 ${muted ? 'opacity-60' : ''}`)
        }`}
    >
        {color ? (
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        ) : icon ? (
            <span className="shrink-0">{icon}</span>
        ) : null}
        <span>{label}</span>
        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
            active
                ? (isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600')
                : (isDark ? 'bg-gray-800 text-gray-600' : 'bg-gray-100 text-gray-400')
        }`}>
            {count}
        </span>
        {onRemove && (
            <span
                onClick={onRemove}
                className={`ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-rose-500 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}
                title="Remove company"
            >
                <X size={12} />
            </span>
        )}
    </button>
);

export default DataSourceView;
