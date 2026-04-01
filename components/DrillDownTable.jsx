import React, { useEffect, useMemo, useState } from 'react';
import { backendApi } from '../services/backendApi';
import { TYPO } from '../styles/typography';

const buildQueryPayload = ({ datasetId, columns, filters, limit = 500 }) => ({
    datasetId,
    chartType: 'TABLE',
    dimensions: columns,
    measures: [],
    filters,
    sort: { field: columns[0] || 'Count', order: 'desc' },
    limit,
});


const DrillDownTable = ({ open, datasetId, columns = [], filters = [], title = 'Drill Down', onClose }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState('');

    const tableColumns = useMemo(() => (Array.isArray(columns) ? columns : []).filter(Boolean), [columns]);

    const handleDownload = async () => {
        if (!datasetId || tableColumns.length === 0) return;
        setDownloading(true);
        try {
            const payload = buildQueryPayload({ datasetId, columns: tableColumns, filters, limit: 10000 });
            const blob = await backendApi.exportQuery(payload);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${String(title || 'drill-down').replace(/\s+/g, '_')}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } finally {
            setDownloading(false);
        }
    };

    useEffect(() => {
        let cancelled = false;

        const fetchRows = async () => {
            if (!open || !datasetId || tableColumns.length === 0) return;
            setLoading(true);
            setError('');
            try {
                const payload = buildQueryPayload({ datasetId, columns: tableColumns, filters });
                const response = await backendApi.runQuery(payload);
                if (!cancelled) {
                    setRows(Array.isArray(response?.rows) ? response.rows : []);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err?.message || 'Unable to load drill-down data');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchRows();
        return () => { cancelled = true; };
    }, [open, datasetId, tableColumns, filters]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                    <div>
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100" style={{ fontFamily: TYPO.fontFamily }}>{title}</h3>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">Rows: {rows.length}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-200 disabled:opacity-60"
                        >
                            {downloading ? 'Downloading…' : 'Download Excel'}
                        </button>
                        <button onClick={onClose} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-200">
                            Close
                        </button>
                    </div>
            </div>
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6 text-xs text-gray-500">Loading...</div>
                ) : error ? (
                    <div className="p-6 text-xs text-rose-500">{error}</div>
                ) : (
                    <table className="min-w-full text-xs">
                        <thead className="sticky top-0 bg-white dark:bg-gray-900">
                            <tr>
                                {tableColumns.map((col) => (
                                    <th key={col} className="text-left px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, idx) => (
                                <tr key={idx} className="border-b border-gray-100 dark:border-gray-800">
                                    {tableColumns.map((col, cIdx) => (
                                        <td key={`${idx}-${cIdx}`} className="px-4 py-2 text-gray-700 dark:text-gray-200">
                                            {Array.isArray(row)
                                                ? String(row[cIdx] ?? '')
                                                : String(row?.[col] ?? '')}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default DrillDownTable;
