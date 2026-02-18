
import React, { useState, useMemo, useEffect } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Visualization from './components/Visualization';
import DataSourceView from './components/DataSourceView';
import DataPanel from './components/DataPanel';
import DataPreview from './components/DataPreview';
import DataMerger from './components/DataMerger';
import {
    Plus,
    BarChart as BarChartIcon,
    Database,
    Save,
    Trash2,
    Eye,
    Settings,
    X,
    PlusCircle
} from 'lucide-react';
import { ChartType } from './types';
import { useTheme } from './contexts/ThemeContext';
import { recommendCharts } from './services/chartRecommender';

const ResponsiveGridLayout = WidthProvider(Responsive);
const STORAGE_KEY_CHARTS = 'power_bi_v3_charts_restored';
const STORAGE_KEY_PAGES = 'power_bi_v3_pages_restored';
const COMPANY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

const App = () => {
    const { theme } = useTheme();
    const [view, setView] = useState('data');
    const [isEditMode, setIsEditMode] = useState(true);
    const [datasets, setDatasets] = useState([]);
    const [pages, setPages] = useState([]);
    const [activePageId, setActivePageId] = useState('');
    const [charts, setCharts] = useState([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState('');
    const [activeChartId, setActiveChartId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showNewChartPrompt, setShowNewChartPrompt] = useState(false);
    const [previewDatasetId, setPreviewDatasetId] = useState(null);
    const [showMerger, setShowMerger] = useState(false);
    const [companies, setCompanies] = useState([]);
    const [activeCompanyId, setActiveCompanyId] = useState('__all__');

    useEffect(() => {
        const firstPageId = 'page-1';
        setPages([{ id: firstPageId, name: 'Page 1' }]);
        setActivePageId(firstPageId);
    }, []);

    const handleSaveDashboard = () => {
        setIsSaving(true);
        localStorage.setItem(STORAGE_KEY_CHARTS, JSON.stringify(charts));
        localStorage.setItem(STORAGE_KEY_PAGES, JSON.stringify(pages));
        setTimeout(() => setIsSaving(false), 800);
    };

    const handleAddPage = () => {
        const newPage = { id: `page-${Date.now()}`, name: `Page ${pages.length + 1}` };
        setPages([...pages, newPage]);
        setActivePageId(newPage.id);
    };

    const handleRemovePage = (e, id) => {
        e.stopPropagation();
        if (pages.length <= 1) return;
        const updatedPages = pages.filter(p => p.id !== id);
        setPages(updatedPages);
        setCharts(charts.filter(c => c.pageId !== id));
        if (activePageId === id) setActivePageId(updatedPages[0].id);
    };

    const handleAddChart = () => {
        const dataset = datasets.find(d => d.id === selectedDatasetId) || datasets[0];
        if (!dataset || !activePageId) return;
        setShowNewChartPrompt(true);
    };

    const handleConfirmNewChart = (name) => {
        setShowNewChartPrompt(false);
        const dataset = datasets.find(d => d.id === selectedDatasetId) || datasets[0];
        if (!dataset || !activePageId) return;

        const dim = dataset.columns.find(c => c.type === 'string')?.name || '';
        const measure = dataset.columns.find(c => c.type === 'number')?.name || '';

        const recs = recommendCharts(dataset.columns, dim, [measure]);
        const bestType = recs.length > 0 ? recs[0].type : ChartType.BAR_CLUSTERED;

        const newChart = {
            id: Math.random().toString(36).substr(2, 9),
            pageId: activePageId,
            datasetId: dataset.id,
            title: name.trim() || 'New Visual',
            type: bestType,
            dimension: dim,
            measures: [measure],
            aggregation: 'SUM',
            layout: { x: 0, y: Infinity, w: 6, h: 8 },
            filters: []
        };
        setCharts([...charts, newChart]);
        setActiveChartId(newChart.id);
        if (view !== 'report') setView('report');
    };

    const handleRemoveChart = (id) => {
        setCharts(prev => prev.filter(c => c.id !== id));
        if (activeChartId === id) setActiveChartId(null);
    };

    const handleAddCompany = (name, color) => {
        const newCompany = {
            id: Math.random().toString(36).substr(2, 9),
            name: name.trim(),
            color: color || COMPANY_COLORS[companies.length % COMPANY_COLORS.length],
            createdAt: Date.now(),
        };
        setCompanies(prev => [...prev, newCompany]);
        setActiveCompanyId(newCompany.id);
        return newCompany;
    };

    const handleRemoveCompany = (companyId) => {
        setCompanies(prev => prev.filter(c => c.id !== companyId));
        // Unassign datasets from removed company
        setDatasets(prev => prev.map(d => d.companyId === companyId ? { ...d, companyId: null } : d));
        if (activeCompanyId === companyId) setActiveCompanyId('__all__');
    };

    const handleRenameCompany = (companyId, newName) => {
        setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, name: newName.trim() } : c));
    };

    const handleAssignDatasetCompany = (datasetId, companyId) => {
        setDatasets(prev => prev.map(d => d.id === datasetId ? { ...d, companyId } : d));
    };

    const onLayoutChange = (currentLayout) => {
        setCharts(prev => prev.map(chart => {
            const gridItem = currentLayout.find(item => item.i === chart.id);
            if (gridItem && chart.pageId === activePageId) {
                return { ...chart, layout: { x: gridItem.x, y: gridItem.y, w: gridItem.w, h: gridItem.h } };
            }
            return chart;
        }));
    };

    const currentPageCharts = useMemo(() => charts.filter(c => c.pageId === activePageId), [charts, activePageId]);
    const gridLayouts = useMemo(() => currentPageCharts.map(c => ({ i: c.id, ...c.layout })), [currentPageCharts]);

    return (
        <div className={`flex flex-col h-screen overflow-hidden font-jakarta ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-800'}`}>
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar setView={setView} currentView={view} />
                <main className={`flex-1 flex flex-col min-w-0 overflow-hidden ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    {view === 'data' ? (
                        <DataSourceView
                            datasets={datasets}
                            companies={companies}
                            activeCompanyId={activeCompanyId}
                            onSetActiveCompany={setActiveCompanyId}
                            onAddCompany={handleAddCompany}
                            onRemoveCompany={handleRemoveCompany}
                            onRenameCompany={handleRenameCompany}
                            onAssignDatasetCompany={handleAssignDatasetCompany}
                            onAddDataset={ds => { setDatasets(p => [...p, ds]); setSelectedDatasetId(ds.id); }}
                            onRemoveDataset={id => setDatasets(p => p.filter(d => d.id !== id))}
                            onPreviewDataset={id => setPreviewDatasetId(id)}
                            onOpenMerge={() => setShowMerger(true)}
                        />
                    ) : view === 'merge' ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-10">
                            {datasets.length >= 2 ? (
                                <div className="text-center space-y-6">
                                    <div className={`inline-flex p-5 rounded-2xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white shadow-sm border border-gray-200'}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}><path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"/><path d="m20 22-5-5"/></svg>
                                    </div>
                                    <div>
                                        <h2 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>Merge Datasets</h2>
                                        <p className={`mt-2 max-w-md mx-auto ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Combine multiple data sources using joins or unions to create powerful cross-dataset visualizations.</p>
                                    </div>
                                    <button onClick={() => setShowMerger(true)} className={`inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-sm ${theme === 'dark' ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}>
                                        Open Merge Builder
                                    </button>
                                    <div className={`pt-4 text-xs font-semibold ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                                        {datasets.length} datasets available · {datasets.filter(d => d._meta?.merged).length} merged
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center space-y-4">
                                    <p className={`text-lg font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Upload at least 2 datasets to start merging.</p>
                                    <button onClick={() => setView('data')} className={`px-4 py-2 rounded-xl text-sm font-semibold ${theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>Go to Data Hub</button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className={`px-6 py-4 flex items-center justify-between shrink-0 z-20 border-b ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                <div className="flex flex-col">
                                    <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <Database size={12} />
                                        <span>Report</span>
                                    </div>
                                    <h1 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{isEditMode ? 'Visual Designer' : 'Report Preview'}</h1>
                                </div>
                                <div className="flex items-center gap-2">
                                    {datasets.length > 1 && (
                                        <select
                                            value={selectedDatasetId}
                                            onChange={(e) => setSelectedDatasetId(e.target.value)}
                                            className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-all cursor-pointer focus:outline-none ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 shadow-sm hover:bg-gray-50'}`}
                                        >
                                            {datasets.map(ds => (
                                                <option key={ds.id} value={ds.id}>{ds.name}</option>
                                            ))}
                                        </select>
                                    )}
                                    {datasets.length === 1 && (
                                        <span className={`px-3 py-2 rounded-lg text-sm font-semibold border ${theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                            <Database size={14} className="inline mr-1.5 -mt-0.5" />{datasets[0].name}
                                        </span>
                                    )}
                                    <button onClick={() => setIsEditMode(!isEditMode)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${isEditMode ? (theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 shadow-sm hover:bg-gray-50') : (theme === 'dark' ? 'bg-gray-200 text-gray-800 border-transparent' : 'bg-gray-800 text-white border-transparent hover:bg-gray-900 shadow-sm')}`}>
                                        {isEditMode ? <Eye size={16} /> : <Settings size={16} />}
                                        <span>{isEditMode ? 'Preview' : 'Edit Mode'}</span>
                                    </button>
                                    <button onClick={handleSaveDashboard} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all shadow-sm ${isSaving ? (theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-600 border-gray-200') : (theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}`}>
                                        <Save size={16} className={isSaving ? 'animate-pulse' : ''} />
                                        <span>{isSaving ? 'Saving...' : 'Save Layout'}</span>
                                    </button>
                                    <button onClick={handleAddChart} disabled={datasets.length === 0} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}>
                                        <Plus size={16} />
                                        <span>Add Visual</span>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 flex overflow-hidden p-6 gap-6">
                                <div className={`flex-1 overflow-y-auto designer-scroll-container rounded-xl border relative transition-all duration-300 ${isEditMode ? `designer-canvas ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} shadow-inner` : `${theme === 'dark' ? 'bg-gray-800 border-transparent' : 'bg-white border-transparent'}`}`}>
                                    <ResponsiveGridLayout className="layout" layouts={{ lg: gridLayouts }} breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }} cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }} rowHeight={40} draggableHandle=".drag-handle" onLayoutChange={onLayoutChange} isDraggable={isEditMode} isResizable={isEditMode} margin={[16, 16]}>
                                        {currentPageCharts.map(config => (
                                            <div key={config.id} onClick={() => isEditMode && setActiveChartId(config.id)}>
                                                <div className={`h-full w-full relative group transition-all ${activeChartId === config.id && isEditMode ? 'ring-2 ring-gray-500 dark:ring-gray-400 rounded-lg z-10' : ''}`}>
                                                    <Visualization config={config} dataset={datasets.find(d => d.id === config.datasetId)} isActive={activeChartId === config.id && isEditMode} isEditMode={isEditMode} />
                                                    {activeChartId === config.id && isEditMode && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveChart(config.id); }} className={`absolute -top-2.5 -right-2.5 text-rose-500 p-1.5 rounded-full shadow-md border hover:bg-rose-500 hover:text-white transition-all z-20 ${theme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </ResponsiveGridLayout>
                                    {currentPageCharts.length === 0 && <div className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}><BarChartIcon size={48} className="opacity-20 mb-4" /><p className="text-sm font-medium">Add visuals to start your report.</p></div>}
                                </div>

                                <DataPanel datasets={datasets} selectedDatasetId={selectedDatasetId} setSelectedDatasetId={setSelectedDatasetId} activeChartConfig={charts.find(c => c.id === activeChartId) || null} onUpdateConfig={(updates) => { if (activeChartId) setCharts(p => p.map(c => c.id === activeChartId ? { ...c, ...updates } : c)); }} onUpdateLayout={(updates) => { if (activeChartId) setCharts(p => p.map(c => c.id === activeChartId ? { ...c, layout: { ...c.layout, ...updates } } : c)); }} chartsCount={charts.length} showNewChartPrompt={showNewChartPrompt} onConfirmNewChart={handleConfirmNewChart} onCancelNewChart={() => setShowNewChartPrompt(false)} />
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* DataPreview Modal */}
            {previewDatasetId && (
                <DataPreview
                    dataset={datasets.find(d => d.id === previewDatasetId)}
                    onClose={() => setPreviewDatasetId(null)}
                    onUpdateDataset={(updated) => {
                        setDatasets(p => p.map(d => d.id === updated.id ? updated : d));
                    }}
                />
            )}

            {/* DataMerger Modal */}
            {showMerger && datasets.length >= 2 && (
                <DataMerger
                    datasets={datasets}
                    onClose={() => setShowMerger(false)}
                    onMergeComplete={(mergedDs) => {
                        setDatasets(p => [...p, mergedDs]);
                        setSelectedDatasetId(mergedDs.id);
                        setShowMerger(false);
                    }}
                />
            )}

            <footer className={`h-10 border-t px-6 flex items-center justify-between shrink-0 z-40 text-xs ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-1">
                    {pages.map((p) => (
                        <div key={p.id} className="group relative flex items-center">
                            <button onClick={() => { setActivePageId(p.id); setView('report'); }} className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-2 ${activePageId === p.id ? (theme === 'dark' ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900') : (theme === 'dark' ? 'text-gray-500 hover:bg-gray-700 hover:text-gray-300' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700')}`}>
                                <span>{p.name}</span>
                                {pages.length > 1 && <span onClick={(e) => handleRemovePage(e, p.id)} className={`ml-1 hover:text-rose-500 transition-colors ${activePageId === p.id ? 'opacity-100' : 'hidden group-hover:block'}`}><X size={12} /></span>}
                            </button>
                        </div>
                    ))}
                    <button onClick={handleAddPage} className={`p-1.5 ml-1 rounded-md transition-colors ${theme === 'dark' ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}><PlusCircle size={14} /></button>
                </div>
                <div className={`flex items-center gap-4 font-semibold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                    <span>{currentPageCharts.length} Objects</span>
                    <div className={`h-3 w-[1px] ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>TabNLP v1.0</span>
                </div>
            </footer>
        </div>
    );
};

export default App;
