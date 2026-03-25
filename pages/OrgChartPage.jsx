import React, { useMemo, useRef, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { ArrowLeft, Search, ZoomIn, ZoomOut, RotateCcw, Building2 } from 'lucide-react';
import { ChartType } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { autoAssignFields, buildOrgTree, configFromAssignments, convertOldConfig, FieldRoles } from '../services/chartConfigSystem';
import { buildChartOption } from '../services/echartsOptionBuilder';

const toLabel = (value = '') => String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const inferField = (columns = [], regexList = []) => {
    const safe = Array.isArray(columns) ? columns : [];
    const byName = safe.map((c) => ({ ...(c || {}), lower: String(c?.name || '').toLowerCase() }));
    for (const regex of regexList) {
        const found = byName.find((c) => regex.test(c.lower));
        if (found?.name) return found.name;
    }
    return '';
};

const applyGlobalAndLocalFilters = (rows = [], globalFilters = [], localFilters = {}, fields = {}) => {
    let scoped = Array.isArray(rows) ? rows : [];

    if (Array.isArray(globalFilters) && globalFilters.length > 0) {
        scoped = scoped.filter((row) => globalFilters.every((gf) => {
            if (!gf?.column || !(gf.column in row)) return true;
            const val = row[gf.column];
            if (gf.type === 'include' && Array.isArray(gf.values) && gf.values.length > 0) {
                return gf.values.includes(String(val));
            }
            if (gf.type === 'range') {
                const num = Number(val);
                if (Number.isNaN(num)) return false;
                return num >= Number(gf.rangeMin) && num <= Number(gf.rangeMax);
            }
            return true;
        }));
    }

    const { department, location, role } = localFilters || {};
    const { departmentField, locationField, roleField } = fields || {};

    if (department && departmentField) {
        scoped = scoped.filter((row) => String(row?.[departmentField] || '') === String(department));
    }
    if (location && locationField) {
        scoped = scoped.filter((row) => String(row?.[locationField] || '') === String(location));
    }
    if (role && roleField) {
        scoped = scoped.filter((row) => String(row?.[roleField] || '') === String(role));
    }

    return scoped;
};

const uniqueValues = (rows = [], field = '') => {
    if (!field) return [];
    return Array.from(new Set((Array.isArray(rows) ? rows : [])
        .map((r) => String(r?.[field] || '').trim())
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
};

const OrgChartPage = ({
    datasets = [],
    charts = [],
    selectedDatasetId = '',
    globalFilters = [],
    initialChartId = null,
    onBack,
}) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const chartRef = useRef(null);

    const orgCharts = useMemo(
        () => (Array.isArray(charts) ? charts.filter((c) => c?.type === ChartType.ORG_CHART) : []),
        [charts]
    );

    const defaultChartId = useMemo(() => {
        if (initialChartId && orgCharts.some((c) => c.id === initialChartId)) return initialChartId;
        return orgCharts[0]?.id || null;
    }, [orgCharts, initialChartId]);

    const [activeOrgChartId, setActiveOrgChartId] = useState(defaultChartId);
    const [searchQuery, setSearchQuery] = useState('');
    const [orgTreeExpandMode, setOrgTreeExpandMode] = useState('default');
    const [selectedPathNames, setSelectedPathNames] = useState([]);
    const [selectedPathIds, setSelectedPathIds] = useState([]);
    const [selectedNodeId, setSelectedNodeId] = useState('');
    const [zoomPct, setZoomPct] = useState(100);
    const [filters, setFilters] = useState({ department: '', location: '', role: '' });

    useEffect(() => {
        setActiveOrgChartId(defaultChartId);
    }, [defaultChartId]);

    const activeOrgChart = useMemo(
        () => orgCharts.find((c) => c.id === activeOrgChartId) || orgCharts[0] || null,
        [orgCharts, activeOrgChartId]
    );

    const fallbackDataset = useMemo(
        () => datasets.find((d) => d.id === selectedDatasetId) || datasets[0] || null,
        [datasets, selectedDatasetId]
    );

    const dataset = useMemo(() => {
        if (!activeOrgChart) return fallbackDataset;
        return datasets.find((d) => d.id === activeOrgChart.datasetId) || fallbackDataset;
    }, [activeOrgChart, datasets, fallbackDataset]);

    const resolvedConfig = useMemo(() => {
        if (!dataset) return null;

        const baseConfig = activeOrgChart || {
            type: ChartType.ORG_CHART,
            assignments: autoAssignFields(dataset.columns || [], ChartType.ORG_CHART),
        };

        const normalized = convertOldConfig(baseConfig);
        const assignments = Array.isArray(normalized.assignments) && normalized.assignments.length > 0
            ? normalized.assignments
            : autoAssignFields(dataset.columns || [], ChartType.ORG_CHART);

        return {
            ...baseConfig,
            ...configFromAssignments(ChartType.ORG_CHART, assignments),
            assignments,
        };
    }, [activeOrgChart, dataset]);

    const mapping = useMemo(() => {
        const assignments = Array.isArray(resolvedConfig?.assignments) ? resolvedConfig.assignments : [];
        const pick = (role) => assignments.find((a) => a?.role === role)?.field || '';

        const nodeField = pick(FieldRoles.NODE) || resolvedConfig?.nodeField || '';
        const parentField = pick(FieldRoles.PARENT) || resolvedConfig?.parentField || '';
        const labelField = pick(FieldRoles.LABEL) || resolvedConfig?.labelField || '';
        const colorField = pick(FieldRoles.COLOR) || resolvedConfig?.colorField || '';

        return { nodeField, parentField, labelField, colorField };
    }, [resolvedConfig]);

    const auxiliaryFields = useMemo(() => {
        const cols = dataset?.columns || [];
        const departmentField = mapping.colorField || inferField(cols, [/(department|dept|business\s*unit|team|function|division)/i]);
        const locationField = inferField(cols, [/(location|office|site|city|country|region)/i]);
        const roleField = mapping.labelField || inferField(cols, [/(designation|title|role|position|job)/i]);
        return { departmentField, locationField, roleField };
    }, [dataset?.columns, mapping.colorField, mapping.labelField]);

    const filteredRows = useMemo(() => {
        return applyGlobalAndLocalFilters(dataset?.data || [], globalFilters, filters, auxiliaryFields);
    }, [dataset?.data, globalFilters, filters, auxiliaryFields]);

    const treePayload = useMemo(() => {
        if (!mapping.nodeField || !mapping.parentField) {
            return { treeData: { name: 'Organization', children: [] }, meta: { totalNodes: 0 } };
        }
        return buildOrgTree(
            filteredRows,
            mapping.nodeField,
            mapping.parentField,
            mapping.labelField,
            mapping.colorField || auxiliaryFields.departmentField
        );
    }, [filteredRows, mapping, auxiliaryFields.departmentField]);

    const chartData = useMemo(() => [{ __orgTree: treePayload.treeData }], [treePayload.treeData]);

    const option = useMemo(() => {
        return buildChartOption(
            ChartType.ORG_CHART,
            chartData,
            {
                ...resolvedConfig,
                assignments: resolvedConfig?.assignments || [],
                nodeField: mapping.nodeField,
                parentField: mapping.parentField,
                labelField: mapping.labelField,
                colorField: mapping.colorField || auxiliaryFields.departmentField,
                orgSearchQuery: searchQuery,
                orgSelectedPathIds: selectedPathIds,
                orgSelectedNodeId: selectedNodeId,
                orgTreeExpandMode,
                orgCollapseDepth: 1,
                style: {
                    ...(resolvedConfig?.style || {}),
                    labelMode: 'show',
                },
            },
            isDark ? 'dark' : 'light',
            'clear',
            'vibrant'
        );
    }, [
        chartData,
        resolvedConfig,
        mapping,
        auxiliaryFields.departmentField,
        searchQuery,
        selectedPathIds,
        selectedNodeId,
        orgTreeExpandMode,
        isDark,
    ]);

    const chartEvents = useMemo(() => ({
        click: (params) => {
            const pathInfo = Array.isArray(params?.treePathInfo) ? params.treePathInfo : [];
            const names = pathInfo.map((p) => p?.name).filter(Boolean);
            const ids = pathInfo
                .map((p) => String(p?.data?.id || p?.data?.key || p?.name || '').trim())
                .filter(Boolean);
            const clickedId = String(params?.data?.id || params?.data?.key || params?.name || '').trim();

            setSelectedPathNames(names);
            setSelectedPathIds(ids);
            setSelectedNodeId(clickedId || ids[ids.length - 1] || '');
        },
    }), []);

    const runZoom = (factor = 1) => {
        const instance = chartRef.current;
        if (!instance) return;
        const width = instance.getWidth();
        const height = instance.getHeight();
        instance.dispatchAction({
            type: 'treeRoam',
            zoom: factor,
            originX: width / 2,
            originY: height / 2,
        });
        setZoomPct((prev) => Math.max(30, Math.min(350, Math.round(prev * factor))));
    };

    const handleReset = () => {
        setSearchQuery('');
        setOrgTreeExpandMode('default');
        setSelectedPathNames([]);
        setSelectedPathIds([]);
        setSelectedNodeId('');
        setFilters({ department: '', location: '', role: '' });
        setZoomPct(100);

        const instance = chartRef.current;
        if (instance) {
            instance.dispatchAction({ type: 'restore' });
        }
    };

    const departmentOptions = useMemo(() => uniqueValues(dataset?.data || [], auxiliaryFields.departmentField), [dataset?.data, auxiliaryFields.departmentField]);
    const locationOptions = useMemo(() => uniqueValues(dataset?.data || [], auxiliaryFields.locationField), [dataset?.data, auxiliaryFields.locationField]);
    const roleOptions = useMemo(() => uniqueValues(dataset?.data || [], auxiliaryFields.roleField), [dataset?.data, auxiliaryFields.roleField]);

    if (!dataset) {
        return (
            <div className={`h-screen flex items-center justify-center ${isDark ? 'bg-gray-950 text-gray-200' : 'bg-gray-50 text-gray-700'}`}>
                <p className="text-sm font-semibold">No dataset available for Org Chart Explorer.</p>
            </div>
        );
    }

    return (
        <div className={`flex flex-col h-screen ${isDark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className={`flex items-center justify-between p-3 border-b ${isDark ? 'border-gray-800' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border ${isDark ? 'border-gray-700 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                    >
                        <ArrowLeft size={14} /> Back
                    </button>
                    <h1 className="text-lg font-semibold">Org Chart Explorer</h1>
                    {orgCharts.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Building2 size={14} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                            <select
                                value={activeOrgChart?.id || ''}
                                onChange={(e) => setActiveOrgChartId(e.target.value)}
                                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border ${isDark ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-700'}`}
                            >
                                {orgCharts.map((c) => (
                                    <option key={c.id} value={c.id}>{c.title || 'Org Chart'}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <button onClick={handleReset} className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${isDark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`}>Reset</button>
                    <button onClick={() => setOrgTreeExpandMode('collapse-all')} className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${isDark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`}>Collapse All</button>
                    <button onClick={() => setOrgTreeExpandMode('expand-all')} className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${isDark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`}>Expand All</button>
                </div>
            </div>

            <div className={`flex items-center gap-3 p-3 border-b ${isDark ? 'border-gray-800' : 'border-gray-200 bg-white'}`}>
                <div className="relative">
                    <Search size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                    <input
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setOrgTreeExpandMode('default');
                        }}
                        placeholder="Search employee..."
                        className={`pl-8 pr-3 py-2 rounded-md w-64 text-sm border ${isDark ? 'bg-gray-900 border-gray-700 text-gray-100 placeholder:text-gray-500' : 'bg-white border-gray-300 text-gray-800 placeholder:text-gray-400'}`}
                    />
                </div>

                <select
                    value={filters.department}
                    onChange={(e) => setFilters((prev) => ({ ...prev, department: e.target.value }))}
                    className={`px-3 py-2 rounded-md text-sm border ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                >
                    <option value="">All Departments</option>
                    {departmentOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>

                <select
                    value={filters.location}
                    onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
                    className={`px-3 py-2 rounded-md text-sm border ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                >
                    <option value="">All Locations</option>
                    {locationOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>

                <select
                    value={filters.role}
                    onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value }))}
                    className={`px-3 py-2 rounded-md text-sm border ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                >
                    <option value="">All Roles</option>
                    {roleOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>

                <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => runZoom(1.15)} className={`p-2 rounded-md border ${isDark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`} title="Zoom in"><ZoomIn size={14} /></button>
                    <button onClick={() => runZoom(0.87)} className={`p-2 rounded-md border ${isDark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`} title="Zoom out"><ZoomOut size={14} /></button>
                    <button onClick={handleReset} className={`p-2 rounded-md border ${isDark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`} title="Reset view"><RotateCcw size={14} /></button>
                    <span className={`text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{zoomPct}%</span>
                </div>
            </div>

            <div className="flex-1 relative">
                <ReactECharts
                    option={option}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                    notMerge={true}
                    lazyUpdate={true}
                    onEvents={chartEvents}
                    onChartReady={(instance) => {
                        chartRef.current = instance;
                    }}
                />
            </div>

            <div className={`p-2 border-t text-sm ${isDark ? 'border-gray-800 text-gray-300' : 'border-gray-200 text-gray-700 bg-white'}`}>
                {selectedPathNames.length > 0
                    ? selectedPathNames.join(' / ')
                    : 'Organization'}
                <span className={`ml-3 text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    {`${toLabel(mapping.nodeField)} → ${toLabel(mapping.parentField)} • ${treePayload?.meta?.totalNodes || 0} nodes`}
                </span>
            </div>
        </div>
    );
};

export default OrgChartPage;
