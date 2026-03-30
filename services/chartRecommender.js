import { ChartType } from '../types';
import {
    autoAssignFields,
    configFromAssignments,
    convertOldConfig,
    validateConfig as validateRoleConfig,
} from './chartConfigSystem';

const SUPPORTED_RECOMMENDATION_CHARTS = [
    ChartType.BAR,
    ChartType.LINE,
    ChartType.AREA,
    ChartType.PIE,
    ChartType.DONUT,
    ChartType.SCATTER,
    ChartType.BUBBLE,
    ChartType.HEATMAP,
    ChartType.ORG_CHART,
    ChartType.TREEMAP,
    ChartType.SUNBURST,
    ChartType.COMBO_BAR_LINE,
    ChartType.GAUGE,
    ChartType.SPARKLINE,
    ChartType.RADAR,
    ChartType.KPI_SINGLE,
    ChartType.TABLE,
];

const CHART_ALIASES = {
    [ChartType.BAR_CLUSTERED]: ChartType.BAR,
    [ChartType.BAR_STACKED]: ChartType.BAR,
    [ChartType.BAR_PERCENT]: ChartType.BAR,
    [ChartType.BAR_HORIZONTAL]: ChartType.BAR,
    [ChartType.BAR_HORIZONTAL_STACKED]: ChartType.BAR,
    [ChartType.BAR_HORIZONTAL_PERCENT]: ChartType.BAR,
    [ChartType.LINE_SMOOTH]: ChartType.LINE,
    [ChartType.LINE_STRAIGHT]: ChartType.LINE,
    [ChartType.LINE_STEP]: ChartType.LINE,
    [ChartType.LINE_DASHED]: ChartType.LINE,
    [ChartType.LINE_MULTI_AXIS]: ChartType.LINE,
    [ChartType.AREA_SMOOTH]: ChartType.AREA,
    [ChartType.AREA_STACKED]: ChartType.AREA,
    [ChartType.AREA_PERCENT]: ChartType.AREA,
    [ChartType.AREA_STEP]: ChartType.AREA,
};

const toCanonicalChart = (chartType) => CHART_ALIASES[chartType] || chartType;

const HIERARCHY_RISKY_FIELD_REGEX = /(\b(id|employee\s*id|emp\s*id|email|mail|name|full\s*name|first\s*name|last\s*name)\b)/i;
const isRiskyHierarchyField = (fieldName = '') => HIERARCHY_RISKY_FIELD_REGEX.test(String(fieldName || ''));
const ORG_HINT_REGEX = /(employee|emp|manager|supervisor|report|reports\s*to|parent|org|designation|title|department|dept)/i;

