
import React, { useRef, useState } from 'react';
import { Upload, FileText, Trash2, Database, Table, CheckCircle2 } from 'lucide-react';

const DataSourceView = ({ datasets, onAddDataset, onRemoveDataset }) => {
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);

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
                    data
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

    return (
        <div className="p-10 space-y-10 max-w-6xl mx-auto min-h-full">
            <div className="flex justify-between items-end">
                <div className="space-y-2">
                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 w-fit px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em]">
                        <Database size={12} />
                        Data Hub
                    </div>
                    <h2 className="text-4xl font-black text-gray-900 dark:text-gray-100 tracking-tight">External Sources</h2>
                    <p className="text-gray-500 dark:text-gray-400 max-w-lg">Manage your business data. Upload CSV files to create new visuals and unlock real-time dashboard insights.</p>
                </div>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-3 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 px-8 py-4 rounded-2xl font-bold hover:bg-gray-900 dark:hover:bg-gray-300 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                    {isUploading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 dark:border-gray-800/30 border-t-white dark:border-t-gray-800" />
                    ) : (
                        <Upload size={20} />
                    )}
                    <span>{isUploading ? 'Processing...' : 'Add New CSV'}</span>
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".csv"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {datasets.length === 0 ? (
                    <div className="col-span-full border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-2xl p-32 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 bg-white/40 dark:bg-gray-800/40">
                        <div className="bg-white dark:bg-gray-700 p-6 rounded-2xl shadow-sm mb-6">
                            <Database size={48} className="text-gray-400 dark:text-gray-500 opacity-40" />
                        </div>
                        <p className="text-lg font-bold text-gray-600 dark:text-gray-300">No data connected</p>
                        <p className="text-sm opacity-60 mt-2">Connect a source to begin your report analysis.</p>
                    </div>
                ) : (
                    datasets.map(ds => (
                        <div key={ds.id} className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm group hover:shadow-xl transition-all duration-500 hover:-translate-y-1 flex flex-col h-full">
                            <div className="flex justify-between items-start mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl group-hover:scale-110 transition-transform">
                                        <FileText size={28} />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-gray-800 dark:text-gray-200 tracking-tight text-lg truncate max-w-[160px]">{ds.name}</h4>
                                        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mt-1">
                                            <CheckCircle2 size={12} className="text-emerald-500" />
                                            <span>{ds.data.length} Records</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onRemoveDataset(ds.id)}
                                    className="p-2.5 text-gray-300 dark:text-gray-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                                    title="Remove Source"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </div>

                            <div className="flex-1">
                                <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Table size={12} />
                                    Column Dictionary
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {ds.columns.map(col => (
                                        <div key={col.name} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 px-4 py-2 rounded-full hover:bg-white dark:hover:bg-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors">
                                            <span className={`w-2 h-2 rounded-full ${col.type === 'number' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                                            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">{col.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex justify-between text-[10px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-[0.2em]">
                                    <span>Source: CSV</span>
                                    <span>Ready for Design</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default DataSourceView;
