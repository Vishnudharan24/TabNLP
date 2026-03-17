
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Visualization from './components/Visualization';
import DataSourceView from './components/DataSourceView';
import DataPanel from './components/DataPanel';
import DataPreview from './components/DataPreview';
import DataMerger from './components/DataMerger';
import DataProfiler from './components/DataProfiler';
import GlobalFilterBar from './components/GlobalFilterBar';
import RelationshipDiagram from './components/RelationshipDiagram';
import SourceConfigIngestionPage from './components/SourceConfigIngestionPage';
import {
    Plus,
    BarChart as BarChartIcon,
    Database,
    Save,
    Share2,
    FileText,
    Presentation,
    Trash2,
    Eye,
    Settings,
    X,
    PlusCircle
} from 'lucide-react';
import { ChartType } from './types';
import { useTheme } from './contexts/ThemeContext';
import { recommendCharts } from './services/chartRecommender';
import { backendApi } from './services/backendApi';

const ResponsiveGridLayout = WidthProvider(Responsive);
const STORAGE_KEY_CHARTS = 'power_bi_v3_charts_restored';
const STORAGE_KEY_PAGES = 'power_bi_v3_pages_restored';
const STORAGE_KEY_DATASETS = 'power_bi_v3_datasets_restored';
const STORAGE_KEY_COMPANIES = 'power_bi_v3_companies_restored';
const STORAGE_KEY_GLOBAL_FILTERS = 'power_bi_v3_global_filters_restored';
const STORAGE_KEY_ACTIVE_PAGE = 'power_bi_v3_active_page_restored';
const STORAGE_KEY_SELECTED_DATASET = 'power_bi_v3_selected_dataset_restored';
const STORAGE_KEY_ACTIVE_COMPANY = 'power_bi_v3_active_company_restored';
const STORAGE_KEY_VIEW = 'power_bi_v3_view_restored';
const STORAGE_KEY_BACKEND_SOURCE_IDS = 'power_bi_v3_backend_source_ids_restored';
const SHARE_QUERY_PARAM = 'reportShare';
const SHARE_SCHEMA_VERSION = 1;
const COMPANY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

const readStorageJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
};

const writeStorageJson = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.warn(`Failed to persist ${key}:`, error);
        return false;
    }
};

const encodeShareToken = (payload) => {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    bytes.forEach((b) => {
        binary += String.fromCharCode(b);
    });

    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
};

const decodeShareToken = (token) => {
    const normalized = token
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
};

const extractBackendSourceIds = (datasets = []) => (
    Array.from(new Set(
        datasets
            .filter(ds => ds?._meta?.backend)
            .map(ds => ds?._meta?.sourceId || ds?._meta?.sourceKey)
            .filter(Boolean)
    ))
);

const inferColumnType = (values = []) => {
    const sample = values.filter(v => v !== null && v !== undefined && v !== '').slice(0, 50);
    if (sample.length === 0) return 'string';

    const allNumbers = sample.every(v => typeof v === 'number' || (!Number.isNaN(Number(v)) && `${v}`.trim() !== ''));
    if (allNumbers) return 'number';

    const allDates = sample.every(v => !Number.isNaN(Date.parse(v)));
    if (allDates) return 'date';

    return 'string';
};

const mapBackendDatasetToAppDataset = (item) => {
    const rows = Array.isArray(item?.data) ? item.data : [];
    const detectedColumns = rows[0] ? Object.keys(rows[0]) : [];

    const columns = detectedColumns.map((name) => ({
        name,
        type: inferColumnType(rows.map(r => r?.[name])),
    }));

    return {
        id: item?.document_id || `${item?.source_key || item?.source_id || 'dataset'}::${item?.version ?? 'latest'}`,
        name: `${item?.source_id || item?.source_key || 'dataset'} (v${item?.version ?? 'latest'})`,
        columns,
        data: rows,
        companyId: null,
        _meta: {
            documentId: item?.document_id,
            version: item?.version,
            sourceId: item?.source_id,
            sourceKey: item?.source_key,
            ingestedAt: item?.ingested_at,
            metadata: item?.metadata || null,
            fileName: item?.metadata?.file_name || null,
            backend: true,
        },
    };
};