const normalizeColType = (type) => {
    if (type === 'number') return 'numeric';
    if (type === 'date' || type === 'datetime') return 'time';
    return 'categorical';
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const percentile = (values = [], p = 0.5) => {
    if (!Array.isArray(values) || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
};

const variance = (values = []) => {
    if (!Array.isArray(values) || values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return values.reduce((s, v) => s + ((v - mean) ** 2), 0) / values.length;
};

const DEFAULT_CHARTS = [
    ChartType.BAR,
    ChartType.LINE,
    ChartType.AREA,
    ChartType.PIE,
    ChartType.DONUT,
    ChartType.SCATTER,
    ChartType.BUBBLE,
    ChartType.HEATMAP,
    ChartType.TREEMAP,
    ChartType.SUNBURST,
    ChartType.COMBO_BAR_LINE,
    ChartType.GAUGE,
    ChartType.SPARKLINE,
    ChartType.RADAR,
    ChartType.KPI_SINGLE,
    ChartType.TABLE,
    ChartType.ORG_TREE_STRUCTURED,
];

const ROLE_COMPATIBILITY = {
    x: new Set(['dimension', 'time', 'id']),
    time: new Set(['time']),
    y: new Set(['measure', 'id', 'dimension']),
    value: new Set(['measure', 'id', 'dimension']),
    size: new Set(['measure']),
    legend: new Set(['dimension', 'time']),
    hierarchy: new Set(['dimension', 'time']),
    node: new Set(['dimension', 'id']),
    parent: new Set(['dimension', 'id']),
    label: new Set(['dimension', 'time']),
    color: new Set(['dimension', 'time']),
};

const CHART_HELPERS = {
    [ChartType.BAR]: 'Bar Chart requires 1 Dimension + 1 Measure',
    [ChartType.LINE]: 'Line Chart requires Time/Dimension + 1 Measure',
    [ChartType.AREA]: 'Area Chart requires Time/Dimension + 1 Measure',
    [ChartType.PIE]: 'Pie Chart requires 1 Category + 1 Value',
    [ChartType.DONUT]: 'Donut Chart requires 1 Category + 1 Value',
    [ChartType.SCATTER]: 'Scatter Chart requires 2 Measures',
    [ChartType.BUBBLE]: 'Bubble Chart requires 3 Measures (X, Y, Size)',
    [ChartType.HEATMAP]: 'Heatmap requires 2 Dimensions + 1 Measure',
    [ChartType.TREEMAP]: 'Treemap requires hierarchy fields + 1 value',
    [ChartType.SUNBURST]: 'Sunburst requires hierarchy fields + 1 value',
    [ChartType.COMBO_BAR_LINE]: 'Combo requires 1 X field + 2 Measures',
    [ChartType.GAUGE]: 'Gauge requires a single measure',
    [ChartType.SPARKLINE]: 'Sparkline requires Time + Measure',
    [ChartType.RADAR]: 'Radar requires 1 Dimension + multiple Measures',
    [ChartType.KPI_SINGLE]: 'KPI requires a single measure',
    [ChartType.TABLE]: 'Table supports any fields',
    [ChartType.ORG_CHART]: 'Org Chart requires Node + Parent',
    [ChartType.ORG_TREE_STRUCTURED]: 'Org Structured requires Node + Parent',
};

const scoreByRule = ({ dims, measures, times }, chart) => {
    if (chart === ChartType.BAR && dims >= 1 && measures >= 1) return 90;
    if (chart === ChartType.LINE && times >= 1 && measures >= 1) return 95;
    if (chart === ChartType.AREA && times >= 1 && measures >= 1) return 90;
    if (chart === ChartType.SCATTER && measures >= 2) return 85;
    if (chart === ChartType.BUBBLE && measures >= 3) return 83;
    if (chart === ChartType.RADAR && dims >= 1 && measures >= 2) return 75;
    if ([ChartType.TREEMAP, ChartType.SUNBURST].includes(chart) && dims >= 2 && measures >= 1) return 80;
    if (chart === ChartType.COMBO_BAR_LINE && (dims >= 1 || times >= 1) && measures >= 2) return 80;
    if ([ChartType.KPI_SINGLE, ChartType.GAUGE].includes(chart) && measures >= 1) return 60;
    if ([ChartType.PIE, ChartType.DONUT].includes(chart) && dims >= 1 && measures >= 1) return 75;
    if (chart === ChartType.HEATMAP && dims >= 2 && measures >= 1) return 78;
    if (chart === ChartType.SPARKLINE && times >= 1 && measures >= 1) return 88;
    if (chart === ChartType.TABLE) return 50;
    if ([ChartType.ORG_CHART, ChartType.ORG_TREE_STRUCTURED].includes(chart) && dims >= 2) return 82;
    return 35;
};

const toFieldType = (columnProfile) => {
    if (!columnProfile) return 'dimension';
    if (columnProfile.kind === 'numeric') return 'measure';
    if (columnProfile.kind === 'time') return 'time';
    if (columnProfile.kind === 'id') return 'id';
    return 'dimension';
};

const parseDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const detectFieldKind = (declaredType, values = []) => {
    const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
    const uniqueCount = new Set(nonNull.map(v => String(v))).size;
    const uniqueRatio = nonNull.length > 0 ? uniqueCount / nonNull.length : 0;

    const numericCount = nonNull.filter(v => toFiniteNumber(v) !== null).length;
    const dateCount = nonNull.filter(v => parseDate(v) !== null).length;

    const numericRatio = nonNull.length > 0 ? numericCount / nonNull.length : 0;
    const dateRatio = nonNull.length > 0 ? dateCount / nonNull.length : 0;

    if (uniqueRatio > 0.95 && nonNull.length > 1) return 'id';
    if (declaredType === 'number' || numericRatio >= 0.9) return 'numeric';
    if (declaredType === 'date' || declaredType === 'datetime' || dateRatio >= 0.9) return 'time';
    return 'categorical';
};

export function profileColumns(columns = [], rows = []) {
    const safeColumns = Array.isArray(columns) ? columns : [];
    const safeRows = Array.isArray(rows) ? rows : [];

    return safeColumns.map((col) => {
        const values = safeRows.map(r => r?.[col.name]);
        const nonNull = values.filter(v => !(v === null || v === undefined || v === ''));
        const nullRatio = values.length > 0 ? (values.length - nonNull.length) / values.length : 0;
        const cardinality = new Set(nonNull.map(v => String(v))).size;
        const kind = detectFieldKind(col?.type, values);

        return {
            name: col.name,
            sourceType: col.type,
            kind,
            cardinality,
            nullRatio,
            sampleValues: nonNull.slice(0, 5),
            variance: kind === 'numeric' ? variance(nonNull.map(toFiniteNumber).filter(v => v !== null)) : 0,
            sampleCount: nonNull.length,
        };
    });
}

const buildProfile = (columnProfiles = []) => {
    const byName = Object.fromEntries(columnProfiles.map(p => [p.name, p]));
    const numeric = columnProfiles.filter(c => c.kind === 'numeric');
    const categorical = columnProfiles.filter(c => c.kind === 'categorical');
    const time = columnProfiles.filter(c => c.kind === 'time');
    const ids = columnProfiles.filter(c => c.kind === 'id');
    return {
        byName,
        columns: columnProfiles,
        numeric,
        categorical,
        time,
        ids,
    };
};

export function getChartRequirementText(chartType) {
    return CHART_HELPERS[toCanonicalChart(chartType)] || CHART_HELPERS[ChartType.BAR];
}

export function isFieldCompatibleWithRole(chartType, role, column = {}) {
    if (toCanonicalChart(chartType) === ChartType.TABLE) return true;
    const expected = ROLE_COMPATIBILITY[role];
    if (!expected) return true;
    const profile = {
        kind: detectFieldKind(column?.type, []),
    };
    return expected.has(toFieldType(profile));
}

export function getAllowedAggregationsForField(column = {}) {
    const fieldKind = detectFieldKind(column?.type, []);
    if (fieldKind === 'id') return ['COUNT'];
    if (fieldKind === 'numeric') return ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'];
    return ['GROUP_BY', 'COUNT'];
}

const pick = (arr = [], idx = 0) => arr[idx]?.name || null;

export function assignRoles(chartType, columns, rows = [], selectedFields = {}) {
    const type = toCanonicalChart(chartType);
    const profile = buildProfile(profileColumns(columns, rows));
    const x = selectedFields.dimension || pick(profile.categorical) || pick(profile.time) || pick(profile.ids);
    const t = pick(profile.time);
    const m1 = (selectedFields.measures || [])[0] || pick(profile.numeric);
    const m2 = (selectedFields.measures || [])[1] || pick(profile.numeric, 1) || m1;
    const m3 = (selectedFields.measures || [])[2] || pick(profile.numeric, 2) || m2;
    const d2 = pick(profile.categorical, 1) || x;

    const assignments = [];
    const push = (field, role, fallbackAgg = 'SUM') => {
        if (!field) return;
        const col = (Array.isArray(columns) ? columns : []).find(c => c.name === field) || { type: 'string' };
        const allowed = getAllowedAggregationsForField(col);
        const aggregation = ['x', 'y', 'value', 'size'].includes(role)
            ? (allowed.includes(fallbackAgg) ? fallbackAgg : allowed[0])
            : undefined;
        assignments.push({ field, role, aggregation });
    };

    if ([ChartType.ORG_CHART, ChartType.ORG_TREE_STRUCTURED].includes(type)) {
        const node = pick(profile.categorical) || pick(profile.ids);
        const parent = pick(profile.categorical, 1) || pick(profile.ids, 1) || node;
        const label = pick(profile.categorical, 2) || node;
        push(node, 'node');
        push(parent, 'parent');
        push(label, 'label');
    } else if (type === ChartType.BAR) {
        push(x, 'x');
        push(m1 || '__count__', 'y', m1 ? 'SUM' : 'COUNT');
    } else if ([ChartType.LINE, ChartType.AREA].includes(type)) {
        push(t || x, t ? 'time' : 'x');
        push(m1 || '__count__', 'y', m1 ? 'SUM' : 'COUNT');
    } else if ([ChartType.PIE, ChartType.DONUT].includes(type)) {
        push(x, 'legend');
        push(m1 || '__count__', 'value', m1 ? 'SUM' : 'COUNT');
    } else if (type === ChartType.SCATTER) {
        push(m1 || '__count__', 'x', m1 ? 'AVG' : 'COUNT');
        push(m2 || m1 || '__count__', 'y', m2 ? 'AVG' : 'COUNT');
    } else if (type === ChartType.BUBBLE) {
        push(m1 || '__count__', 'x', m1 ? 'AVG' : 'COUNT');
        push(m2 || m1 || '__count__', 'y', m2 ? 'AVG' : 'COUNT');
        push(m3 || m2 || m1 || '__count__', 'size', m3 ? 'SUM' : 'COUNT');
    } else if (type === ChartType.HEATMAP) {
        push(x, 'x');
        push(d2, 'y');
        push(m1 || '__count__', 'value', m1 ? 'SUM' : 'COUNT');
    } else if ([ChartType.TREEMAP, ChartType.SUNBURST].includes(type)) {
        [x, d2, pick(profile.categorical, 2)].filter(Boolean).forEach(f => push(f, 'hierarchy'));
        push(m1 || '__count__', 'value', m1 ? 'SUM' : 'COUNT');
    } else if (type === ChartType.COMBO_BAR_LINE) {
        push(t || x, t ? 'time' : 'x');
        push(m1 || '__count__', 'y', m1 ? 'SUM' : 'COUNT');
        push(m2 || m1 || '__count__', 'y', m2 ? 'AVG' : 'COUNT');
    } else if (type === ChartType.GAUGE || type === ChartType.KPI_SINGLE) {
        push(m1 || '__count__', 'value', m1 ? 'SUM' : 'COUNT');
    } else if (type === ChartType.SPARKLINE) {
        push(t || x, t ? 'time' : 'x');
        push(m1 || '__count__', 'y', m1 ? 'SUM' : 'COUNT');
    } else if (type === ChartType.RADAR) {
        push(x, 'legend');
        [m1, m2, m3].filter(Boolean).forEach(f => push(f, 'y', 'AVG'));
        if (!m1) push('__count__', 'y', 'COUNT');
    }

    const merged = configFromAssignments(type, assignments);
    return {
        type,
        mode: type === ChartType.LINE ? 'smooth' : 'auto',
        assignments,
        helperText: getChartRequirementText(type),
        ...merged,
    };
}

export function scoreChart(chartType, profile) {
    const count = {
        dims: profile.categorical.length,
        measures: profile.numeric.length,
        times: profile.time.length,
    };
    const type = toCanonicalChart(chartType);
    const score = scoreByRule(count, type);
    return {
        type,
        score,
        reason: getChartRequirementText(type),
        reasons: [getChartRequirementText(type)],
        confidence: Number((score / 100).toFixed(2)),
    };
}

export function recommendCharts(columns, _dimension, _measures, options = {}) {
    const rows = Array.isArray(options?.rows) ? options.rows : [];
    const profile = buildProfile(profileColumns(columns, rows));

    return DEFAULT_CHARTS
        .map((type) => scoreChart(type, profile))
        .sort((a, b) => b.score - a.score)
        .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

export function recommendVisualization(columns, rows = [], selectedFields = {}) {
    const rankedRecommendations = recommendCharts(columns, selectedFields.dimension, selectedFields.measures, { rows });
    const recommendedChart = rankedRecommendations[0]?.type || ChartType.BAR;
    const config = assignRoles(recommendedChart, columns, rows, selectedFields);
    const validation = validateRoleConfig({ chartType: recommendedChart, assignments: config.assignments || [] }, columns);

    return {
        recommendedChart,
        rankedCharts: rankedRecommendations.map(r => r.type),
        rankedRecommendations,
        config,
        explanation: `${getChartRequirementText(recommendedChart)}. Auto-assignment applied.`,
        score: rankedRecommendations[0]?.score || 50,
        confidence: rankedRecommendations[0]?.confidence || 0.5,
        warnings: [...(validation.warnings || [])],
        profile: profileColumns(columns, rows),
    };
}

export { autoAssignFields, convertOldConfig, validateRoleConfig as validateConfig };