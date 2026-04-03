
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import RelationshipDiagram from './components/RelationshipDiagram';
import SourceConfigIngestionPage from './components/SourceConfigIngestionPage';
import AuthScreen from './components/AuthScreen';
import OrgChartPage from './pages/OrgChartPage.jsx';
import TemplateRoutes from './pages/TemplateRoutes';
import {
    Plus,
    BarChart as BarChartIcon,
    Database,
    Save,
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
import { recommendVisualization } from './services/chartRecommender';
import { backendApi } from './services/backendApi';
import { TYPO } from './styles/typography';
import { startPageTour } from './services/pageTour';
import { createClientId } from './services/random';

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
const STORAGE_KEY_AUTH_TOKEN = 'power_bi_v3_auth_token';
const STORAGE_KEY_AUTH_USER = 'power_bi_v3_auth_user';
const USER_SCOPED_STORAGE_KEYS = [
    STORAGE_KEY_CHARTS,
    STORAGE_KEY_PAGES,
    STORAGE_KEY_DATASETS,
    STORAGE_KEY_COMPANIES,
    STORAGE_KEY_GLOBAL_FILTERS,
    STORAGE_KEY_ACTIVE_PAGE,
    STORAGE_KEY_SELECTED_DATASET,
    STORAGE_KEY_ACTIVE_COMPANY,
    STORAGE_KEY_VIEW,
    STORAGE_KEY_BACKEND_SOURCE_IDS,
];
const COMPANY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];
const EXPERIENCE_YEAR_UNITS = ['year', 'years', 'yr', 'yrs'];
const EXPERIENCE_MONTH_UNITS = ['month', 'months', 'mo', 'mos'];

const isTemplateSharedDashboardPath = (routePath = '') => {
    const segments = String(routePath || '').toLowerCase().split('/').filter(Boolean);
    return segments.length >= 5
        && segments[0] === 'templates'
        && segments[2] === 'dashboard'
        && segments[3] === 'shared';
};

const isTemplatesListPath = (routePath = '') => {
    const segments = String(routePath || '').toLowerCase().split('/').filter(Boolean);
    return segments.length === 1 && segments[0] === 'templates';
};

const isTemplateMapPath = (routePath = '') => {
    const segments = String(routePath || '').toLowerCase().split('/').filter(Boolean);
    return segments.length === 3
        && segments[0] === 'templates'
        && segments[2] === 'map';
};

const isTemplateDashboardPath = (routePath = '') => {
    const segments = String(routePath || '').toLowerCase().split('/').filter(Boolean);
    return segments.length === 3
        && segments[0] === 'templates'
        && segments[2] === 'dashboard';
};

const hasAnyToken = (value = '', tokens = []) => tokens.some((token) => String(value).includes(token));

const normalizeAlphaNumeric = (value = '') => {
    const text = String(value || '').toLowerCase();
    let out = '';
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const code = ch.charCodeAt(0);
        if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
            out += ch;
        }
    }
    return out;
};

const isIdLikeColumnName = (normalizedName = '') => {
    const lower = String(normalizedName || '').toLowerCase();
    const compact = normalizeAlphaNumeric(lower);
    if (lower === 'id') return true;
    if (lower.endsWith('_id') || lower.startsWith('id_')) return true;
    if (lower.endsWith('code') || lower.includes('sku')) return true;
    return ['employeeid', 'productid', 'orderid', 'customerid'].some((token) => compact.includes(token));
};

const toSafeSlug = (value = 'report') => {
    const text = String(value || 'report').toLowerCase();
    let slug = '';
    let lastWasDash = false;

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const code = ch.charCodeAt(0);
        const isLetter = code >= 97 && code <= 122;
        const isDigit = code >= 48 && code <= 57;
        const isAllowedPunctuation = ch === '-' || ch === '_';

        if (isLetter || isDigit || isAllowedPunctuation) {
            slug += ch;
            lastWasDash = false;
            continue;
        }

        if (!lastWasDash) {
            slug += '-';
            lastWasDash = true;
        }
    }

    while (slug.startsWith('-')) slug = slug.slice(1);
    while (slug.endsWith('-')) slug = slug.slice(0, -1);
    return slug || 'report';
};

const toNormalizedString = (value) => String(value ?? '').trim();

const stripNumericNoise = (value = '') => {
    const drop = new Set([',', '$', '£', '€', '¥', '₹', '%', ' ', '\t', '\n', '\r']);
    let out = '';
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
        if (!drop.has(text[i])) out += text[i];
    }
    return out;
};

const hasDigit = (value = '') => {
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        if (code >= 48 && code <= 57) return true;
    }
    return false;
};

const stripToNumberCharacters = (value = '') => {
    const text = String(value || '');
    let out = '';
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const code = ch.charCodeAt(0);
        const isDigit = code >= 48 && code <= 57;
        if (isDigit || ch === '-' || ch === '.') out += ch;
    }
    return out;
};

const sanitizeExperienceTokens = (value = '') => {
    const cleaned = String(value || '')
        .toLowerCase()
        .replaceAll('(', ' ')
        .replaceAll(')', ' ')
        .replaceAll(',', ' ')
        .replaceAll(';', ' ')
        .replaceAll('/', ' ')
        .replaceAll('\\', ' ')
        .replaceAll(':', ' ')
        .trim();
    return cleaned ? cleaned.split(' ').filter(Boolean) : [];
};

const extractUnitNumber = (text = '', units = []) => {
    const tokens = sanitizeExperienceTokens(text);
    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        for (let u = 0; u < units.length; u += 1) {
            const unit = units[u];
            if (token.endsWith(unit)) {
                const prefixed = Number(token.slice(0, token.length - unit.length));
                if (Number.isFinite(prefixed)) return prefixed;
            }
        }

        const number = Number(token);
        if (!Number.isFinite(number) || i + 1 >= tokens.length) continue;
        if (units.includes(tokens[i + 1])) return number;
    }
    return null;
};

const hasDateCue = (value = '') => {
    const text = String(value || '').toLowerCase();
    if (!text) return false;
    if (text.includes('-') || text.includes('/')) return true;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
    return months.some((month) => text.includes(month));
};

const isNumericValue = (value) => {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;

    let text = value.trim();
    if (!text) return false;

    if (text.startsWith('(') && text.endsWith(')') && text.length > 2) {
        text = `-${text.slice(1, -1)}`;
    }

    text = stripNumericNoise(text);
    if (!text) return false;
    if (!hasDigit(text)) return false;

    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return false;

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const isDigit = ch >= '0' && ch <= '9';
        if (isDigit || ch === '+' || ch === '-' || ch === '.' || ch === 'e' || ch === 'E') continue;
        return false;
    }
    return true;
};