const App = () => {
    const { theme } = useTheme();
    const hasHydratedRef = useRef(false);
    const reportCanvasRef = useRef(null);
    const chartInstancesRef = useRef(new Map());
    const exportCacheRef = useRef({ key: '', createdAt: 0, items: [] });
    const activePageIdRef = useRef('');
    const [view, setView] = useState('data');
    const [isEditMode, setIsEditMode] = useState(true);
    const [datasets, setDatasets] = useState([]);
    const [pages, setPages] = useState([]);
    const [activePageId, setActivePageId] = useState('');
    const [charts, setCharts] = useState([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState('');
    const [activeChartId, setActiveChartId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [isPreparingExport, setIsPreparingExport] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isExportingPpt, setIsExportingPpt] = useState(false);
    const [exportScope, setExportScope] = useState('active');
    const [showNewChartPrompt, setShowNewChartPrompt] = useState(false);
    const [previewDatasetId, setPreviewDatasetId] = useState(null);
    const [showMerger, setShowMerger] = useState(false);
    const [companies, setCompanies] = useState([]);
    const [activeCompanyId, setActiveCompanyId] = useState('__all__');
    const [globalFilters, setGlobalFilters] = useState([]);
    const [profilerDatasetId, setProfilerDatasetId] = useState(null);

    useEffect(() => {
        const readSharedPayloadFromUrl = () => {
            try {
                const url = new URL(window.location.href);
                const sharedToken = url.searchParams.get(SHARE_QUERY_PARAM);
                if (!sharedToken) return null;
                const payload = decodeShareToken(sharedToken);
                if (!payload || payload.schemaVersion !== SHARE_SCHEMA_VERSION) return null;
                return payload;
            } catch {
                return null;
            }
        };

        const applySharedPayload = (payload) => {
            const sharedDatasets = Array.isArray(payload?.datasets) ? payload.datasets : [];
            const sharedPages = Array.isArray(payload?.pages) && payload.pages.length > 0
                ? payload.pages
                : [{ id: 'page-1', name: 'Page 1' }];
            const sharedCharts = Array.isArray(payload?.charts) ? payload.charts : [];
            const sharedGlobalFilters = Array.isArray(payload?.globalFilters) ? payload.globalFilters : [];

            setDatasets(sharedDatasets);
            setCompanies(Array.isArray(payload?.companies) ? payload.companies : []);
            setCharts(sharedCharts);
            setPages(sharedPages);
            setGlobalFilters(sharedGlobalFilters);
            setView('report');

            const fallbackPageId = sharedPages[0]?.id || 'page-1';
            const restoredPageId = payload?.activePageId;
            const hasSharedPage = restoredPageId && sharedPages.some(p => p.id === restoredPageId);
            setActivePageId(hasSharedPage ? restoredPageId : fallbackPageId);

            const restoredDatasetId = payload?.selectedDatasetId;
            const hasSharedDataset = restoredDatasetId && sharedDatasets.some(d => d.id === restoredDatasetId);
            if (hasSharedDataset) {
                setSelectedDatasetId(restoredDatasetId);
            } else if (sharedDatasets[0]?.id) {
                setSelectedDatasetId(sharedDatasets[0].id);
            }

            setActiveCompanyId('__all__');
            return true;
        };

        const sharedPayload = readSharedPayloadFromUrl();
        if (sharedPayload) {
            const sharedApplied = applySharedPayload(sharedPayload);
            hasHydratedRef.current = true;
            if (sharedApplied) return;
        }

        const restoredDatasets = readStorageJson(STORAGE_KEY_DATASETS, []);
        const restoredBackendSourceIds = readStorageJson(STORAGE_KEY_BACKEND_SOURCE_IDS, []);
        const restoredCompanies = readStorageJson(STORAGE_KEY_COMPANIES, []);
        const restoredCharts = readStorageJson(STORAGE_KEY_CHARTS, []);
        const restoredPages = readStorageJson(STORAGE_KEY_PAGES, []);
        const restoredGlobalFilters = readStorageJson(STORAGE_KEY_GLOBAL_FILTERS, []);
        const restoredActivePage = readStorageJson(STORAGE_KEY_ACTIVE_PAGE, null);
        const restoredSelectedDataset = readStorageJson(STORAGE_KEY_SELECTED_DATASET, null);
        const restoredActiveCompany = readStorageJson(STORAGE_KEY_ACTIVE_COMPANY, '__all__');
        const restoredView = readStorageJson(STORAGE_KEY_VIEW, 'data');

        setDatasets(Array.isArray(restoredDatasets) ? restoredDatasets : []);
        setCompanies(Array.isArray(restoredCompanies) ? restoredCompanies : []);
        setCharts(Array.isArray(restoredCharts) ? restoredCharts : []);
        setGlobalFilters(Array.isArray(restoredGlobalFilters) ? restoredGlobalFilters : []);
        setView(restoredView || 'data');
        setActiveCompanyId(restoredActiveCompany || '__all__');

        if (Array.isArray(restoredPages) && restoredPages.length > 0) {
            setPages(restoredPages);
            const hasRestoredActivePage = restoredActivePage && restoredPages.some(p => p.id === restoredActivePage);
            setActivePageId(hasRestoredActivePage ? restoredActivePage : restoredPages[0].id);
        } else {
            const firstPageId = 'page-1';
            setPages([{ id: firstPageId, name: 'Page 1' }]);
            setActivePageId(firstPageId);
        }

        if (restoredSelectedDataset && Array.isArray(restoredDatasets) && restoredDatasets.some(d => d.id === restoredSelectedDataset)) {
            setSelectedDatasetId(restoredSelectedDataset);
        } else if (Array.isArray(restoredDatasets) && restoredDatasets.length > 0) {
            setSelectedDatasetId(restoredDatasets[0].id);
        }

        hasHydratedRef.current = true;

        (async () => {
            try {
                const response = await backendApi.listDatasets(1000);
                const loaded = Array.isArray(response?.items)
                    ? response.items.map(mapBackendDatasetToAppDataset)
                    : [];

                if (loaded.length > 0) {
                    setDatasets(prev => {
                        const nonBackendDatasets = prev.filter(ds => !ds?._meta?.backend);
                        const existingById = new Map(prev.map(ds => [ds.id, ds]));

                        const backendDatasets = loaded.map(ds => {
                            const existing = existingById.get(ds.id);
                            return {
                                ...ds,
                                companyId: existing?.companyId ?? ds.companyId,
                            };
                        });

                        return [...nonBackendDatasets, ...backendDatasets];
                    });

                    return;
                }
            } catch (error) {
                console.error('Failed to load datasets from backend:', error);
            }

            if (Array.isArray(restoredBackendSourceIds) && restoredBackendSourceIds.length > 0) {
                const results = await Promise.allSettled(
                    restoredBackendSourceIds.map(sourceId => backendApi.getLatestDatasetBySourceId(sourceId))
                );

                const loaded = results
                    .filter(r => r.status === 'fulfilled' && r.value?.item)
                    .map(r => mapBackendDatasetToAppDataset(r.value.item));

                if (loaded.length === 0) return;

                setDatasets(prev => {
                    const map = new Map();
                    [...prev, ...loaded].forEach(ds => map.set(ds.id, ds));
                    return Array.from(map.values());
                });
            }
        })();
    }, []);

    useEffect(() => {
        if (!hasHydratedRef.current) return;

        const datasetSaved = writeStorageJson(STORAGE_KEY_DATASETS, datasets);
        if (!datasetSaved) {
            const fallbackDatasets = datasets.map(ds => ds?._meta?.backend
                ? { ...ds, data: [] }
                : ds
            );
            writeStorageJson(STORAGE_KEY_DATASETS, fallbackDatasets);
        }

        writeStorageJson(STORAGE_KEY_BACKEND_SOURCE_IDS, extractBackendSourceIds(datasets));
        writeStorageJson(STORAGE_KEY_COMPANIES, companies);
        writeStorageJson(STORAGE_KEY_CHARTS, charts);
        writeStorageJson(STORAGE_KEY_PAGES, pages);
        writeStorageJson(STORAGE_KEY_GLOBAL_FILTERS, globalFilters);
        writeStorageJson(STORAGE_KEY_ACTIVE_PAGE, activePageId);
        writeStorageJson(STORAGE_KEY_SELECTED_DATASET, selectedDatasetId);
        writeStorageJson(STORAGE_KEY_ACTIVE_COMPANY, activeCompanyId);
        writeStorageJson(STORAGE_KEY_VIEW, view);
    }, [
        datasets,
        companies,
        charts,
        pages,
        globalFilters,
        activePageId,
        selectedDatasetId,
        activeCompanyId,
        view,
    ]);

    useEffect(() => {
        if (selectedDatasetId) return;
        if (datasets.length === 0) return;
        setSelectedDatasetId(datasets[0].id);
    }, [datasets, selectedDatasetId]);

    useEffect(() => {
        activePageIdRef.current = activePageId;
    }, [activePageId]);

    const handleSaveDashboard = () => {
        setIsSaving(true);
        writeStorageJson(STORAGE_KEY_DATASETS, datasets);
        writeStorageJson(STORAGE_KEY_BACKEND_SOURCE_IDS, extractBackendSourceIds(datasets));
        writeStorageJson(STORAGE_KEY_COMPANIES, companies);
        writeStorageJson(STORAGE_KEY_CHARTS, charts);
        writeStorageJson(STORAGE_KEY_PAGES, pages);
        writeStorageJson(STORAGE_KEY_GLOBAL_FILTERS, globalFilters);
        writeStorageJson(STORAGE_KEY_ACTIVE_PAGE, activePageId);
        writeStorageJson(STORAGE_KEY_SELECTED_DATASET, selectedDatasetId);
        writeStorageJson(STORAGE_KEY_ACTIVE_COMPANY, activeCompanyId);
        writeStorageJson(STORAGE_KEY_VIEW, view);
        setTimeout(() => setIsSaving(false), 800);
    };

    const handleShareDashboard = async () => {
        if (isSharing) return;

        const shareDatasets = datasets.filter(ds => charts.some(chart => chart.datasetId === ds.id) || ds.id === selectedDatasetId);
        if (shareDatasets.length === 0 || charts.length === 0) {
            window.alert('Add at least one visual before creating a share link.');
            return;
        }

        setIsSharing(true);
        try {
            const payload = {
                schemaVersion: SHARE_SCHEMA_VERSION,
                createdAt: new Date().toISOString(),
                view: 'report',
                pages,
                charts,
                datasets: shareDatasets,
                companies,
                globalFilters,
                activePageId,
                selectedDatasetId,
            };

            const token = encodeShareToken(payload);
            const shareUrl = new URL(window.location.href);
            shareUrl.searchParams.set(SHARE_QUERY_PARAM, token);
            shareUrl.searchParams.delete('reportShareCopied');
            const finalUrl = shareUrl.toString();

            if (finalUrl.length > 180000) {
                window.alert('This dashboard is too large to share via URL. Reduce dataset size or use backend sharing.');
                return;
            }

            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(finalUrl);
                window.alert('Share link copied to clipboard.');
                return;
            }

            window.prompt('Copy your dashboard share link:', finalUrl);
        } catch (error) {
            console.error('Failed to create share link:', error);
            window.alert('Unable to generate a share link right now. Please try again.');
        } finally {
            setIsSharing(false);
        }
    };

    const getCurrentVisualElementsForExport = () => {
        const container = reportCanvasRef.current;
        if (!container) return [];
        const nodes = container.querySelectorAll('[data-export-visual="true"]');
        return Array.from(nodes).map((node) => ({
            element: node,
            chartId: node.getAttribute('data-export-chart-id') || '',
            title: node.getAttribute('data-export-title') || 'Visual',
        }));
    };

    const waitForRenderStabilization = async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 80));
    };

    const buildFileSafeName = (baseName, extension) => {
        const cleaned = (baseName || 'report')
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/g, '-')
            .replace(/-{2,}/g, '-')
            .replace(/^-+|-+$/g, '');
        return `${cleaned || 'report'}.${extension}`;
    };

    const captureVisualAsCanvas = async (element) => {
        return html2canvas(element, {
            scale: 2,
            useCORS: true,
            backgroundColor: theme === 'dark' ? '#111827' : '#ffffff',
        });
    };

    const getVisualImageData = async (target) => {
        const instance = chartInstancesRef.current.get(target.chartId);
        if (instance && typeof instance.getDataURL === 'function') {
            const imageData = instance.getDataURL({
                type: 'png',
                pixelRatio: 3,
                backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                excludeComponents: ['toolbox'],
            });
            const width = instance.getWidth ? instance.getWidth() : target.element.clientWidth;
            const height = instance.getHeight ? instance.getHeight() : target.element.clientHeight;
            return { imageData, width, height };
        }

        const canvas = await captureVisualAsCanvas(target.element);
        return {
            imageData: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
        };
    };

    const handleChartInstanceChange = (chartId, instance) => {
        if (!chartId) return;
        if (!instance) {
            chartInstancesRef.current.delete(chartId);
            return;
        }
        chartInstancesRef.current.set(chartId, instance);
    };

    const runWithConcurrency = async (items, limit, worker) => {
        const results = new Array(items.length);
        let currentIndex = 0;

        const runNext = async () => {
            while (true) {
                const index = currentIndex;
                currentIndex += 1;
                if (index >= items.length) return;
                results[index] = await worker(items[index], index);
            }
        };

        const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
        await Promise.all(workers);
        return results;
    };

    const buildExportCacheKey = (scope) => {
        const scopePageIds = scope === 'all' ? pages.map(p => p.id).join('|') : activePageIdRef.current;
        const scopeChartIds = charts
            .filter(c => scope === 'all' || c.pageId === activePageIdRef.current)
            .map(c => `${c.id}:${c.pageId}:${c.title || ''}`)
            .join('|');
        return `${scope}:${scopePageIds}:${scopeChartIds}:${theme}`;
    };

    const prepareExportImages = async (scope) => {
        const cacheKey = buildExportCacheKey(scope);
        const isCacheFresh = Date.now() - exportCacheRef.current.createdAt < 20000;
        if (isCacheFresh && exportCacheRef.current.key === cacheKey && exportCacheRef.current.items.length > 0) {
            return exportCacheRef.current.items;
        }

        const originalPageId = activePageIdRef.current;
        const pageIds = scope === 'all' ? pages.map(p => p.id) : [originalPageId];
        const captured = [];

        for (const pageId of pageIds) {
            if (activePageIdRef.current !== pageId) {
                setActivePageId(pageId);
                await waitForRenderStabilization();
            }

            const pageName = pages.find(p => p.id === pageId)?.name || 'Report';
            const targets = getCurrentVisualElementsForExport();
            if (targets.length === 0) continue;

            const pageCaptures = await runWithConcurrency(targets, 3, async (target, index) => {
                const image = await getVisualImageData(target);
                return {
                    ...image,
                    chartId: target.chartId,
                    title: target.title || `Visual ${index + 1}`,
                    pageId,
                    pageName,
                };
            });

            captured.push(...pageCaptures);
        }

        if (activePageIdRef.current !== originalPageId) {
            setActivePageId(originalPageId);
            await waitForRenderStabilization();
        }

        exportCacheRef.current = { key: cacheKey, createdAt: Date.now(), items: captured };
        return captured;
    };

    const handleExportPdf = async () => {
        if (isExportingPdf || isExportingPpt || isPreparingExport) return;

        setIsPreparingExport(true);
        setIsExportingPdf(true);
        try {
            const exportImages = await prepareExportImages(exportScope);
            if (exportImages.length === 0) return;

            const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 24;

            for (let i = 0; i < exportImages.length; i += 1) {
                const target = exportImages[i];
                const title = exportScope === 'all' ? `${target.pageName} • ${target.title}` : target.title;
                const { imageData, width, height } = target;

                if (i > 0) doc.addPage();

                doc.setFontSize(14);
                doc.text(title, margin, margin + 4);

                const maxWidth = pageWidth - margin * 2;
                const maxHeight = pageHeight - margin * 2 - 24;
                const widthRatio = maxWidth / width;
                const heightRatio = maxHeight / height;
                const ratio = Math.min(widthRatio, heightRatio);

                const imgWidth = width * ratio;
                const imgHeight = height * ratio;
                const x = (pageWidth - imgWidth) / 2;
                const y = margin + 24 + (maxHeight - imgHeight) / 2;

                doc.addImage(imageData, 'PNG', x, y, imgWidth, imgHeight);
            }

            const fileBase = exportScope === 'all'
                ? 'all-pages-visuals'
                : `${pages.find(p => p.id === activePageIdRef.current)?.name || 'report'}-visuals`;
            doc.save(buildFileSafeName(fileBase, 'pdf'));
        } catch (error) {
            console.error('Failed to export PDF:', error);
            window.alert('Unable to export PDF right now. Please try again.');
        } finally {
            setIsPreparingExport(false);
            setIsExportingPdf(false);
        }
    };

    const handleExportPpt = async () => {
        if (isExportingPpt || isExportingPdf || isPreparingExport) return;

        setIsPreparingExport(true);
        setIsExportingPpt(true);
        try {
            const exportImages = await prepareExportImages(exportScope);
            if (exportImages.length === 0) return;

            const pptx = new PptxGenJS();
            pptx.layout = 'LAYOUT_WIDE';
            pptx.author = 'TabNLP';
            pptx.subject = 'Report visuals';
            pptx.title = exportScope === 'all'
                ? 'All pages visuals'
                : `${pages.find(p => p.id === activePageIdRef.current)?.name || 'Report'} visuals`;

            for (let i = 0; i < exportImages.length; i += 1) {
                const target = exportImages[i];
                const title = exportScope === 'all' ? `${target.pageName} • ${target.title}` : target.title;
                const { imageData } = target;

                const slide = pptx.addSlide();
                slide.addText(title, {
                    x: 0.4,
                    y: 0.2,
                    w: 12.5,
                    h: 0.4,
                    fontSize: 16,
                    bold: true,
                    color: theme === 'dark' ? 'FFFFFF' : '1F2937',
                });

                slide.addImage({
                    data: imageData,
                    x: 0.4,
                    y: 0.8,
                    w: 12.5,
                    h: 6.0,
                    sizing: {
                        type: 'contain',
                        x: 0.4,
                        y: 0.8,
                        w: 12.5,
                        h: 6.0,
                    },
                });
            }

            const fileBase = exportScope === 'all'
                ? 'all-pages-visuals'
                : `${pages.find(p => p.id === activePageIdRef.current)?.name || 'report'}-visuals`;
            await pptx.writeFile({ fileName: buildFileSafeName(fileBase, 'pptx') });
        } catch (error) {
            console.error('Failed to export PPT:', error);
            window.alert('Unable to export PPT right now. Please try again.');
        } finally {
            setIsPreparingExport(false);
            setIsExportingPpt(false);
        }
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

    // Global filter handlers
    const handleAddGlobalFilter = (filter) => {
        setGlobalFilters(prev => [...prev, filter]);
    };
    const handleUpdateGlobalFilter = (id, updates) => {
        setGlobalFilters(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };
    const handleRemoveGlobalFilter = (id) => {
        setGlobalFilters(prev => prev.filter(f => f.id !== id));
    };
    const handleClearGlobalFilters = () => {
        setGlobalFilters([]);
    };

    // Chart group ID for cross-chart brushing (per page)
    const chartGroupId = `page-${activePageId}`;

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
    const exportableVisualCount = useMemo(() => {
        if (exportScope === 'all') return charts.length;
        return currentPageCharts.length;
    }, [exportScope, charts.length, currentPageCharts.length]);

    const handleBackendIngestionSuccess = async (ingestionResult) => {
        const sourceId = ingestionResult?.source_id;
        if (!sourceId) return;

        try {
            const latest = await backendApi.getLatestDatasetBySourceId(sourceId);
            const item = latest?.item;
            if (!item) return;

            const mapped = mapBackendDatasetToAppDataset(item);

            setDatasets(prev => {
                const withoutSameId = prev.filter(d => d.id !== mapped.id);
                return [...withoutSameId, mapped];
            });
            setSelectedDatasetId(mapped.id);
            setView('data');
        } catch (error) {
            console.error('Failed to load latest ingested dataset:', error);
        }
    };

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
                            onProfileDataset={id => setProfilerDatasetId(id)}
                        />
                    ) : view === 'source-config' ? (
                        <SourceConfigIngestionPage onIngestionSuccess={handleBackendIngestionSuccess} />
                    ) : view === 'relationships' ? (
                        <RelationshipDiagram datasets={datasets} companies={companies} />
                    ) : view === 'profiler' ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-10">
                            {datasets.length > 0 ? (
                                <div className="text-center space-y-6">
                                    <div className={`inline-flex p-5 rounded-2xl ${theme === 'dark' ? 'bg-gray-800' : 'bg-white shadow-sm border border-gray-200'}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
                                    </div>
                                    <div>
                                        <h2 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>Data Profiler</h2>
                                        <p className={`mt-2 max-w-md mx-auto ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Select a dataset to analyze its columns, distributions, outliers, and correlations.</p>
                                    </div>
                                    <div className="flex flex-wrap justify-center gap-3">
                                        {datasets.map(ds => (
                                            <button key={ds.id} onClick={() => setProfilerDatasetId(ds.id)}
                                                className={`px-5 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm border ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}>
                                                {ds.name} <span className={`ml-2 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-400'}`}>{ds.columns.length} cols · {ds.data.length} rows</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center space-y-4">
                                    <p className={`text-lg font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Upload a dataset to start profiling.</p>
                                    <button onClick={() => setView('data')} className={`px-4 py-2 rounded-xl text-sm font-semibold ${theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>Go to Data Hub</button>
                                </div>
                            )}
                        </div>
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
                                    <button
                                        onClick={handleShareDashboard}
                                        disabled={isSharing || charts.length === 0}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                    >
                                        <Share2 size={16} className={isSharing ? 'animate-pulse' : ''} />
                                        <span>{isSharing ? 'Creating Link...' : 'Share Link'}</span>
                                    </button>
                                    <select
                                        value={exportScope}
                                        onChange={(e) => setExportScope(e.target.value)}
                                        disabled={isPreparingExport || isExportingPdf || isExportingPpt}
                                        className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-all cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 shadow-sm hover:bg-gray-50'}`}
                                    >
                                        <option value="active">Export: Active Page</option>
                                        <option value="all">Export: All Pages</option>
                                    </select>
                                    {/* <button onClick={handleSaveDashboard} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all shadow-sm ${isSaving ? (theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-600 border-gray-200') : (theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}`}>
                                        <Save size={16} className={isSaving ? 'animate-pulse' : ''} />
                                        <span>{isSaving ? 'Saving...' : 'Save Layout'}</span>
                                    </button> */}
                                    <button
                                        onClick={handleExportPdf}
                                        disabled={exportableVisualCount === 0 || isExportingPdf || isExportingPpt || isPreparingExport}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                    >
                                        <FileText size={16} className={isExportingPdf ? 'animate-pulse' : ''} />
                                        <span>{isPreparingExport || isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}</span>
                                    </button>
                                    <button
                                        onClick={handleExportPpt}
                                        disabled={exportableVisualCount === 0 || isExportingPpt || isExportingPdf || isPreparingExport}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                    >
                                        <Presentation size={16} className={isExportingPpt ? 'animate-pulse' : ''} />
                                        <span>{isPreparingExport || isExportingPpt ? 'Exporting PPT...' : 'Export PPT'}</span>
                                    </button>
                                    <button onClick={handleAddChart} disabled={datasets.length === 0} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}>
                                        <Plus size={16} />
                                        <span>Add Visual</span>
                                    </button>
                                </div>
                            </div>

                            {/* Global Filter Bar */}
                            <GlobalFilterBar
                                datasets={datasets}
                                globalFilters={globalFilters}
                                onAddFilter={handleAddGlobalFilter}
                                onUpdateFilter={handleUpdateGlobalFilter}
                                onRemoveFilter={handleRemoveGlobalFilter}
                                onClearAll={handleClearGlobalFilters}
                            />

                            <div className="flex-1 flex overflow-hidden p-6 gap-6">
                                <div ref={reportCanvasRef} className={`flex-1 overflow-y-scroll overflow-x-hidden report-canvas-scrollbar designer-scroll-container rounded-xl border relative transition-all duration-300 ${isEditMode ? `designer-canvas ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} shadow-inner` : (theme === 'dark' ? 'bg-gray-800 border-transparent' : 'bg-white border-transparent')}`}>
                                    <ResponsiveGridLayout className="layout" layouts={{ lg: gridLayouts }} breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }} cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }} rowHeight={40} draggableHandle=".drag-handle" onLayoutChange={onLayoutChange} isDraggable={isEditMode} isResizable={isEditMode} margin={[16, 16]}>
                                        {currentPageCharts.map(config => (
                                            <div key={config.id} onClick={() => isEditMode && setActiveChartId(config.id)}>
                                                <div
                                                    data-export-visual="true"
                                                    data-export-chart-id={config.id}
                                                    data-export-title={config.title || 'Visual'}
                                                    className={`h-full w-full relative group transition-all ${activeChartId === config.id && isEditMode ? 'ring-2 ring-gray-500 dark:ring-gray-400 rounded-lg z-10' : ''}`}
                                                >
                                                    <Visualization config={config} dataset={datasets.find(d => d.id === config.datasetId)} isActive={activeChartId === config.id && isEditMode} isEditMode={isEditMode} globalFilters={globalFilters} groupId={chartGroupId} onChartInstanceChange={handleChartInstanceChange} />
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

            {/* DataProfiler Modal */}
            {profilerDatasetId && (
                <DataProfiler
                    dataset={datasets.find(d => d.id === profilerDatasetId)}
                    onClose={() => setProfilerDatasetId(null)}
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
