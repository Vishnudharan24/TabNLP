
import React, { useState, useMemo } from 'react';
import {
    BarChart, LineChart, PieChart, Table as TableIcon, Search, Database,
    Calendar, Layers, Box, Maximize2, Settings2, ArrowRight,
    CheckCircle2, Target, Grid3X3, PieChart as PieIcon, LayoutGrid, Type,
    CreditCard, Filter, X, Plus, ChevronDown, ChevronUp, Star, TrendingUp, Wand2,
    ScatterChart, Gauge, Radar, Columns3, AreaChart
} from 'lucide-react';
import { ChartType } from '../types';
import {
    recommendCharts,
    assignRoles,
    getChartRequirementText,
    isFieldCompatibleWithRole,
} from '../services/chartRecommender';
import { autoAssignFields, configFromAssignments, convertOldConfig, FieldRoles } from '../services/chartConfigSystem';
import { TYPO } from '../styles/typography';

const CHART_ICON_MAP = {
    BAR: BarChart,
    LINE: LineChart,
    AREA: AreaChart,
    PIE: PieChart,
    DONUT: PieChart,
    SUNBURST: PieChart,
    ROSE: PieChart,
    SCATTER: ScatterChart,
    BUBBLE: ScatterChart,
    HEATMAP: Grid3X3,
    TREEMAP: LayoutGrid,
    ORG_CHART: Layers,
    ORG_TREE_STRUCTURED: Layers,
    COMBO: TrendingUp,
    RADAR: Radar,
    RADIAL: Radar,
    GAUGE: Gauge,
    KPI: CreditCard,
    TABLE: TableIcon,
    CARD: CreditCard,
};

function getChartIcon(type) {
    for (const [key, Icon] of Object.entries(CHART_ICON_MAP)) {
        if (type.includes(key)) return Icon;
    }
    return BarChart;
}

const CHART_DISPLAY_NAMES = {
    BAR: 'Bar',
    LINE: 'Line',
    AREA: 'Area',
    PIE: 'Pie',
    DONUT: 'Donut',
    SUNBURST: 'Sunburst',
    RADAR: 'Radar',
    SCATTER: 'Scatter',
    BUBBLE: 'Bubble',
    TREEMAP: 'Treemap',
    ORG_CHART: 'Org Chart',
    ORG_TREE_STRUCTURED: 'Org Structured',
    HEATMAP: 'Heatmap',
    COMBO_BAR_LINE: 'Combo',
    KPI_SINGLE: 'KPI',
    TABLE: 'Table',
    GAUGE: 'Gauge',
};

function getChartName(type) {
    return CHART_DISPLAY_NAMES[type] || type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).slice(0, 10);
}

const ALL_CHART_TYPES = [
    ChartType.BAR,
    ChartType.LINE,
    ChartType.AREA,
    ChartType.PIE,
    ChartType.DONUT,
    ChartType.SCATTER,
    ChartType.BUBBLE,
    ChartType.HEATMAP,
    ChartType.TREEMAP,
    ChartType.ORG_CHART,
    ChartType.ORG_TREE_STRUCTURED,
    ChartType.SUNBURST,
    ChartType.COMBO_BAR_LINE,
    ChartType.GAUGE,
    ChartType.RADAR,
    ChartType.KPI_SINGLE,
    ChartType.TABLE,
];

const SEMANTIC_PREFIX = '__semantic__:';

const encodeSemanticField = (name = '') => `${SEMANTIC_PREFIX}${String(name || '').trim()}`;
const decodeSemanticField = (field = '') => {
    const text = String(field || '');
    return text.startsWith(SEMANTIC_PREFIX) ? text.slice(SEMANTIC_PREFIX.length) : text;
};
const isSemanticField = (field = '') => String(field || '').startsWith(SEMANTIC_PREFIX);

const ROLE_LABELS = {
    [FieldRoles.X]: 'Dimension',
    [FieldRoles.TIME]: 'Dimension',
    [FieldRoles.Y]: 'Measure',
    [FieldRoles.VALUE]: 'Measure',
    [FieldRoles.LEGEND]: 'Breakdown',
    [FieldRoles.COLOR]: 'Breakdown',
    [FieldRoles.SIZE]: 'Size',
    [FieldRoles.HIERARCHY]: 'Hierarchy',
    [FieldRoles.NODE]: 'Node',
    [FieldRoles.PARENT]: 'Parent',
    [FieldRoles.LABEL]: 'Label',
};

const ROLE_SECTION_DEFS = [
    { key: 'hierarchy', title: 'Hierarchy', icon: Layers, roles: [FieldRoles.HIERARCHY], emoji: '🧩', multi: true },
    { key: 'axis', title: 'Dimension (X-axis)', icon: Columns3, roles: [FieldRoles.X, FieldRoles.TIME], emoji: '🟦', multi: false },
    { key: 'values', title: 'Measure (Y-axis)', icon: BarChart, roles: [FieldRoles.VALUE, FieldRoles.Y], emoji: '🟩', multi: true },
    { key: 'legend', title: 'Breakdown (Optional)', icon: PieIcon, roles: [FieldRoles.LEGEND, FieldRoles.COLOR], emoji: '🎨', multi: false },
    { key: 'size', title: 'Size (Optional)', icon: Maximize2, roles: [FieldRoles.SIZE], emoji: '🫧', multi: false },
];

const ORG_ROLE_SECTION_DEFS = [
    { key: 'node', title: 'Node', icon: Layers, roles: [FieldRoles.NODE], emoji: '👤', multi: false },
    { key: 'parent', title: 'Parent', icon: ArrowRight, roles: [FieldRoles.PARENT], emoji: '🧭', multi: false },
    { key: 'label', title: 'Label', icon: Type, roles: [FieldRoles.LABEL], emoji: '🏷️', multi: false },
    { key: 'color', title: 'Color Group', icon: PieIcon, roles: [FieldRoles.COLOR], emoji: '🎨', multi: false },
];