const isDateLikeValue = (value) => {
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value !== 'string') return false;

    const text = value.trim();
    if (!text) return false;
    if (isNumericValue(text)) return false;

    if (!hasDateCue(text)) return false;

    const parsed = Date.parse(text);
    return !Number.isNaN(parsed);
};

const toExperienceMonths = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value * 12;

    const text = String(value).toLowerCase().trim();
    if (!text) return null;

    const years = extractUnitNumber(text, EXPERIENCE_YEAR_UNITS);
    const months = extractUnitNumber(text, EXPERIENCE_MONTH_UNITS);

    if (years !== null || months !== null) {
        const total = (years || 0) * 12 + (months || 0);
        return Number.isFinite(total) ? total : null;
    }

    const numeric = Number(stripToNumberCharacters(text));
    return Number.isFinite(numeric) ? numeric : null;
};

const APP_BASE_URL = (() => {
    const raw = String(import.meta.env.BASE_URL || '/').trim() || '/';
    const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
    return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
})();

const normalizeRoutePath = (pathname) => {
    const raw = String(pathname || '/').trim() || '/';
    if (APP_BASE_URL !== '/' && raw.startsWith(APP_BASE_URL)) {
        const suffix = raw.slice(APP_BASE_URL.length);
        return suffix ? `/${suffix.replace(/^\/+/, '')}` : '/';
    }
    return raw;
};

const toBrowserRoutePath = (internalPath) => {
    const internal = String(internalPath || '/').trim() || '/';
    const normalized = internal.startsWith('/') ? internal : `/${internal}`;
    if (APP_BASE_URL === '/') return normalized;
    const baseNoTrailing = APP_BASE_URL.replace(/\/$/, '');
    return normalized === '/'
        ? `${baseNoTrailing}/`
        : `${baseNoTrailing}${normalized}`;
};

const parseReportRouteContext = (pathname, search = '') => {
    const normalizedPath = normalizeRoutePath(pathname || '/');
    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0].toLowerCase() !== 'report') return null;

    const query = new URLSearchParams(search || '');
    return {
        reportId: decodeURIComponent(segments[1]),
        shareToken: String(query.get('shareToken') || '').trim(),
    };
};

const parseTemplateSharedRouteContext = (pathname, search = '') => {
    const normalizedPath = normalizeRoutePath(pathname || '/');
    const segments = normalizedPath.split('/').filter(Boolean);
    const isMatch = segments.length >= 5
        && segments[0].toLowerCase() === 'templates'
        && segments[2].toLowerCase() === 'dashboard'
        && segments[3].toLowerCase() === 'shared';
    if (!isMatch) return null;

    const query = new URLSearchParams(search || '');
    const shareToken = String(query.get('shareToken') || '').trim();
    if (!shareToken) return null;

    return {
        reportId: decodeURIComponent(segments[4]),
        shareToken,
    };
};

const resolveTourPageKey = ({
    routePath,
    view,
    isSharedView,
    isSharedTemplateRoute,
}) => {
    if (isSharedTemplateRoute || isTemplateSharedDashboardPath(routePath)) {
        return 'templates-dashboard-shared';
    }

    if (routePath === '/org-chart' && !isSharedView) {
        return 'org-chart';
    }

    if (isTemplatesListPath(routePath)) return 'templates-list';
    if (isTemplateMapPath(routePath)) return 'templates-map';
    if (isTemplateDashboardPath(routePath)) return 'templates-dashboard';

    const effectiveView = isSharedView ? 'report-shared' : view;
    switch (effectiveView) {
        case 'data':
            return 'data';
        case 'source-config':
            return 'source-config';
        case 'relationships':
            return 'relationships';
        case 'profiler':
            return 'profiler';
        case 'merge':
            return 'merge';
        case 'report-shared':
            return 'report-shared';
        case 'report':
            return 'report';
        default:
            return 'app-shell';
    }
};

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

const clearUserScopedStorage = () => {
    USER_SCOPED_STORAGE_KEYS.forEach((key) => {
        try {
            localStorage.removeItem(key);
        } catch {
            // ignore storage errors
        }
    });
};

const extractBackendSourceIds = (datasets = []) => (
    Array.from(new Set(
        datasets
            .filter(ds => ds?._meta?.backend)
            .map(ds => ds?._meta?.sourceId || ds?._meta?.sourceKey)
            .filter(Boolean)
    ))
);

const inferColumnType = (columnName = '', values = []) => {
    const sample = values.filter(v => v !== null && v !== undefined && v !== '').slice(0, 50);
    if (sample.length === 0) return 'string';

    const normalizedName = String(columnName || '').trim().toLowerCase();
    const isExperienceColumn = hasAnyToken(normalizedName, ['experience', 'exp', 'tenure', 'service']);
    const isIdLikeColumn = isIdLikeColumnName(normalizedName);
    const isCategoricalByName = hasAnyToken(normalizedName, ['name', 'product', 'item', 'category', 'brand', 'department', 'city', 'state', 'country', 'segment', 'status', 'type']);

    const uniqueRatio = sample.length > 0
        ? (new Set(sample.map(v => toNormalizedString(v))).size / sample.length)
        : 0;

    const numericRatio = sample.length > 0
        ? (sample.filter(v => isNumericValue(v)).length / sample.length)
        : 0;

    const dateRatio = sample.length > 0
        ? (sample.filter(v => isDateLikeValue(v)).length / sample.length)
        : 0;

    const allExperienceLike = isExperienceColumn && sample.every(v => toExperienceMonths(v) !== null);
    if (allExperienceLike) return 'number';

    if (isIdLikeColumn && numericRatio >= 0.8) return 'string';

    if (numericRatio >= 0.9) return 'number';

    if (dateRatio >= 0.9) return 'date';

    if (isCategoricalByName) return 'string';

    // For mixed string columns, keep low-cardinality fields as categorical strings.
    if (uniqueRatio <= 0.35) return 'string';

    return 'string';
};

const getDatasetFileNameFromMetadata = (dataset) => (
    dataset?._meta?.metadata?.file_name
    || dataset?._meta?.metadata?.filename
    || dataset?._meta?.fileName
    || null
);