const getFieldTypeMeta = (type) => {
    if (type === 'id') {
        return {
            icon: '#',
            badge: 'ID',
            label: 'ID',
            chipClass: 'bg-fuchsia-100 dark:bg-fuchsia-900/50 text-fuchsia-700 dark:text-fuchsia-200',
        };
    }
    if (type === 'number') {
        return {
            icon: 'Σ',
            badge: 'NUM',
            label: 'Number',
            chipClass: 'bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-200',
        };
    }
    if (type === 'date') {
        return {
            icon: '⏱',
            badge: 'DATE',
            label: 'Time',
            chipClass: 'bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200',
        };
    }
    return {
        icon: 'Aa',
        badge: 'CAT',
        label: 'Category',
        chipClass: 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200',
    };
};

const getRoleHelpText = (key) => {
    if (key === 'axis') return 'Select a category field';
    if (key === 'values') return 'Select a numeric field';
    if (key === 'legend') return 'Optional grouping field';
    if (key === 'size') return 'Only used for bubble charts';
    if (key === 'hierarchy') return 'Add one or more levels';
    return 'Select a field';
};

const FieldChip = ({ field, displayName, role, fieldType, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) => {
    const meta = getFieldTypeMeta(fieldType);

    return (
        <div className="group flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80">
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${meta.chipClass}`}>{meta.icon}</span>
            <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[130px]" title={displayName || field}>{displayName || field}</span>
            <span className="text-[9px] font-bold uppercase text-gray-400 dark:text-gray-500">{ROLE_LABELS[role] || role}</span>
            {(canMoveUp || canMoveDown) && (
                <>
                    <button onClick={onMoveUp} disabled={!canMoveUp} className="text-[10px] px-1 text-gray-400 disabled:opacity-30 hover:text-gray-600 dark:hover:text-gray-300">↑</button>
                    <button onClick={onMoveDown} disabled={!canMoveDown} className="text-[10px] px-1 text-gray-400 disabled:opacity-30 hover:text-gray-600 dark:hover:text-gray-300">↓</button>
                </>
            )}
            <button onClick={onRemove} className="ml-auto text-gray-400 hover:text-rose-500 transition-colors">×</button>
        </div>
    );
};

const RoleSection = ({ title, emoji, icon: Icon, children, onAdd }) => (
    <div className="space-y-2 p-3 rounded-xl bg-gray-50/70 dark:bg-gray-800/40 border border-gray-200/70 dark:border-gray-700/70">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
                <span className="text-[11px]">{emoji}</span>
                <Icon size={12} className="text-gray-500 dark:text-gray-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{title}</p>
            </div>
            <button onClick={onAdd} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700">
                <Plus size={10} /> Add Field
            </button>
        </div>
        <div className="flex flex-col gap-1.5">{children}</div>
    </div>
);

const OPERATORS_MAP = {
    string: [
        { label: 'Equals', value: 'EQUALS' },
        { label: 'Contains', value: 'CONTAINS' },
        { label: 'Starts With', value: 'STARTS_WITH' },
        { label: 'Is Empty', value: 'IS_EMPTY' }
    ],
    date: [
        { label: 'Equals', value: 'EQUALS' },
        { label: 'After', value: 'GT' },
        { label: 'Before', value: 'LT' },
        { label: 'Between', value: 'BETWEEN' },
        { label: 'Is Empty', value: 'IS_EMPTY' }
    ],
    number: [
        { label: 'Greater Than', value: 'GT' },
        { label: 'Less Than', value: 'LT' },
        { label: 'Equals', value: 'EQUALS' },
        { label: 'Between', value: 'BETWEEN' }
    ],
    boolean: [
        { label: 'Is True', value: 'IS_TRUE' },
        { label: 'Is False', value: 'IS_FALSE' }
    ]
};

const COLOR_PRESETS = {
    vibrant: ['#2563EB', '#7C3AED', '#EA580C', '#16A34A', '#DC2626', '#0D9488'],
    cool: ['#1D4ED8', '#0891B2', '#0EA5E9', '#4338CA', '#7C3AED', '#0F766E'],
    warm: ['#DC2626', '#EA580C', '#D97706', '#CA8A04', '#B45309', '#BE123C'],
    neutral: ['#334155', '#475569', '#64748B', '#94A3B8', '#1F2937', '#0F172A'],
};

const SIDEBAR_WIDTH_MIN = 320;
const SIDEBAR_WIDTH_MAX = 560;
const SIDEBAR_WIDTH_STEP = 40;

const DataPanel = ({
    datasets,
    selectedDatasetId,
    setSelectedDatasetId,
    semanticMeasures = [],
    activeChartConfig,
    onUpdateConfig,
    onUpdateLayout,
    showNewChartPrompt,
    onConfirmNewChart,
    onCancelNewChart,
}) => {
    const [activePane, setActivePane] = useState('data');
    const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH_MIN);
    const [fieldSearch, setFieldSearch] = useState('');
    const [pickerRole, setPickerRole] = useState(null);
    const [pickerSearch, setPickerSearch] = useState('');
    const [pickerCursor, setPickerCursor] = useState(0);
    const [showAllCharts, setShowAllCharts] = useState(false);
    const [showAvailableFields, setShowAvailableFields] = useState(false);
    const [newChartName, setNewChartName] = useState('');

    const selectedDataset = datasets.find(d => d.id === selectedDatasetId);

    const inferUiFieldType = (col) => {
        const name = String(col?.name || '').toLowerCase();
        if (/(^id$|_id$|employee.?id|product.?id|order.?id|customer.?id|sku|code)/i.test(name)) return 'id';
        if (col?.type === 'number') return 'number';
        if (col?.type === 'date') return 'date';
        return 'string';
    };

    const filteredColumns = selectedDataset?.columns.filter(col =>
        col.name.toLowerCase().includes(fieldSearch.toLowerCase())
    ) || [];

    const recommendations = useMemo(() => {
        if (!selectedDataset) return [];
        return recommendCharts(
            selectedDataset.columns,
            activeChartConfig?.dimension,
            activeChartConfig?.measures,
            { rows: selectedDataset.data }
        );
    }, [selectedDataset, activeChartConfig?.dimension, activeChartConfig?.measures]);

    const effectiveAssignments = useMemo(() => {
        if (!activeChartConfig) return [];
        return convertOldConfig(activeChartConfig).assignments || [];
    }, [activeChartConfig]);

    const syncConfigFromAssignments = (nextAssignments = [], nextType) => {
        if (!activeChartConfig) return;
        const merged = configFromAssignments(nextType || activeChartConfig.type, nextAssignments);
        const normalizedMeasures = (Array.isArray(merged.measures) ? merged.measures : []).map((m) => decodeSemanticField(m));
        onUpdateConfig({
            type: nextType || activeChartConfig.type,
            assignments: nextAssignments,
            dimension: merged.dimension,
            measures: normalizedMeasures,
            xAxisField: merged.xAxisField,
            yAxisField: merged.yAxisField,
            legendField: merged.legendField,
            sizeField: merged.sizeField,
            hierarchyFields: merged.hierarchyFields,
            axisMode: 'auto',
        });
    };

    const handleSelectChartType = (type) => {
        if (!activeChartConfig || !selectedDataset) {
            onUpdateConfig({ type });
            return;
        }

        const auto = assignRoles(type, selectedDataset.columns, selectedDataset.data, {
            dimension: activeChartConfig.dimension,
            measures: activeChartConfig.measures,
        });
        const roleAssignments = (auto.assignments && auto.assignments.length > 0)
            ? auto.assignments
            : autoAssignFields(selectedDataset.columns, type);

        syncConfigFromAssignments(roleAssignments, type);
        onUpdateConfig({ mode: auto.mode });
    };

    const prioritizedRecommendations = useMemo(() => {
        const starred = recommendations.filter(rec => rec.score >= 85);
        const others = recommendations.filter(rec => rec.score < 85);
        return [...starred, ...others];
    }, [recommendations]);

    const smartSuggestion = useMemo(() => {
        if (!selectedDataset || recommendations.length === 0) return null;
        const top = recommendations[0];
        const auto = assignRoles(top.type, selectedDataset.columns, selectedDataset.data, {
            dimension: activeChartConfig?.dimension,
            measures: activeChartConfig?.measures,
        });
        const dim = (auto?.xAxisField || auto?.timeField || auto?.dimension || '').trim();
        const measure = Array.isArray(auto?.measures) && auto.measures.length > 0 ? auto.measures[0] : '__count__';
        const prettyMeasure = measure === '__count__' ? 'Count' : measure;
        return {
            type: top.type,
            assignments: auto?.assignments || [],
            mode: auto?.mode,
            text: dim ? `${dim} + ${prettyMeasure}` : prettyMeasure,
        };
    }, [selectedDataset, recommendations, activeChartConfig?.dimension, activeChartConfig?.measures]);

    const applySmartSuggestion = () => {
        if (!smartSuggestion || !activeChartConfig) return;
        syncConfigFromAssignments(smartSuggestion.assignments, smartSuggestion.type);
        onUpdateConfig({ mode: smartSuggestion.mode });
    };

    const starredTypes = useMemo(
        () => new Set(recommendations.filter(r => r.score >= 85).map(r => r.type)),
        [recommendations]
    );

    const addFilter = () => {
        if (!activeChartConfig || !selectedDataset) return;
        const col = selectedDataset.columns[0];
        if (!col) return;
        const colOps = OPERATORS_MAP[col.type] || OPERATORS_MAP.string;
        const newFilter = {
            id: Math.random().toString(36).substr(2, 9),
            column: col.name,
            operator: colOps[0].value,
            value: col.type === 'number' ? 0 : '',
            valueSecondary: col.type === 'number' ? 0 : '',
            columnType: col.type,
        };
        onUpdateConfig({ filters: [...(activeChartConfig.filters || []), newFilter] });
    };

    const removeFilter = (id) => {
        if (!activeChartConfig) return;
        onUpdateConfig({ filters: activeChartConfig.filters.filter(f => f.id !== id) });
    };

    const updateFilter = (id, updates) => {
        if (!activeChartConfig) return;
        onUpdateConfig({
            filters: activeChartConfig.filters.map(f => f.id === id ? { ...f, ...updates } : f)
        });
    };

    const handleFieldClick = (col) => {
        if (!activeChartConfig) return;

        const currentAssignments = [...effectiveAssignments];
        const isOrgChart = activeChartConfig.type === ChartType.ORG_CHART || activeChartConfig.type === ChartType.ORG_TREE_STRUCTURED;

        const hasRole = (role) => currentAssignments.some(a => a.role === role);
        const hasField = (field) => currentAssignments.some(a => a.field === field);
        if (!isOrgChart && hasField(col.name)) return;

        const type = activeChartConfig.type;

        if (type === ChartType.ORG_CHART || type === ChartType.ORG_TREE_STRUCTURED) {
            let orgRole = FieldRoles.NODE;
            if (!hasRole(FieldRoles.NODE) && isFieldCompatibleWithRole(type, FieldRoles.NODE, col)) orgRole = FieldRoles.NODE;
            else if (!hasRole(FieldRoles.PARENT) && isFieldCompatibleWithRole(type, FieldRoles.PARENT, col)) orgRole = FieldRoles.PARENT;
            else if (!hasRole(FieldRoles.LABEL) && isFieldCompatibleWithRole(type, FieldRoles.LABEL, col)) orgRole = FieldRoles.LABEL;
            else if (!hasRole(FieldRoles.COLOR)) orgRole = FieldRoles.COLOR;
            else return;

            const next = [...currentAssignments, {
                field: col.name,
                role: orgRole,
            }];
            syncConfigFromAssignments(next);
            return;
        }

        let nextRole = FieldRoles.X;
        if (col.type === 'number') {
            nextRole = hasRole(FieldRoles.VALUE) || hasRole(FieldRoles.Y) ? FieldRoles.Y : FieldRoles.VALUE;
        } else if (col.type === 'date') {
            nextRole = hasRole(FieldRoles.TIME) ? FieldRoles.HIERARCHY : FieldRoles.TIME;
        } else if (type === ChartType.SUNBURST || type === ChartType.TREEMAP) {
            nextRole = FieldRoles.HIERARCHY;
        } else if (!hasRole(FieldRoles.X) && !hasRole(FieldRoles.TIME)) {
            nextRole = FieldRoles.X;
        } else {
            nextRole = hasRole(FieldRoles.LEGEND) ? FieldRoles.HIERARCHY : FieldRoles.LEGEND;
        }

        if (!isFieldCompatibleWithRole(type, nextRole, col)) {
            return;
        }

        const next = [...currentAssignments, {
            field: col.name,
            role: nextRole,
        }];
        syncConfigFromAssignments(next);
    };

    const chartStyle = activeChartConfig?.style || {};
    const resolvedMultiColors = useMemo(() => {
        if (Array.isArray(chartStyle.multiColors) && chartStyle.multiColors.length > 0) {
            return chartStyle.multiColors;
        }
        return [...COLOR_PRESETS.vibrant];
    }, [chartStyle.multiColors]);

    const handleFieldDragStart = (event, col) => {
        event.dataTransfer.setData('text/plain', JSON.stringify(col));
        event.dataTransfer.effectAllowed = 'move';
    };

    const fieldsByType = useMemo(() => {
        const cols = filteredColumns || [];
        return {
            categorical: cols.filter(c => inferUiFieldType(c) === 'string'),
            date: cols.filter(c => inferUiFieldType(c) === 'date'),
            numeric: cols.filter(c => inferUiFieldType(c) === 'number'),
            id: cols.filter(c => inferUiFieldType(c) === 'id'),
        };
    }, [filteredColumns]);

    const activeRoleSections = useMemo(() => {
        if (activeChartConfig?.type === ChartType.ORG_CHART || activeChartConfig?.type === ChartType.ORG_TREE_STRUCTURED) return ORG_ROLE_SECTION_DEFS;
        return ROLE_SECTION_DEFS;
    }, [activeChartConfig?.type]);

    const semanticMeasureLookup = useMemo(() => {
        const out = new Map();
        (Array.isArray(semanticMeasures) ? semanticMeasures : []).forEach((item) => {
            const name = String(item?.name || '').trim();
            if (!name) return;
            out.set(name, {
                name,
                expression: String(item?.expression || '').trim(),
            });
        });
        return out;
    }, [semanticMeasures]);

    const openFieldPicker = (role) => {
        setPickerRole(role);
        setPickerSearch('');
        setPickerCursor(0);
    };

    const closeFieldPicker = () => {
        setPickerRole(null);
        setPickerSearch('');
        setPickerCursor(0);
    };

    const candidateFieldsForRole = useMemo(() => {
        if (!pickerRole || !selectedDataset) return [];
        const isOrgChart = activeChartConfig?.type === ChartType.ORG_CHART || activeChartConfig?.type === ChartType.ORG_TREE_STRUCTURED;
        const used = isOrgChart
            ? new Set(effectiveAssignments.filter(a => a.role === pickerRole).map(a => a.field))
            : new Set(effectiveAssignments.map(a => a.field));
        const includeCount = ['y', 'value', 'x', 'size'].includes(pickerRole);
        const includeSemantic = ['y', 'value', 'size'].includes(pickerRole);

        const allowed = selectedDataset.columns.filter((col) => isFieldCompatibleWithRole(activeChartConfig?.type, pickerRole, col));

        const baseFields = allowed
            .filter(col => !used.has(col.name))
            .filter(col => col.name.toLowerCase().includes(pickerSearch.toLowerCase()))
            .map((col) => ({
                name: col.name,
                label: col.name,
                type: col.type,
                isSemantic: false,
            }));

        const countField = includeCount && !used.has('__count__')
            ? [{ name: '__count__', label: '__count__', type: 'number', isSemantic: false }]
            : [];

        const semanticFieldCandidates = includeSemantic
            ? Array.from(semanticMeasureLookup.values())
                .map((measure) => ({
                    name: encodeSemanticField(measure.name),
                    label: measure.name,
                    type: 'number',
                    isSemantic: true,
                    semanticMeasureName: measure.name,
                    semanticMeasureExpression: measure.expression,
                }))
                .filter((measure) => !used.has(measure.name))
                .filter((measure) => measure.label.toLowerCase().includes(pickerSearch.toLowerCase()))
            : [];

        return [...baseFields, ...countField, ...semanticFieldCandidates];
    }, [pickerRole, selectedDataset, effectiveAssignments, pickerSearch, activeChartConfig?.type, semanticMeasureLookup]);

    const handlePickFieldForRole = (candidateInput, role = pickerRole) => {
        const pickedCandidate = typeof candidateInput === 'string'
            ? candidateFieldsForRole.find((item) => item.name === candidateInput) || { name: candidateInput, label: candidateInput, isSemantic: isSemanticField(candidateInput) }
            : candidateInput;

        const fieldName = pickedCandidate?.name;
        if (!role || !fieldName) return;
        if (effectiveAssignments.some(a => a.field === fieldName && a.role === role)) return;

        const isOrgChart = activeChartConfig?.type === ChartType.ORG_CHART || activeChartConfig?.type === ChartType.ORG_TREE_STRUCTURED;
        const isOrgSingleRole = isOrgChart && [FieldRoles.NODE, FieldRoles.PARENT, FieldRoles.LABEL, FieldRoles.COLOR].includes(role);

        const pickedCol = selectedDataset?.columns?.find((c) => c.name === fieldName);
        const resolvedRole = (role === FieldRoles.TIME && pickedCol?.type !== 'date')
            ? FieldRoles.X
            : role;

        const base = isOrgSingleRole
            ? effectiveAssignments.filter(a => a.role !== resolvedRole)
            : [...effectiveAssignments];

        const next = [...base, {
            field: fieldName,
            role: resolvedRole,
            semanticMeasureName: pickedCandidate?.isSemantic ? pickedCandidate?.semanticMeasureName : undefined,
            semanticMeasureExpression: pickedCandidate?.isSemantic ? pickedCandidate?.semanticMeasureExpression : undefined,
        }];
        syncConfigFromAssignments(next);
        closeFieldPicker();
    };

    const removeAssignment = (index) => {
        const next = effectiveAssignments.filter((_, i) => i !== index);
        syncConfigFromAssignments(next);
    };

    const moveHierarchyAssignment = (index, direction) => {
        const hierarchyIndexes = effectiveAssignments
            .map((a, i) => ({ ...a, idx: i }))
            .filter(a => a.role === FieldRoles.HIERARCHY)
            .map(a => a.idx);
        const localPos = hierarchyIndexes.indexOf(index);
        if (localPos < 0) return;
        const targetPos = localPos + direction;
        if (targetPos < 0 || targetPos >= hierarchyIndexes.length) return;

        const from = hierarchyIndexes[localPos];
        const to = hierarchyIndexes[targetPos];
        const next = [...effectiveAssignments];
        const temp = next[from];
        next[from] = next[to];
        next[to] = temp;
        syncConfigFromAssignments(next);
    };

    const increaseSidebarWidth = () => {
        setSidebarWidth((prev) => Math.min(prev + SIDEBAR_WIDTH_STEP, SIDEBAR_WIDTH_MAX));
    };

    return (
        <aside className="side-panel-normalized shrink-0 h-full flex flex-col gap-6 overflow-hidden relative" style={{ width: `${sidebarWidth}px`, fontFamily: TYPO.fontFamily }}>
            {showNewChartPrompt && (
                <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 bg-black/30 dark:bg-black/50 backdrop-blur-sm rounded-2xl">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 w-64 space-y-4 animate-in">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">New Visual</h3>
                        <input
                            autoFocus
                            type="text"
                            placeholder="Enter visual name..."
                            value={newChartName}
                            onChange={(e) => setNewChartName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { onConfirmNewChart(newChartName); setNewChartName(''); }
                                if (e.key === 'Escape') { onCancelNewChart(); setNewChartName(''); }
                            }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
                        />
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { onCancelNewChart(); setNewChartName(''); }}
                                className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >Cancel</button>
                            <button
                                onClick={() => { onConfirmNewChart(newChartName); setNewChartName(''); }}
                                className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 hover:bg-gray-900 dark:hover:bg-gray-300 transition-colors"
                            >Create</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="glass-panel rounded-2xl shadow-sm flex flex-col h-full overflow-hidden dark:bg-gray-800 dark:border-gray-700">

                <div className="flex border-b border-gray-100 dark:border-gray-700 p-2 gap-1 shrink-0">
                    <button onClick={() => setActivePane('data')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-bold transition-all ${activePane === 'data' ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <Database size={14} /> Data
                    </button>
                    <button onClick={() => setActivePane('format')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-bold transition-all ${activePane === 'format' ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 shadow-lg' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <Settings2 size={14} /> Format
                    </button>
                    <button
                        onClick={increaseSidebarWidth}
                        disabled={sidebarWidth >= SIDEBAR_WIDTH_MAX}
                        title="Increase sidebar width"
                        className="px-2 py-3 rounded-xl text-[10px] font-bold border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Wider
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 designer-scroll-container">
                    {activePane === 'data' ? (
                        <>
                            {/* Chart Setup */}
                            <div className="space-y-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/30">
                                <div className="flex items-center gap-2">
                                    <BarChart size={14} className="text-gray-500 dark:text-gray-300" />
                                    <h4 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">Chart Setup</h4>
                                </div>
                                {activeChartConfig && (
                                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                                        {getChartRequirementText(activeChartConfig?.type)}
                                    </p>
                                )}
                                {smartSuggestion && (
                                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20">
                                        <div className="text-[11px] text-blue-700 dark:text-blue-200">
                                            Suggested: {smartSuggestion.text}
                                        </div>
                                        <button
                                            onClick={applySmartSuggestion}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                                        >
                                            <Wand2 size={11} /> Apply
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Recommended Charts */}
                            {recommendations.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Star size={12} className="text-amber-500" />
                                        <h4 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">Recommended</h4>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {prioritizedRecommendations.map(rec => {
                                            const Icon = getChartIcon(rec.type);
                                            return (
                                                <button
                                                    key={rec.type}
                                                    onClick={() => handleSelectChartType(rec.type)}
                                                    title={rec.reason || getChartName(rec.type)}
                                                    className={`group/tip py-2 flex flex-col items-center justify-center gap-1 rounded-xl border transition-all relative ${activeChartConfig?.type === rec.type ? 'bg-gray-800 dark:bg-gray-200 border-gray-800 dark:border-gray-200 text-white dark:text-gray-800' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-400'}`}
                                                >
                                                    <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-800 text-[10px] font-medium px-2 py-1 shadow-lg opacity-0 scale-90 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150 z-50">{getChartName(rec.type)}</span>
                                                    <Icon size={16} />
                                                    <span className="text-[7px] font-semibold leading-tight truncate w-full text-center px-0.5">{getChartName(rec.type)}</span>
                                                    {rec.score >= 85 && <span className="absolute top-0.5 right-0.5 text-amber-500 text-[8px]">★</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* All Charts (expandable) */}
                            <div className="space-y-3">
                                <button
                                    onClick={() => setShowAllCharts(!showAllCharts)}
                                    className="flex items-center justify-between w-full"
                                >
                                    <h4 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">All Charts</h4>
                                    {showAllCharts ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                                </button>
                                {showAllCharts && (
                                    <div className="grid grid-cols-4 gap-2">
                                        {ALL_CHART_TYPES.map(type => {
                                            const Icon = getChartIcon(type);
                                            const isStarred = starredTypes.has(type);
                                            return (
                                                <button
                                                    key={type}
                                                    onClick={() => handleSelectChartType(type)}
                                                    className={`group/tip py-2 flex flex-col items-center justify-center gap-1 rounded-xl border transition-all relative ${activeChartConfig?.type === type ? 'bg-gray-800 dark:bg-gray-200 border-gray-800 dark:border-gray-200 text-white dark:text-gray-800' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-400'}`}
                                                >
                                                    <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-800 text-[10px] font-medium px-2 py-1 shadow-lg opacity-0 scale-90 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150 z-50">{getChartName(type)}</span>
                                                    <Icon size={14} />
                                                    <span className="text-[7px] font-semibold leading-tight truncate w-full text-center px-0.5">{getChartName(type)}</span>
                                                    {isStarred && <span className="absolute top-0.5 right-0.5 text-amber-500 text-[8px]">★</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Filtering Engine */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">Filters</h4>
                                    <button onClick={addFilter} disabled={!activeChartConfig} className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all disabled:opacity-30">
                                        <Plus size={16} />
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {activeChartConfig?.filters?.map(f => {
                                        const col = selectedDataset?.columns.find(c => c.name === f.column);
                                        const ops = OPERATORS_MAP[col?.type || 'string'] || OPERATORS_MAP.string;

                                        return (
                                            <div key={f.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3 group relative">
                                                <button onClick={() => removeFilter(f.id)} className="absolute top-2 right-2 p-1 text-gray-300 dark:text-gray-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                                                    <X size={12} />
                                                </button>

                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase">Column</p>
                                                    <select
                                                        value={f.column}
                                                        onChange={(e) => {
                                                            const nextColumn = e.target.value;
                                                            const nextCol = selectedDataset?.columns.find(c => c.name === nextColumn);
                                                            const nextOps = OPERATORS_MAP[nextCol?.type || 'string'] || OPERATORS_MAP.string;
                                                            updateFilter(f.id, {
                                                                column: nextColumn,
                                                                columnType: nextCol?.type,
                                                                operator: nextOps[0].value,
                                                                value: nextCol?.type === 'number' ? 0 : '',
                                                                valueSecondary: nextCol?.type === 'number' ? 0 : '',
                                                            });
                                                        }}
                                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-1.5 px-2 text-[10px] font-bold text-gray-700 dark:text-gray-200 focus:outline-none"
                                                    >
                                                        {selectedDataset?.columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                    </select>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase">Operator</p>
                                                        <select
                                                            value={f.operator}
                                                            onChange={(e) => updateFilter(f.id, { operator: e.target.value })}
                                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-1.5 px-2 text-[10px] font-bold text-gray-700 dark:text-gray-200"
                                                        >
                                                            {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase">Value</p>
                                                        <input
                                                            type={col?.type === 'number' ? 'number' : 'text'}
                                                            value={f.value}
                                                            onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-1.5 px-2 text-[10px] font-bold text-gray-700 dark:text-gray-200"
                                                            placeholder="..."
                                                        />
                                                    </div>
                                                </div>

                                                {f.operator === 'BETWEEN' && (
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase">To Value</p>
                                                        <input
                                                            type="number"
                                                            value={f.valueSecondary || ''}
                                                            onChange={(e) => updateFilter(f.id, { valueSecondary: e.target.value })}
                                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-1.5 px-2 text-[10px] font-bold text-gray-700 dark:text-gray-200"
                                                            placeholder="Max range..."
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {(!activeChartConfig?.filters || activeChartConfig.filters.length === 0) && (
                                        <div className="text-center py-6 bg-gray-50/50 dark:bg-gray-700/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-600">
                                            <Filter size={16} className="mx-auto text-gray-300 dark:text-gray-500 mb-2" />
                                            <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase">No Active Filters</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modern Field Assignment Panel */}
                            <div className="space-y-4">
                                <h4 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">Field Mapping</h4>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => setShowAvailableFields((prev) => !prev)}
                                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-all"
                                    >
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300">Available Fields</span>
                                        {showAvailableFields ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                                    </button>

                                    {showAvailableFields && (
                                        <>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Search Fields</label>
                                                <div className="relative">
                                                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                                                    <input
                                                        type="text"
                                                        value={fieldSearch}
                                                        onChange={(e) => setFieldSearch(e.target.value)}
                                                        placeholder="Search fields..."
                                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl py-2 pl-8 pr-8 text-[11px] font-medium text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                                    />
                                                    {fieldSearch && (
                                                        <button onClick={() => setFieldSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                {[
                                                    { title: 'Category', key: 'categorical' },
                                                    { title: 'Time', key: 'date' },
                                                    { title: 'Number', key: 'numeric' },
                                                    { title: 'ID', key: 'id' },
                                                ].map((group) => (
                                                    <div key={group.key} className="space-y-1">
                                                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{group.title}</p>
                                                        {(fieldsByType[group.key] || []).length === 0 ? (
                                                            <div className="text-[10px] text-gray-400 dark:text-gray-500 italic px-2 py-1">No fields</div>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                {fieldsByType[group.key].map((col) => {
                                                                    const selected = effectiveAssignments.some(a => a.field === col.name);
                                                                    const meta = getFieldTypeMeta(col.type);
                                                                    return (
                                                                        <button
                                                                            key={col.name}
                                                                            draggable
                                                                            onDragStart={(e) => handleFieldDragStart(e, col)}
                                                                            onClick={() => handleFieldClick(col)}
                                                                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${selected ? 'bg-gray-100 dark:bg-gray-700 ring-1 ring-gray-300 dark:ring-gray-600' : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'}`}
                                                                        >
                                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${meta.chipClass}`}>{meta.icon}</span>
                                                                            <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate">{col.name}</span>
                                                                            <span className="ml-auto text-[9px] font-bold text-gray-400 dark:text-gray-500">{meta.badge}</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {Array.isArray(semanticMeasures) && semanticMeasures.length > 0 && (
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Semantic Measures</p>
                                                    <div className="space-y-1">
                                                        {semanticMeasures.map((measure) => {
                                                            const measureName = String(measure?.name || '').trim();
                                                            if (!measureName) return null;
                                                            const semanticField = encodeSemanticField(measureName);
                                                            const selected = effectiveAssignments.some(a => a.field === semanticField);
                                                            return (
                                                                <button
                                                                    key={measureName}
                                                                    onClick={() => {
                                                                        const defaultRole = activeChartConfig?.type === ChartType.BUBBLE
                                                                            ? FieldRoles.SIZE
                                                                            : FieldRoles.VALUE;
                                                                        handlePickFieldForRole({
                                                                            name: semanticField,
                                                                            label: measureName,
                                                                            type: 'number',
                                                                            isSemantic: true,
                                                                            semanticMeasureName: measureName,
                                                                            semanticMeasureExpression: String(measure?.expression || ''),
                                                                        }, defaultRole);
                                                                    }}
                                                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${selected ? 'bg-violet-100 dark:bg-violet-900/30 ring-1 ring-violet-300 dark:ring-violet-700' : 'hover:bg-violet-50 dark:hover:bg-violet-900/20'}`}
                                                                    title={measure?.expression || measureName}
                                                                >
                                                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-200">Σ</span>
                                                                    <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate">{measureName}</span>
                                                                    <span className="ml-auto text-[9px] font-black text-violet-600 dark:text-violet-300">SEM</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {activeChartConfig && (
                                    <div className="space-y-3">
                                        <h4 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">Chart Setup</h4>

                                        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                                            {getChartRequirementText(activeChartConfig?.type)}
                                        </p>
                                        {activeRoleSections.map((section) => {
                                            const chips = effectiveAssignments
                                                .map((a, idx) => ({ ...a, idx }))
                                                .filter((a) => section.roles.includes(a.role));

                                            return (
                                                <RoleSection
                                                    key={section.key}
                                                    title={section.title}
                                                    emoji={section.emoji}
                                                    icon={section.icon}
                                                    onAdd={() => openFieldPicker(section.roles[0])}
                                                >
                                                    {chips.length === 0 ? (
                                                        <div className="text-[10px] text-gray-400 dark:text-gray-500 italic px-1 py-1">{getRoleHelpText(section.key)}</div>
                                                    ) : chips.map((chip, idx) => {
                                                        const col = selectedDataset?.columns?.find(c => c.name === chip.field);
                                                        const chipType = chip.field === '__count__' ? 'number' : inferUiFieldType(col || {});
                                                        return (
                                                            <div key={`${chip.field}-${chip.role}-${chip.idx}`} className="flex items-center gap-1.5">
                                                                <div className="flex-1">
                                                                    <FieldChip
                                                                        field={chip.field}
                                                                        displayName={chip.semanticMeasureName || decodeSemanticField(chip.field)}
                                                                        role={chip.role}
                                                                        fieldType={chipType}
                                                                        canMoveUp={chip.role === FieldRoles.HIERARCHY && idx > 0}
                                                                        canMoveDown={chip.role === FieldRoles.HIERARCHY && idx < chips.length - 1}
                                                                        onMoveUp={() => moveHierarchyAssignment(chip.idx, -1)}
                                                                        onMoveDown={() => moveHierarchyAssignment(chip.idx, 1)}
                                                                        onRemove={() => removeAssignment(chip.idx)}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </RoleSection>
                                            );
                                        })}

                                    </div>
                                )}

                                {pickerRole && (
                                    <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Add field</p>
                                            <button onClick={closeFieldPicker} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={12} /></button>
                                        </div>
                                        <div className="relative">
                                            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                autoFocus
                                                value={pickerSearch}
                                                onChange={(e) => {
                                                    setPickerSearch(e.target.value);
                                                    setPickerCursor(0);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'ArrowDown') {
                                                        e.preventDefault();
                                                        setPickerCursor((prev) => Math.min(prev + 1, Math.max(candidateFieldsForRole.length - 1, 0)));
                                                    }
                                                    if (e.key === 'ArrowUp') {
                                                        e.preventDefault();
                                                        setPickerCursor((prev) => Math.max(prev - 1, 0));
                                                    }
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const picked = candidateFieldsForRole[pickerCursor];
                                                        if (picked?.name) handlePickFieldForRole(picked);
                                                    }
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        closeFieldPicker();
                                                    }
                                                }}
                                                placeholder="Search fields..."
                                                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-1.5 pl-7 pr-2 text-[11px]"
                                            />
                                        </div>
                                        <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                            {candidateFieldsForRole.length === 0 ? (
                                                <div className="text-[10px] text-gray-400 dark:text-gray-500 p-2 italic">No matching fields</div>
                                            ) : candidateFieldsForRole.map((field, idx) => {
                                                const active = idx === pickerCursor;
                                                const meta = getFieldTypeMeta(field.type);
                                                return (
                                                    <button
                                                        key={`${field.name}-${idx}`}
                                                        onClick={() => handlePickFieldForRole(field)}
                                                        className={`w-full text-left px-2.5 py-1.5 text-[11px] flex items-center gap-2 ${active ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'}`}
                                                    >
                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${meta.chipClass}`}>{meta.icon}</span>
                                                        <span className="truncate text-gray-700 dark:text-gray-200">{field.label || field.name}</span>
                                                        {field.isSemantic && (
                                                            <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-200">
                                                                SEM
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                        </>
                    ) : (
                        <div className="space-y-6">
                            <h4 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">Properties</h4>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Visual Title</label>
                                    <input
                                        type="text"
                                        value={activeChartConfig?.title || ''}
                                        onChange={(e) => onUpdateConfig({ title: e.target.value })}
                                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-xs font-bold text-gray-700 dark:text-gray-200"
                                    />
                                </div>
                                <div className="p-5 bg-gray-50 dark:bg-gray-700 rounded-xl space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between"><span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Width</span><span className="text-xs font-black text-gray-700 dark:text-gray-200">{activeChartConfig?.layout.w}</span></div>
                                        <input type="range" min="2" max="12" value={activeChartConfig?.layout.w || 4} onChange={(e) => onUpdateLayout({ w: parseInt(e.target.value) })} className="w-full accent-gray-700 dark:accent-gray-300" />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Font System</label>
                                        <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-2 text-[11px] font-bold text-gray-700 dark:text-gray-200">
                                            {TYPO.fontFamily}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between"><span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Base Size</span><span className="text-xs font-black text-gray-700 dark:text-gray-200">{Math.max(11, Number(chartStyle.fontSize || TYPO.axis.fontSize))}px</span></div>
                                        <input
                                            type="range"
                                            min="11"
                                            max="24"
                                            value={Math.max(11, Number(chartStyle.fontSize || TYPO.axis.fontSize))}
                                            onChange={(e) => onUpdateConfig({ style: { ...chartStyle, fontSize: parseInt(e.target.value, 10) } })}
                                            className="w-full accent-gray-700 dark:accent-gray-300"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Labels</label>
                                            <select
                                                value={chartStyle.labelMode || 'auto'}
                                                onChange={(e) => onUpdateConfig({ style: { ...chartStyle, labelMode: e.target.value } })}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-2 text-[11px] font-bold text-gray-700 dark:text-gray-200"
                                            >
                                                <option value="auto">Auto</option>
                                                <option value="show">Show</option>
                                                <option value="hide">Hide</option>
                                            </select>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Tooltips</label>
                                            <select
                                                value={chartStyle.tooltipEnabled === false ? 'off' : 'on'}
                                                onChange={(e) => onUpdateConfig({ style: { ...chartStyle, tooltipEnabled: e.target.value === 'on' } })}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-2 text-[11px] font-bold text-gray-700 dark:text-gray-200"
                                            >
                                                <option value="on">On</option>
                                                <option value="off">Off</option>
                                            </select>
                                        </div>
                                    </div>

                                    {(activeChartConfig?.type === ChartType.PIE || activeChartConfig?.type === ChartType.DONUT || activeChartConfig?.type === ChartType.ROSE) && (
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Pie Label Position</label>
                                            <select
                                                value={chartStyle.pieLabelPosition || 'inside'}
                                                onChange={(e) => onUpdateConfig({ style: { ...chartStyle, pieLabelPosition: e.target.value } })}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-2 text-[11px] font-bold text-gray-700 dark:text-gray-200"
                                            >
                                                <option value="inside">Inside</option>
                                                <option value="outside">Outside</option>
                                            </select>
                                        </div>
                                    )}

                                    <div className="space-y-2 pt-1">
                                        <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Color Mode</label>
                                        <select
                                            value={chartStyle.colorMode || 'multi'}
                                            onChange={(e) => {
                                                const nextMode = e.target.value;
                                                if (nextMode === 'multi') {
                                                    onUpdateConfig({
                                                        style: {
                                                            ...chartStyle,
                                                            colorMode: 'multi',
                                                            multiColors: resolvedMultiColors,
                                                        }
                                                    });
                                                    return;
                                                }

                                                onUpdateConfig({ style: { ...chartStyle, colorMode: 'single' } });
                                            }}
                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-2 text-[11px] font-bold text-gray-700 dark:text-gray-200"
                                        >
                                            <option value="multi">Multi Color</option>
                                            <option value="single">Single Color</option>
                                        </select>
                                    </div>

                                    {(chartStyle.colorMode || 'multi') === 'single' ? (
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Chart Color</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={chartStyle.singleColor || '#2563EB'}
                                                    onChange={(e) => onUpdateConfig({ style: { ...chartStyle, singleColor: e.target.value } })}
                                                    className="h-8 w-10 p-0 border border-gray-200 dark:border-gray-600 rounded"
                                                />
                                                <input
                                                    type="text"
                                                    value={chartStyle.singleColor || '#2563EB'}
                                                    onChange={(e) => onUpdateConfig({ style: { ...chartStyle, singleColor: e.target.value } })}
                                                    className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-1.5 px-2 text-[11px] font-bold text-gray-700 dark:text-gray-200"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Multi Color Wheel</label>
                                            <div className="space-y-2">
                                                {resolvedMultiColors.map((color, idx) => (
                                                    <div key={`multi-color-${idx}`} className="flex items-center gap-2">
                                                        <input
                                                            type="color"
                                                            value={color}
                                                            onChange={(e) => {
                                                                const current = [...resolvedMultiColors];
                                                                current[idx] = e.target.value;
                                                                onUpdateConfig({ style: { ...chartStyle, multiColors: current } });
                                                            }}
                                                            className="h-8 w-10 p-0 border border-gray-200 dark:border-gray-600 rounded"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={color}
                                                            onChange={(e) => {
                                                                const current = [...resolvedMultiColors];
                                                                current[idx] = e.target.value;
                                                                onUpdateConfig({ style: { ...chartStyle, multiColors: current } });
                                                            }}
                                                            className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-1.5 px-2 text-[11px] font-bold text-gray-700 dark:text-gray-200"
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const current = [...resolvedMultiColors];
                                                                if (current.length <= 1) return;
                                                                current.splice(idx, 1);
                                                                onUpdateConfig({ style: { ...chartStyle, multiColors: current } });
                                                            }}
                                                            disabled={resolvedMultiColors.length <= 1}
                                                            className="px-2 py-1.5 rounded-lg text-[10px] font-bold border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                                                            title="Remove color"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => {
                                                        const current = [...resolvedMultiColors];
                                                        current.push('#2563EB');
                                                        onUpdateConfig({ style: { ...chartStyle, multiColors: current } });
                                                    }}
                                                    className="w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                                                >
                                                    + Add Color
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default DataPanel;