const mapBackendDatasetToAppDataset = (item) => {
    const rows = Array.isArray(item?.data) ? item.data : [];
    const detectedColumns = rows[0] ? Object.keys(rows[0]) : [];
    const metadata = item?.metadata || null;
    const declaredTypes = metadata?.column_types || {};
    const semanticTypes = metadata?.column_semantic_types || {};

    const normalizeBackendType = (columnName) => {
        const semantic = String(semanticTypes?.[columnName] || '').toLowerCase();
        const declared = String(declaredTypes?.[columnName] || '').toLowerCase();

        if (semantic === 'numeric' || declared === 'number' || declared === 'numeric') return 'number';
        if (semantic === 'date' || declared === 'date' || declared === 'datetime' || declared === 'timestamp') return 'date';
        if (semantic === 'id') return 'string';
        return null;
    };

    const columns = detectedColumns.map((name) => ({
        name,
        type: normalizeBackendType(name) || inferColumnType(name, rows.map(r => r?.[name])),
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
    const [isExportRenderMode, setIsExportRenderMode] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isExportingPpt, setIsExportingPpt] = useState(false);
    const [showShareExportPopup, setShowShareExportPopup] = useState(false);
    const [showReportSettingsPopup, setShowReportSettingsPopup] = useState(false);
    const [exportScope, setExportScope] = useState('active');
    const [chartClarityMode, setChartClarityMode] = useState('standard');
    const [chartPaletteMode, setChartPaletteMode] = useState('vibrant');
    const [showNewChartPrompt, setShowNewChartPrompt] = useState(false);
    const [previewDatasetId, setPreviewDatasetId] = useState(null);
    const [showMerger, setShowMerger] = useState(false);
    const [companies, setCompanies] = useState([]);
    const [activeCompanyId, setActiveCompanyId] = useState('__all__');
    const [globalFilters, setGlobalFilters] = useState([]);
    const [drillThroughContext, setDrillThroughContext] = useState(null);
    const [profilerDatasetId, setProfilerDatasetId] = useState(null);
    const [authToken, setAuthToken] = useState(() => localStorage.getItem(STORAGE_KEY_AUTH_TOKEN) || '');
    const [authUser, setAuthUser] = useState(() => readStorageJson(STORAGE_KEY_AUTH_USER, null));
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
    const [routePath, setRoutePath] = useState(() => normalizeRoutePath(window.location.pathname || '/'));
    const [orgExplorerChartId, setOrgExplorerChartId] = useState(null);
    const [semanticMeasuresByDataset, setSemanticMeasuresByDataset] = useState({});
    const [isSharedView, setIsSharedView] = useState(false);
    const [currentReportId, setCurrentReportId] = useState('');
    const previousAuthUserIdRef = useRef(authUser?.id || '');

    useEffect(() => {
        document.body.style.fontFamily = TYPO.fontFamily;
    }, []);

    const navigatePath = (path) => {
        const internalTarget = path || '/';
        const browserTarget = toBrowserRoutePath(internalTarget);
        if (window.location.pathname !== browserTarget) {
            window.history.pushState({}, '', browserTarget);
            window.dispatchEvent(new PopStateEvent('popstate'));
        }
        setRoutePath(normalizeRoutePath(internalTarget));
    };

    const applyAuthSession = (token, user) => {
        setAuthToken(token || '');
        setAuthUser(user || null);
        if (token) {
            localStorage.setItem(STORAGE_KEY_AUTH_TOKEN, token);
        } else {
            localStorage.removeItem(STORAGE_KEY_AUTH_TOKEN);
        }
        if (user) {
            writeStorageJson(STORAGE_KEY_AUTH_USER, user);
        } else {
            localStorage.removeItem(STORAGE_KEY_AUTH_USER);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const bootstrapAuth = async () => {
            if (!authToken) {
                if (isMounted) setIsAuthLoading(false);
                return;
            }

            try {
                const response = await backendApi.getCurrentUser(authToken);
                const currentUser = response?.user;
                if (isMounted && currentUser) {
                    applyAuthSession(authToken, currentUser);
                }
            } catch {
                if (isMounted) applyAuthSession('', null);
            } finally {
                if (isMounted) setIsAuthLoading(false);
            }
        };

        bootstrapAuth();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const onPopState = () => {
            setRoutePath(normalizeRoutePath(window.location.pathname || '/'));
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    useEffect(() => {
        if (routePath.startsWith('/templates')) {
            setView('templates');
        }
    }, [routePath]);

    const handleLogin = async (payload) => {
        setIsAuthSubmitting(true);
        try {
            const response = await backendApi.login(payload);
            const token = response?.token;
            const user = response?.user;
            if (!token || !user) throw new Error('Invalid login response from server');
            applyAuthSession(token, user);
        } catch (error) {
            throw new Error(error?.message || 'Login failed');
        } finally {
            setIsAuthSubmitting(false);
        }
    };

    const handleSignUp = async (payload) => {
        setIsAuthSubmitting(true);
        try {
            const response = await backendApi.signUp(payload);
            const token = response?.token;
            const user = response?.user;
            if (!token || !user) throw new Error('Invalid signup response from server');
            applyAuthSession(token, user);
        } catch (error) {
            throw new Error(error?.message || 'Signup failed');
        } finally {
            setIsAuthSubmitting(false);
        }
    };

    const handleLogout = () => {
        applyAuthSession('', null);
    };

    const resetWorkspaceState = useCallback(() => {
        const firstPageId = 'page-1';
        hasHydratedRef.current = false;
        setDatasets([]);
        setCompanies([]);
        setCharts([]);
        setPages([{ id: firstPageId, name: 'Page 1' }]);
        setActivePageId(firstPageId);
        setSelectedDatasetId('');
        setActiveChartId(null);
        setActiveCompanyId('__all__');
        setGlobalFilters([]);
        setDrillThroughContext(null);
        setProfilerDatasetId(null);
        setPreviewDatasetId(null);
        setSemanticMeasuresByDataset({});
        setCurrentReportId('');
        setIsSharedView(false);
        setIsEditMode(true);
        setView('data');
    }, []);

    useEffect(() => {
        const previousUserId = previousAuthUserIdRef.current;
        const currentUserId = authUser?.id || '';

        if (previousUserId === currentUserId) return;

        clearUserScopedStorage();
        resetWorkspaceState();
        const rootPath = toBrowserRoutePath('/');
        if (window.location.pathname !== rootPath) {
            window.history.pushState({}, '', rootPath);
            window.dispatchEvent(new PopStateEvent('popstate'));
        }
        setRoutePath('/');

        previousAuthUserIdRef.current = currentUserId;
    }, [authUser?.id, resetWorkspaceState]);

    const applyReportToState = (report) => {
        const safeReport = report || {};
        const reportPages = Array.isArray(safeReport.pages) && safeReport.pages.length > 0
            ? safeReport.pages
            : [{ id: 'page-1', name: 'Page 1' }];
        const reportCharts = Array.isArray(safeReport.charts) ? safeReport.charts : [];
        const reportFilters = Array.isArray(safeReport.global_filters) ? safeReport.global_filters : [];

        setPages(reportPages);
        setCharts(reportCharts);
        setGlobalFilters(reportFilters);
        setView('report');

        const fallbackPageId = reportPages[0]?.id || 'page-1';
        const selectedPageId = safeReport.active_page_id;
        const hasPage = selectedPageId && reportPages.some((p) => p.id === selectedPageId);
        setActivePageId(hasPage ? selectedPageId : fallbackPageId);

        if (safeReport.selected_dataset_id) {
            setSelectedDatasetId(safeReport.selected_dataset_id);
        }
    };

    useEffect(() => {
        let isCancelled = false;

        const mergePrimaryBackendDatasets = (prev, loaded) => {
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
        };

        const mergeFallbackBackendDatasets = (prev, loaded) => {
            const map = new Map();
            [...prev, ...loaded].forEach(ds => map.set(ds.id, ds));
            return Array.from(map.values());
        };

        const fetchAllDatasets = async () => {
            try {
                const response = await backendApi.listDatasets(1000);
                if (isCancelled) return [];
                return Array.isArray(response?.items)
                    ? response.items.map(mapBackendDatasetToAppDataset)
                    : [];
            } catch (error) {
                console.error('Failed to load datasets from backend:', error);
                return [];
            }
        };

        const fetchFallbackLatestDatasets = async (restoredBackendSourceIds = []) => {
            if (!Array.isArray(restoredBackendSourceIds) || restoredBackendSourceIds.length === 0) {
                return [];
            }

            const results = await Promise.allSettled(
                restoredBackendSourceIds.map(sourceId => backendApi.getLatestDatasetBySourceId(sourceId))
            );
            if (isCancelled) return [];

            return results
                .filter(r => r.status === 'fulfilled' && r.value?.item)
                .map(r => mapBackendDatasetToAppDataset(r.value.item));
        };

        const loadDatasetsFromBackend = async (restoredBackendSourceIds = []) => {
            const loadedPrimary = await fetchAllDatasets();
            if (loadedPrimary.length > 0) {
                setDatasets(prev => mergePrimaryBackendDatasets(prev, loadedPrimary));
                return;
            }

            const loadedFallback = await fetchFallbackLatestDatasets(restoredBackendSourceIds);
            if (loadedFallback.length === 0) return;

            setDatasets(prev => mergeFallbackBackendDatasets(prev, loadedFallback));
        };

        const hydrateFromLocalStorage = () => {
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

            setIsSharedView(false);
            setCurrentReportId('');
            hasHydratedRef.current = true;
            return restoredBackendSourceIds;
        };

        const tryHydrateFromRoute = async (routeInfo) => {
            if (!routeInfo?.reportId) return false;

            try {
                const response = routeInfo.shareToken
                    ? await backendApi.getSharedReport(routeInfo.reportId, routeInfo.shareToken)
                    : await backendApi.getReport(routeInfo.reportId);
                if (isCancelled) return true;

                const report = response?.report || null;
                if (!report) return false;

                applyReportToState(report);
                setCurrentReportId(String(report?.id || routeInfo.reportId));
                setIsSharedView(Boolean(routeInfo.shareToken));
                if (routeInfo.shareToken) {
                    setIsEditMode(false);
                }
                hasHydratedRef.current = true;
                await loadDatasetsFromBackend([]);
                return true;
            } catch (error) {
                console.error('Failed to load report from backend route:', error);
                return false;
            }
        };

        const runHydration = async () => {
            const routeInfo = parseReportRouteContext(window.location.pathname || '/', window.location.search || '');

            const hydratedFromRoute = await tryHydrateFromRoute(routeInfo);
            if (hydratedFromRoute) return;

            const restoredBackendSourceIds = hydrateFromLocalStorage();
            await loadDatasetsFromBackend(restoredBackendSourceIds);
        };

        runHydration();

        return () => {
            isCancelled = true;
        };
    }, [routePath]);

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
        let isCancelled = false;

        const loadSemanticMeasures = async () => {
            if (!selectedDatasetId || !authToken) return;
            try {
                const response = await backendApi.getSemanticMeasures(selectedDatasetId);
                if (isCancelled) return;
                const measures = Array.isArray(response?.measures) ? response.measures : [];
                setSemanticMeasuresByDataset((prev) => ({
                    ...prev,
                    [selectedDatasetId]: measures,
                }));
            } catch {
                if (isCancelled) return;
                setSemanticMeasuresByDataset((prev) => ({
                    ...prev,
                    [selectedDatasetId]: [],
                }));
            }
        };

        loadSemanticMeasures();

        return () => {
            isCancelled = true;
        };
    }, [selectedDatasetId, authToken]);

    const selectedDataset = useMemo(
        () => datasets.find(d => d.id === selectedDatasetId) || datasets[0] || null,
        [datasets, selectedDatasetId]
    );

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
        if (isSharing || isSharedView) return;

        if (!Array.isArray(charts) || charts.length === 0) {
            window.alert('Add at least one visual before creating a share link.');
            return;
        }

        const rawRecipients = globalThis.prompt?.('Enter recipient emails (comma separated):', '') ?? '';
        const recipientEmails = Array.from(new Set(
            String(rawRecipients || '')
                .split(',')
                .map((item) => String(item || '').trim().toLowerCase())
                .filter(Boolean)
        ));
        if (recipientEmails.length === 0) {
            globalThis.alert?.('Please add at least one recipient email.');
            return;
        }

        setIsSharing(true);
        try {
            const payload = {
                name: `Report ${new Date().toLocaleString()}`,
                pages,
                charts,
                global_filters: globalFilters,
                selected_dataset_id: selectedDatasetId || null,
                active_page_id: activePageId || null,
            };

            let reportId = String(currentReportId || '').trim();
            if (reportId) {
                await backendApi.updateReport(reportId, payload);
            } else {
                const created = await backendApi.createReport(payload);
                reportId = String(created?.report?.id || '').trim();
                if (!reportId) throw new Error('Unable to save report before sharing');
                setCurrentReportId(reportId);

                const reportPath = toBrowserRoutePath(`/report/${encodeURIComponent(reportId)}`);
                window.history.replaceState({}, '', reportPath);
                setRoutePath(normalizeRoutePath(reportPath));
            }

            const shareResponse = await backendApi.createReportShare(reportId, {
                role: 'viewer',
                expires_in_hours: 168,
                recipient_emails: recipientEmails,
            });

            const shareToken = String(shareResponse?.share?.token || '').trim();
            if (!shareToken) throw new Error('Share token was not returned');

            const sharePath = toBrowserRoutePath(`/report/${encodeURIComponent(reportId)}`);
            const url = new URL(window.location.origin + sharePath);
            url.searchParams.set('shareToken', shareToken);
            const finalUrl = url.toString();

            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(finalUrl);
                window.alert('Share link copied to clipboard.');
                return;
            }

            window.prompt('Copy your dashboard share link:', finalUrl);
        } catch (error) {
            console.error('Failed to generate share link:', error);
            window.alert(error?.message || 'Unable to generate share link right now.');
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
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 220));
    };

    const buildFileSafeName = (baseName, extension) => {
        const cleaned = toSafeSlug(baseName || 'report');
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
            setIsExportRenderMode(true);
            await waitForRenderStabilization();

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
            setIsExportRenderMode(false);
            setIsPreparingExport(false);
            setIsExportingPdf(false);
        }
    };

    const handleExportPpt = async () => {
        if (isExportingPpt || isExportingPdf || isPreparingExport) return;

        setIsPreparingExport(true);
        setIsExportingPpt(true);
        try {
            setIsExportRenderMode(true);
            await waitForRenderStabilization();

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
            setIsExportRenderMode(false);
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

        const recommendation = recommendVisualization(dataset.columns, dataset.data, {});
        const autoConfig = recommendation?.config || {};
        const bestType = recommendation?.recommendedChart || ChartType.BAR;
        const dim = autoConfig.dimension || dataset.columns.find(c => c.type === 'string' || c.type === 'date')?.name || dataset.columns[0]?.name || '';
        const measures = Array.isArray(autoConfig.measures) && autoConfig.measures.length > 0
            ? autoConfig.measures
            : (dataset.columns.find(c => c.type === 'number')?.name ? [dataset.columns.find(c => c.type === 'number')?.name] : []);

        const newChart = {
            id: createClientId('chart'),
            pageId: activePageId,
            datasetId: dataset.id,
            title: name.trim() || 'New Visual',
            type: bestType,
            dimension: dim,
            measures,
            axisMode: 'auto',
            xAxisField: autoConfig.xAxis || '',
            yAxisField: autoConfig.yAxis || '',
            aggregation: autoConfig.aggregation || 'SUM',
            legendField: autoConfig.legend || '',
            sizeField: autoConfig.size || '',
            hierarchyFields: Array.isArray(autoConfig.hierarchy) ? autoConfig.hierarchy : [],
            assignments: Array.isArray(autoConfig.assignments) ? autoConfig.assignments : [],
            mode: autoConfig.mode,
            layout: { x: 0, y: Infinity, w: 6, h: 8 },
            filters: [],
            style: {
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: 11,
                labelMode: 'auto',
                tooltipEnabled: true,
                tooltipDecimals: 2,
                colorMode: 'multi',
                singleColor: '#2563EB',
                multiColors: [],
            },
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
            id: createClientId('company'),
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

    const handleClearInteractionFilters = () => {
        setGlobalFilters(prev => prev.filter(f => f?.source !== 'interaction'));
    };

    const applyFiltersToRows = (rows = [], filters = []) => {
        if (!Array.isArray(filters) || filters.length === 0) return rows;
        return rows.filter(row => filters.every((gf) => {
            if (!gf?.column || !(gf.column in row)) return true;
            const val = row[gf.column];
            if (gf.type === 'include' && Array.isArray(gf.values) && gf.values.length > 0) {
                return gf.values.includes(String(val));
            }
            if (gf.type === 'exclude' && Array.isArray(gf.values) && gf.values.length > 0) {
                return !gf.values.includes(String(val));
            }
            if (gf.type === 'range') {
                const num = Number(val);
                if (Number.isNaN(num)) return false;
                return num >= Number(gf.rangeMin) && num <= Number(gf.rangeMax);
            }
            return true;
        }));
    };

    const handleVisualizationDataPoint = ({ chartId, chartTitle, datasetId, dimension, value }) => {
        const interactionFilterId = `interaction-${chartId}`;

        if (!chartId || value === undefined || value === null) {
            // Clear interaction filter
            setGlobalFilters(prev => prev.filter(f => f.id !== interactionFilterId));
            return;
        }

        if (!datasetId || !dimension) return;

        const nextFilter = {
            id: interactionFilterId,
            source: 'interaction',
            sourceChartId: chartId,
            datasetId,
            column: dimension,
            columnType: 'string',
            type: 'include',
            values: [String(value)],
            allValues: [String(value)],
        };

        setGlobalFilters(prev => {
            const withoutSameSource = prev.filter(f => f.id !== interactionFilterId);
            return [...withoutSameSource, nextFilter];
        });

        const sourceDataset = datasets.find(d => d.id === datasetId);
        const sourceRows = Array.isArray(sourceDataset?.data) ? sourceDataset.data : [];
        const scopedRows = sourceRows.filter(row => String(row?.[dimension]) === String(value));
        const nonInteractionGlobalFilters = globalFilters.filter(f => f?.source !== 'interaction');
        const filteredRows = applyFiltersToRows(scopedRows, nonInteractionGlobalFilters);

        setDrillThroughContext({
            chartId,
            chartTitle: chartTitle || 'Visual',
            datasetName: sourceDataset?.name || 'Dataset',
            dimension,
            value: String(value),
            rows: filteredRows.slice(0, 200),
            totalRows: filteredRows.length,
        });
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
    const currentPageOrgCharts = useMemo(() => currentPageCharts.filter(c => c.type === ChartType.ORG_CHART || c.type === ChartType.ORG_TREE_STRUCTURED), [currentPageCharts]);
    const gridLayouts = useMemo(() => currentPageCharts.map(c => ({ i: c.id, ...c.layout })), [currentPageCharts]);
    const exportableVisualCount = useMemo(() => {
        if (exportScope === 'all') return charts.length;
        return currentPageCharts.length;
    }, [exportScope, charts.length, currentPageCharts.length]);

    const handleBackendIngestionSuccess = async (ingestionResult, options = {}) => {
        const sourceId = ingestionResult?.source_id;
        if (!sourceId) return;

        try {
            const latest = await backendApi.getLatestDatasetBySourceId(sourceId);
            const item = latest?.item;
            if (!item) return;

            const mapped = mapBackendDatasetToAppDataset(item);
            const preferredCompanyId = options?.preferredCompanyId || null;
            const mappedWithCompany = {
                ...mapped,
                companyId: preferredCompanyId,
            };

            setDatasets(prev => {
                const withoutSameId = prev.filter(d => d.id !== mappedWithCompany.id);
                return [...withoutSameId, mappedWithCompany];
            });
            setSelectedDatasetId(mappedWithCompany.id);
            setView('data');
        } catch (error) {
            console.error('Failed to load latest ingested dataset:', error);
        }
    };

    const sharedTemplateRoute = parseTemplateSharedRouteContext(routePath, window.location.search || '');
    const isSharedTemplateRoute = Boolean(sharedTemplateRoute?.reportId && sharedTemplateRoute?.shareToken);
    const currentTourPageKey = useMemo(() => resolveTourPageKey({
        routePath,
        view,
        isSharedView,
        isSharedTemplateRoute,
    }), [routePath, view, isSharedView, isSharedTemplateRoute]);
    const handleStartTour = useCallback(() => {
        if (currentTourPageKey === 'report') {
            setShowReportSettingsPopup(true);
            setTimeout(() => startPageTour(currentTourPageKey), 120);
            return;
        }

        startPageTour(currentTourPageKey);
    }, [currentTourPageKey]);

    if (isAuthLoading) {
        return (
            <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-700'}`}>
                <div className="text-sm font-semibold">Loading authentication...</div>
            </div>
        );
    }

    if (!authUser) {
        return <AuthScreen onLogin={handleLogin} onSignUp={handleSignUp} isLoading={isAuthSubmitting} />;
    }

    if (isSharedTemplateRoute) {
        return (
            <div className={`app-type-system flex flex-col h-screen overflow-hidden font-jakarta ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-800'}`}>
                <Header authUser={authUser} onLogout={null} onLogoClick={() => navigatePath('/templates')} onHelpClick={handleStartTour} />
                <main className={`flex-1 min-w-0 overflow-auto ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    <TemplateRoutes
                        datasets={datasets}
                        selectedDatasetId={selectedDatasetId}
                        setSelectedDatasetId={setSelectedDatasetId}
                        sharedTemplateRoute={sharedTemplateRoute}
                    />
                </main>
            </div>
        );
    }

    if (routePath === '/org-chart' && !isSharedView) {
        return (
            <div className={`app-type-system flex flex-col h-screen overflow-hidden font-jakarta ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-800'}`}>
                <Header authUser={authUser} onLogout={handleLogout} onLogoClick={() => navigatePath('/')} onHelpClick={handleStartTour} />
                <div className="flex-1 min-w-0 overflow-hidden">
                    <OrgChartPage
                        datasets={datasets}
                        charts={charts}
                        selectedDatasetId={selectedDatasetId}
                        globalFilters={globalFilters}
                        initialChartId={orgExplorerChartId}
                        onBack={() => navigatePath('/')}
                    />
                </div>
            </div>
        );
    }

    const effectiveView = isSharedView ? 'report' : view;

    const renderNonReportView = () => {
        switch (effectiveView) {
            case 'templates':
                return (
                    <TemplateRoutes
                        datasets={datasets}
                        selectedDatasetId={selectedDatasetId}
                        setSelectedDatasetId={setSelectedDatasetId}
                        sharedTemplateRoute={null}
                    />
                );
            case 'data':
                return (
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
                        onBackendIngestionSuccess={handleBackendIngestionSuccess}
                    />
                );
            case 'source-config':
                return <SourceConfigIngestionPage onIngestionSuccess={handleBackendIngestionSuccess} />;
            case 'relationships':
                return <RelationshipDiagram datasets={datasets} companies={companies} />;
            case 'profiler':
                return (
                    <div data-tour="profiler-root" className="flex-1 flex flex-col items-center justify-center p-10">
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
                                            {ds.name} <span className="ml-2 text-xs text-gray-400">{ds.columns.length} cols · {ds.data.length} rows</span>
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
                );
            case 'merge':
                return (
                    <div data-tour="merge-root" className="flex-1 flex flex-col items-center justify-center p-10">
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
                );
            default:
                return null;
        }
    };

    return (
        <div data-tour="app-shell" className={`app-type-system flex flex-col h-screen overflow-hidden font-jakarta ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-800'}`}>
            <Header authUser={authUser} onLogout={handleLogout} onLogoClick={() => { if (!isSharedView) { setView('data'); navigatePath('/'); } }} onHelpClick={handleStartTour} />
            <div className="flex flex-1 overflow-hidden">
                {!isSharedView && <Sidebar setView={setView} currentView={effectiveView} onNavigatePath={navigatePath} />}
                <main data-tour="main-content" className={`flex-1 flex flex-col min-w-0 ${effectiveView === 'templates' ? 'overflow-auto' : 'overflow-hidden'} ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
                    {effectiveView !== 'report' ? renderNonReportView() : (
                        <div data-tour="report-root" className="flex-1 flex flex-col overflow-hidden">
                            <div data-tour="report-header" className={`px-6 py-4 flex items-center justify-between shrink-0 z-20 border-b ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                <div className="flex flex-col">
                                    <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <Database size={12} />
                                        <span>Report</span>
                                    </div>
                                    <h1 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{isEditMode ? 'Visual Designer' : 'Report Preview'}</h1>
                                </div>
                                <div data-tour="report-toolbar" className="report-toolbar-controls flex items-center gap-2">
                                    {datasets.length > 1 && (
                                        <select
                                            data-tour="report-dataset-select"
                                            value={selectedDatasetId}
                                            onChange={(e) => setSelectedDatasetId(e.target.value)}
                                            disabled={isSharedView}
                                            className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-all cursor-pointer focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 shadow-sm hover:bg-gray-50'}`}
                                        >
                                            {datasets.map(ds => (
                                                <option key={ds.id} value={ds.id}>
                                                    {`${ds.name}${getDatasetFileNameFromMetadata(ds) ? ` • ${getDatasetFileNameFromMetadata(ds)}` : ''}`}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {datasets.length === 1 && (
                                        <span className={`px-3 py-2 rounded-lg text-sm font-semibold border ${theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                            <Database size={14} className="inline mr-1.5 -mt-0.5" />{datasets[0].name}
                                        </span>
                                    )}
                                    {selectedDataset && (
                                        <div className={`px-3 py-2 rounded-lg border max-w-[330px] ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'}`}>
                                            <p className="font-semibold truncate">
                                                {getDatasetFileNameFromMetadata(selectedDataset) || 'File name not available in metadata'}
                                            </p>
                                            <p className={`truncate ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>
                                                {`rows: ${selectedDataset?._meta?.metadata?.row_count ?? selectedDataset?.data?.length ?? 0} · cols: ${selectedDataset?.columns?.length ?? 0} · source: ${selectedDataset?._meta?.metadata?.source_type || selectedDataset?._meta?.sourceKey || 'unknown'}`}
                                            </p>
                                        </div>
                                    )}
                                    {!isSharedView && (
                                        <button onClick={() => setIsEditMode(!isEditMode)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${isEditMode ? (theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 shadow-sm hover:bg-gray-50') : (theme === 'dark' ? 'bg-gray-200 text-gray-800 border-transparent' : 'bg-gray-800 text-white border-transparent hover:bg-gray-900 shadow-sm')}`}>
                                            {isEditMode ? <Eye size={16} /> : <Settings size={16} />}
                                            <span>{isEditMode ? 'Preview' : 'Edit Mode'}</span>
                                        </button>
                                    )}
                                    {currentPageOrgCharts.length > 0 && (
                                        <button
                                            onClick={() => {
                                                const pick = currentPageOrgCharts.find(c => c.id === activeChartId) || currentPageOrgCharts[0];
                                                setOrgExplorerChartId(pick?.id || null);
                                                navigatePath('/org-chart');
                                            }}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all shadow-sm ${theme === 'dark' ? 'bg-indigo-900/40 text-indigo-100 border-indigo-700 hover:bg-indigo-900/60' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}
                                        >
                                            <Eye size={16} />
                                            <span>Expand Org Chart</span>
                                        </button>
                                    )}
                                    <button
                                        data-tour="report-settings-btn"
                                        onClick={() => setShowReportSettingsPopup(true)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all shadow-sm ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                    >
                                        <Settings size={16} />
                                        <span>Settings</span>
                                    </button>
                                    {/* <button onClick={handleSaveDashboard} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all shadow-sm ${isSaving ? (theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-600 border-gray-200') : (theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}`}>
                                        <Save size={16} className={isSaving ? 'animate-pulse' : ''} />
                                        <span>{isSaving ? 'Saving...' : 'Save Layout'}</span>
                                    </button> */}
                                    {!isSharedView && (
                                        <button data-tour="report-add-visual-btn" onClick={handleAddChart} disabled={datasets.length === 0} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}>
                                            <Plus size={16} />
                                            <span>Add Visual</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 flex overflow-hidden p-6 gap-6">
                                <div data-tour="report-canvas" ref={reportCanvasRef} className={`flex-1 overflow-y-scroll overflow-x-hidden report-canvas-scrollbar designer-scroll-container rounded-xl border relative transition-all duration-300 ${isEditMode ? `designer-canvas ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} shadow-inner` : (theme === 'dark' ? 'bg-gray-800 border-transparent' : 'bg-white border-transparent')}`}>
                                    <ResponsiveGridLayout className="layout" layouts={{ lg: gridLayouts }} breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }} cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }} rowHeight={40} draggableHandle=".drag-handle" onLayoutChange={onLayoutChange} isDraggable={isEditMode} isResizable={isEditMode || isSharedView} margin={[16, 16]}>
                                        {currentPageCharts.map(config => (
                                            <div key={config.id} onClick={() => isEditMode && setActiveChartId(config.id)}>
                                                <div
                                                    data-tour="report-visual-card"
                                                    data-export-visual="true"
                                                    data-export-chart-id={config.id}
                                                    data-export-title={config.title || 'Visual'}
                                                    className={`h-full w-full relative group transition-all ${activeChartId === config.id && isEditMode ? 'ring-2 ring-gray-500 dark:ring-gray-400 rounded-lg z-10' : ''}`}
                                                >
                                                    <Visualization config={config} dataset={datasets.find(d => d.id === config.datasetId)} isActive={activeChartId === config.id && isEditMode} isEditMode={isEditMode} globalFilters={globalFilters} groupId={chartGroupId} onChartInstanceChange={handleChartInstanceChange} chartClarityMode={chartClarityMode} chartPaletteMode={chartPaletteMode} onDataPointClick={handleVisualizationDataPoint} isExportRenderMode={isExportRenderMode} />
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

                                {!isSharedView && (
                                    <div data-tour="report-config-panel">
                                        <DataPanel datasets={datasets} selectedDatasetId={selectedDatasetId} setSelectedDatasetId={setSelectedDatasetId} activeChartConfig={charts.find(c => c.id === activeChartId) || null} onUpdateConfig={(updates) => { if (activeChartId) setCharts(p => p.map(c => c.id === activeChartId ? { ...c, ...updates } : c)); }} onUpdateLayout={(updates) => { if (activeChartId) setCharts(p => p.map(c => c.id === activeChartId ? { ...c, layout: { ...c.layout, ...updates } } : c)); }} semanticMeasures={semanticMeasuresByDataset[selectedDatasetId] || []} chartsCount={charts.length} showNewChartPrompt={showNewChartPrompt} onConfirmNewChart={handleConfirmNewChart} onCancelNewChart={() => setShowNewChartPrompt(false)} />
                                    </div>
                                )}
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
                    onMergeComplete={async (mergeConfig) => {
                        const response = await backendApi.mergeDatasets({
                            left_dataset_id: mergeConfig?.leftDatasetId,
                            right_dataset_id: mergeConfig?.rightDatasetId,
                            join_type: mergeConfig?.joinType,
                            left_key: mergeConfig?.leftKey || null,
                            right_key: mergeConfig?.rightKey || null,
                            merged_name: mergeConfig?.mergedName || null,
                        });

                        const item = response?.item;
                        if (!item) {
                            throw new Error('Backend did not return merged dataset details');
                        }

                        const mergedDs = mapBackendDatasetToAppDataset(item);
                        setDatasets((prev) => {
                            const withoutSame = prev.filter((d) => d.id !== mergedDs.id);
                            return [...withoutSame, mergedDs];
                        });
                        setSelectedDatasetId(mergedDs.id);
                        setShowMerger(false);
                    }}
                />
            )}

            {showShareExportPopup && view === 'report' && (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={() => setShowShareExportPopup(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-base font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>Share Report</h3>
                            <button
                                onClick={() => setShowShareExportPopup(false)}
                                className={`p-1.5 rounded-lg transition-all ${theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <label className={`block text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Export Scope</label>
                            <select
                                value={exportScope}
                                onChange={(e) => setExportScope(e.target.value)}
                                disabled={isPreparingExport || isExportingPdf || isExportingPpt}
                                className={`w-full px-3 py-2 rounded-lg text-sm font-semibold border transition-all cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                <option value="active">Active Page</option>
                                <option value="all">All Pages</option>
                            </select>

                            <button
                                onClick={() => { setShowShareExportPopup(false); handleExportPdf(); }}
                                disabled={exportableVisualCount === 0 || isExportingPdf || isExportingPpt || isPreparingExport}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                <FileText size={16} className={isExportingPdf ? 'animate-pulse' : ''} />
                                <span>{isPreparingExport || isExportingPdf ? 'Exporting PDF...' : 'Export as PDF'}</span>
                            </button>

                            <button
                                onClick={() => { setShowShareExportPopup(false); handleExportPpt(); }}
                                disabled={exportableVisualCount === 0 || isExportingPpt || isExportingPdf || isPreparingExport}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                <Presentation size={16} className={isExportingPpt ? 'animate-pulse' : ''} />
                                <span>{isPreparingExport || isExportingPpt ? 'Exporting PPT...' : 'Export as PPT'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showReportSettingsPopup && view === 'report' && (
                <div
                    data-tour="report-settings-modal"
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={() => setShowReportSettingsPopup(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-base font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>Report Settings</h3>
                            <button
                                onClick={() => setShowReportSettingsPopup(false)}
                                className={`p-1.5 rounded-lg transition-all ${theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <label className={`block text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Charts</label>
                            <select
                                value={chartClarityMode}
                                onChange={(e) => setChartClarityMode(e.target.value)}
                                className={`w-full px-3 py-2 rounded-lg text-sm font-semibold border transition-all cursor-pointer focus:outline-none ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                <option value="standard">Standard</option>
                                <option value="clear">Clear</option>
                            </select>

                            <label className={`block text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Pallete</label>
                            <select
                                value={chartPaletteMode}
                                onChange={(e) => setChartPaletteMode(e.target.value)}
                                className={`w-full px-3 py-2 rounded-lg text-sm font-semibold border transition-all cursor-pointer focus:outline-none ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                <option value="vibrant">Vibrant</option>
                                <option value="neutral">Neutral</option>
                            </select>

                            <label className={`block text-xs font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Share</label>
                            <button
                                data-tour="report-settings-share-link"
                                onClick={handleShareDashboard}
                                disabled={isSharedView || isSharing || isPreparingExport || isExportingPdf || isExportingPpt}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                <FileText size={16} className={isSharing ? 'animate-pulse' : ''} />
                                <span>{isSharing ? 'Preparing link...' : 'Copy Share Link'}</span>
                            </button>

                        </div>
                    </div>
                </div>
            )}

            {drillThroughContext && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    onClick={() => setDrillThroughContext(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className={`w-[92vw] max-w-5xl max-h-[85vh] rounded-2xl border shadow-2xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900'}`}
                    >
                        <div className={`px-5 py-4 border-b flex items-start justify-between ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div>
                                <p className={`text-[11px] uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Drill Through</p>
                                <h3 className="text-lg font-bold">{drillThroughContext.chartTitle}</h3>
                                <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                                    {`${drillThroughContext.dimension} = ${drillThroughContext.value} • ${drillThroughContext.totalRows.toLocaleString()} rows`}
                                </p>
                            </div>
                            <button
                                onClick={() => setDrillThroughContext(null)}
                                className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 overflow-auto max-h-[65vh]">
                            {drillThroughContext.rows.length === 0 ? (
                                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>No rows available for this drill-through selection.</p>
                            ) : (
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className={`border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                                            {Object.keys(drillThroughContext.rows[0]).map((col) => (
                                                <th key={col} className={`py-2 px-3 font-bold sticky top-0 ${theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-600'}`}>
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {drillThroughContext.rows.map((row, idx) => {
                                            const rowKey = Object.entries(row)
                                                .map(([col, val]) => `${col}:${String(val ?? '')}`)
                                                .join('|');
                                            const stableRowKey = rowKey || `row-${idx}`;

                                            return (
                                                <tr key={stableRowKey} className={`border-b ${theme === 'dark' ? 'border-gray-700/60' : 'border-gray-100'}`}>
                                                    {Object.entries(row).map(([col, val]) => (
                                                        <td key={`${stableRowKey}-${col}`} className="py-2 px-3 whitespace-nowrap">{String(val ?? '')}</td>
                                                    ))}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <footer className={`h-10 border-t px-6 flex items-center justify-between shrink-0 z-40 text-xs ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-1">
                    {effectiveView === 'report' && (
                        <>
                            {pages.map((p) => (
                                <div key={p.id} className="group relative flex items-center">
                                    <button onClick={() => { setActivePageId(p.id); setView('report'); }} className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-2 ${activePageId === p.id ? (theme === 'dark' ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900') : (theme === 'dark' ? 'text-gray-500 hover:bg-gray-700 hover:text-gray-300' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700')}`}>
                                        <span>{p.name}</span>
                                        {!isSharedView && pages.length > 1 && <span onClick={(e) => handleRemovePage(e, p.id)} className={`ml-1 hover:text-rose-500 transition-colors ${activePageId === p.id ? 'opacity-100' : 'hidden group-hover:block'}`}><X size={12} /></span>}
                                    </button>
                                </div>
                            ))}
                            {!isSharedView && <button onClick={handleAddPage} className={`p-1.5 ml-1 rounded-md transition-colors ${theme === 'dark' ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}><PlusCircle size={14} /></button>}
                        </>
                    )}
                </div>
                <div className="flex items-center gap-4 font-semibold text-gray-500">
                    <span>{currentPageCharts.length} Objects</span>
                    <div className={`h-3 w-[1px] ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>ChillAnalytics v1.0</span>
                </div>
            </footer>
        </div>
    );
};

export default App;
