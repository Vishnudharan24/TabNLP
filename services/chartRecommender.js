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

export function profileColumns(columns = [], rows = []) {
    const safeColumns = Array.isArray(columns) ? columns : [];
    const safeRows = Array.isArray(rows) ? rows : [];

    return safeColumns.map((col) => {
        const kind = normalizeColType(col?.type);
        const values = safeRows.map(r => r?.[col.name]);
        const nonNull = values.filter(v => !(v === null || v === undefined || v === ''));
        const nullRatio = values.length > 0
            ? (values.length - nonNull.length) / values.length
            : 0;
        const cardinality = new Set(nonNull.map(v => String(v))).size;

        const numericVals = kind === 'numeric'
            ? nonNull.map(toFiniteNumber).filter(v => v !== null)
            : [];

        return {
            name: col.name,
            sourceType: col.type,
            kind,
            cardinality,
            nullRatio,
            variance: numericVals.length > 1 ? variance(numericVals) : 0,
            sampleCount: nonNull.length,
        };
    });
}

const buildProfile = (columnProfiles = [], selected = {}) => {
    const byName = Object.fromEntries(columnProfiles.map(p => [p.name, p]));
    const selectedMeasures = Array.isArray(selected.measures) ? selected.measures : [];
    const selectedDimension = selected.dimension || null;

    const numeric = columnProfiles.filter(c => c.kind === 'numeric');
    const categorical = columnProfiles.filter(c => c.kind === 'categorical');
    const time = columnProfiles.filter(c => c.kind === 'time');

    const selectedNumeric = selectedMeasures
        .map(name => byName[name])
        .filter(c => c?.kind === 'numeric');

    const numericCount = selectedNumeric.length > 0 ? selectedNumeric.length : numeric.length;
    const categoricalCount = selectedDimension
        ? (byName[selectedDimension]?.kind === 'categorical' ? 1 : 0)
        : categorical.length;

    const dimensionProfile = selectedDimension ? byName[selectedDimension] : null;

    const firstCategorical = [...categorical].sort((a, b) => (a.cardinality || 999999) - (b.cardinality || 999999))[0] || null;

    return {
        byName,
        columns: columnProfiles,
        numeric,
        categorical,
        time,
        numericCount,
        categoricalCount,
        hasNumeric: numericCount > 0,
        hasCategorical: categoricalCount > 0,
        hasTime: (dimensionProfile?.kind === 'time') || time.length > 0,
        isTimeSeries: (dimensionProfile?.kind === 'time') && numericCount > 0,
        isHighCardinality: (firstCategorical?.cardinality || 0) > 30,
        selected,
    };
};

const confidenceFromScore = (score) => clamp(Number(score || 0) / 100, 0, 1);

export function scoreChart(chartType, profile, selectedFields = {}) {
    const type = toCanonicalChart(chartType);
    const measuresCount = Array.isArray(selectedFields.measures) && selectedFields.measures.length > 0
        ? selectedFields.measures.length
        : profile.numericCount;

    let score = 28;
    const reasons = [];

    const add = (points, reason) => {
        score += points;
        if (reason) reasons.push(reason);
    };

    if (profile.isTimeSeries) add(12, 'Detected time-series structure');
    if (profile.hasCategorical && profile.hasNumeric) add(8, 'Detected categorical + numeric mix');

    switch (type) {
        case ChartType.LINE:
            if (profile.hasTime && profile.hasNumeric) add(54, 'Line is strongest for time + numeric trends');
            else if (profile.hasNumeric) add(20, 'Line can still show trend across categories');
            break;
        case ChartType.AREA:
            if (profile.hasTime && profile.hasNumeric) add(50, 'Area highlights time trend with magnitude');
            else if (profile.hasNumeric) add(18, 'Area can visualize cumulative movement');
            break;
        case ChartType.BAR:
            if (profile.hasCategorical && profile.hasNumeric) add(56, 'Bar is best for categorical comparisons');
            else if (profile.hasCategorical) add(36, 'Bar can use count aggregation for categorical-only data');
            else if (profile.hasNumeric) add(12, 'Bar can compare numeric buckets with fallback dimension');
            break;
        case ChartType.SCATTER:
            if (profile.numericCount >= 2) add(56, 'Detected two numeric measures suitable for correlation');
            else if (profile.numericCount === 1) add(12, 'Scatter can still render with duplicated numeric fallback');
            break;
        case ChartType.BUBBLE:
            if (profile.numericCount >= 3) add(58, 'Detected three numeric measures for bubble size encoding');
            else if (profile.numericCount >= 2) add(22, 'Bubble can fallback with synthetic size');
            break;
        case ChartType.HEATMAP:
            if (profile.categoricalCount >= 2 && profile.hasNumeric) add(52, 'Detected matrix pattern (2 categorical + numeric)');
            else if (profile.hasCategorical && profile.hasNumeric) add(22, 'Heatmap can fallback with generated matrix axes');
            break;
        case ChartType.TREEMAP:
            if (profile.categoricalCount >= 2 && profile.hasNumeric) add(48, 'Hierarchical categorical structure detected');
            else if (profile.hasCategorical) add(26, 'Treemap can still group a single category dimension');
            break;
        case ChartType.SUNBURST:
            if (profile.categoricalCount >= 2 && profile.hasNumeric) add(46, 'Hierarchical composition is a strong sunburst fit');
            else if (profile.hasCategorical) add(24, 'Sunburst can fallback to shallow hierarchy');
            break;
        case ChartType.PIE:
        case ChartType.DONUT:
            if (profile.hasCategorical && profile.hasNumeric) add(44, 'Part-to-whole composition detected');
            else if (profile.hasCategorical) add(26, 'Part-to-whole via count aggregation fallback');
            break;
        case ChartType.COMBO_BAR_LINE:
            if (profile.hasCategorical && profile.numericCount >= 2) add(50, 'Two measures + category fit combo comparison');
            else if (profile.hasNumeric) add(22, 'Combo can fallback with reduced series');
            break;
        case ChartType.RADAR:
            if (profile.numericCount >= 3) add(48, 'Multiple numeric measures fit radar profile comparison');
            else if (profile.numericCount >= 2) add(24, 'Radar can still compare two metrics');
            break;
        case ChartType.GAUGE:
            if (profile.numericCount >= 1) add(38, 'Gauge can summarize a single numeric KPI');
            break;
        case ChartType.SPARKLINE:
            if (profile.hasTime && profile.hasNumeric) add(40, 'Sparkline is useful for compact time trends');
            else if (profile.hasNumeric) add(20, 'Sparkline can fallback to numeric sequence');
            break;
        case ChartType.KPI_SINGLE:
            if (profile.hasNumeric) add(40, 'KPI works with any numeric metric');
            break;
        case ChartType.TABLE:
            add(12, 'Table always works as universal fallback');
            break;
        default:
            add(6, 'Fallback compatibility score');
            break;
    }

    if (profile.isHighCardinality && [ChartType.PIE, ChartType.DONUT].includes(type)) {
        score -= 28;
        reasons.push('High-cardinality category penalizes pie/donut readability');
    }
    if (profile.isHighCardinality && [ChartType.BAR, ChartType.HEATMAP].includes(type)) {
        score -= 14;
        reasons.push('High-cardinality axis can reduce readability');
    }
    if (measuresCount > 5 && [ChartType.BAR, ChartType.LINE, ChartType.AREA, ChartType.RADAR, ChartType.COMBO_BAR_LINE].includes(type)) {
        score -= 12;
        reasons.push('Too many measures for a clean visual (>5)');
    }
    if (!profile.hasNumeric && ![ChartType.BAR, ChartType.PIE, ChartType.DONUT, ChartType.TABLE].includes(type)) {
        score -= 18;
        reasons.push('No numeric measure available; heavy fallback required');
    }

    return {
        type,
        score: clamp(Math.round(score), 1, 99),
        reason: reasons[0] || 'General fit based on inferred dataset shape',
        reasons,
        confidence: confidenceFromScore(score),
    };
}

const pickBest = (items = [], compare = (a, b) => b - a) => [...items].sort(compare)[0] || null;

const pickCategoricalForAxis = (profile) => pickBest(
    profile.categorical,
    (a, b) => {
        const cardA = Number.isFinite(a.cardinality) ? a.cardinality : 999999;
        const cardB = Number.isFinite(b.cardinality) ? b.cardinality : 999999;
        return cardA - cardB;
    }
);

const pickNumericByVariance = (profile, count = 1) => [...profile.numeric]
    .sort((a, b) => (b.variance || 0) - (a.variance || 0))
    .slice(0, count);

const resolveChartMode = (type, profile) => {
    if (type === ChartType.BAR) {
        if (profile.numericCount >= 2) return 'stacked';
        return 'clustered';
    }
    if (type === ChartType.LINE) {
        return profile.hasTime ? 'smooth' : 'straight';
    }
    if (type === ChartType.AREA) {
        return profile.numericCount >= 2 ? 'stacked' : 'smooth';
    }
    return undefined;
};

export function assignRoles(chartType, columns, rows = [], selectedFields = {}) {
    const columnProfiles = profileColumns(columns, rows);
    const profile = buildProfile(columnProfiles, selectedFields);
    const type = toCanonicalChart(chartType);
    const byName = profile.byName;

    const selectedDimension = selectedFields.dimension && byName[selectedFields.dimension]
        ? selectedFields.dimension
        : null;
    const selectedNumericMeasures = (Array.isArray(selectedFields.measures) ? selectedFields.measures : [])
        .filter(name => byName[name]?.kind === 'numeric');

    const topNumeric = pickNumericByVariance(profile, 3).map(c => c.name);
    const timeX = profile.time[0]?.name || null;
    const catX = selectedDimension || pickCategoricalForAxis(profile)?.name || profile.columns[0]?.name || null;
    const yPrimary = selectedNumericMeasures[0] || topNumeric[0] || null;
    const ySecondary = selectedNumericMeasures[1] || topNumeric[1] || null;
    const yTertiary = selectedNumericMeasures[2] || topNumeric[2] || null;
    const secondCategorical = profile.categorical
        .filter(c => c.name !== catX)
        .sort((a, b) => (a.cardinality || 999999) - (b.cardinality || 999999))[0]?.name || null;

    const fallbackMeasure = yPrimary;
    const shouldUseCountFallback = !fallbackMeasure;

    const assignments = {
        xAxis: catX,
        yAxis: fallbackMeasure,
        legend: secondCategorical,
        size: null,
        hierarchy: [catX, secondCategorical].filter(Boolean),
        aggregation: shouldUseCountFallback ? 'COUNT' : 'SUM',
        warnings: [],
    };

    if (type === ChartType.LINE || type === ChartType.AREA || type === ChartType.SPARKLINE) {
        assignments.xAxis = timeX || catX;
        assignments.yAxis = fallbackMeasure;
        if (!timeX) assignments.warnings.push('No time column found. Using categorical axis for trend rendering.');
    }

    if (type === ChartType.SCATTER) {
        assignments.xAxis = yPrimary || fallbackMeasure;
        assignments.yAxis = ySecondary || yPrimary || fallbackMeasure;
        assignments.legend = catX;
        if (!ySecondary) assignments.warnings.push('Only one numeric measure found. Using duplicated axis fallback.');
    }

    if (type === ChartType.BUBBLE) {
        assignments.xAxis = yPrimary || fallbackMeasure;
        assignments.yAxis = ySecondary || yPrimary || fallbackMeasure;
        assignments.size = yTertiary || ySecondary || yPrimary || fallbackMeasure;
        assignments.legend = catX;
        if (!yTertiary) assignments.warnings.push('Third numeric column missing. Reusing available measure for bubble size.');
    }

    if (type === ChartType.HEATMAP) {
        assignments.xAxis = catX;
        assignments.yAxis = secondCategorical || catX;
        if (!secondCategorical) assignments.warnings.push('Second categorical column missing. Heatmap will repeat category axis as fallback.');
    }

    if (type === ChartType.TREEMAP || type === ChartType.SUNBURST) {
        const sortedCategorical = [...profile.categorical]
            .sort((a, b) => (a.cardinality || 999999) - (b.cardinality || 999999));

        const saferHierarchy = sortedCategorical
            .filter((c) => !isRiskyHierarchyField(c.name) && (c.cardinality || 0) <= 50)
            .map(c => c.name);

        const fallbackHierarchy = sortedCategorical
            .filter((c) => !isRiskyHierarchyField(c.name))
            .map(c => c.name);

        const pickedHierarchy = (saferHierarchy.length > 0 ? saferHierarchy : fallbackHierarchy)
            .slice(0, 3);

        assignments.hierarchy = pickedHierarchy.length > 0
            ? pickedHierarchy
            : [catX, secondCategorical].filter(Boolean);
        assignments.yAxis = fallbackMeasure;
        if (assignments.hierarchy.length < 2) {
            assignments.warnings.push('Shallow hierarchy detected. Using single-level grouping.');
        }

        const riskySelected = [catX, secondCategorical]
            .filter(Boolean)
            .filter((field) => isRiskyHierarchyField(field));
        if (riskySelected.length > 0) {
            assignments.warnings.push('Detected ID/name/email-like hierarchy fields. Replaced with safer lower-cardinality hierarchy fields.');
        }

        const highCardHierarchy = sortedCategorical
            .filter((c) => assignments.hierarchy.includes(c.name) && (c.cardinality || 0) > 50)
            .map(c => `${c.name} (${c.cardinality})`);
        if (highCardHierarchy.length > 0) {
            assignments.warnings.push(`High-cardinality hierarchy fields detected: ${highCardHierarchy.join(', ')}. Small nodes may be grouped into Others.`);
        }
    }

    if (type === ChartType.GAUGE || type === ChartType.KPI_SINGLE) {
        assignments.xAxis = null;
        assignments.legend = null;
        assignments.yAxis = fallbackMeasure;
        assignments.aggregation = fallbackMeasure ? 'SUM' : 'COUNT';
    }

    if (type === ChartType.PIE || type === ChartType.DONUT || type === ChartType.BAR) {
        assignments.xAxis = catX;
        assignments.yAxis = fallbackMeasure;
        if (!catX) assignments.warnings.push('No categorical field available. Using first column as category fallback.');
    }

    if (profile.isHighCardinality) {
        assignments.warnings.push('High-cardinality category detected. Consider filtering or top-N before charting.');
    }

    const measures = [assignments.yAxis].filter(Boolean);
    if (type === ChartType.SCATTER || type === ChartType.BUBBLE) {
        measures.length = 0;
        [assignments.xAxis, assignments.yAxis, assignments.size].filter(Boolean).forEach((m) => {
            if (!measures.includes(m)) measures.push(m);
        });
    }
    if (type === ChartType.COMBO_BAR_LINE || type === ChartType.RADAR) {
        [yPrimary, ySecondary].filter(Boolean).forEach((m) => {
            if (!measures.includes(m)) measures.push(m);
        });
    }

    const autoAssignments = autoAssignFields(columnProfiles, type);
    const assignmentConfig = configFromAssignments(type, autoAssignments);

    return {
        chartType: type,
        type,
        dimension: assignments.xAxis || catX || '',
        measures,
        xAxis: assignments.xAxis,
        yAxis: assignments.yAxis,
        legend: assignments.legend,
        size: assignments.size,
        hierarchy: assignments.hierarchy,
        aggregation: assignments.aggregation,
        axisMode: 'auto',
        mode: resolveChartMode(type, profile),
        warnings: assignments.warnings,
        assignments: autoAssignments,
        ...assignmentConfig,
    };
}

const getFallbackChart = (profile) => {
    if (profile.numericCount === 1 && !profile.hasCategorical && !profile.hasTime) return ChartType.KPI_SINGLE;
    if (profile.numericCount === 0 && profile.hasCategorical) return ChartType.BAR;
    if (profile.numericCount >= 2) return ChartType.SCATTER;
    if (profile.hasTime && profile.numericCount >= 1) return ChartType.LINE;
    return ChartType.BAR;
};

export function recommendCharts(columns, dimension, measures, options = {}) {
    const rows = Array.isArray(options?.rows) ? options.rows : [];
    const selected = {
        dimension,
        measures: Array.isArray(measures) ? measures : [],
    };

    const columnProfiles = profileColumns(columns, rows);
    const profile = buildProfile(columnProfiles, selected);
    const scoreMap = new Map();

    SUPPORTED_RECOMMENDATION_CHARTS.forEach((chart) => {
        const scored = scoreChart(chart, profile, selected);
        const existing = scoreMap.get(scored.type);
        if (!existing || existing.score < scored.score) {
            scoreMap.set(scored.type, scored);
        }
    });

    let ranked = Array.from(scoreMap.values())
        .sort((a, b) => b.score - a.score)
        .map((entry, idx, arr) => {
            const top = arr[0]?.score || 100;
            const relative = top > 0 ? clamp(entry.score / top, 0.05, 1) : 0.05;
            return {
                type: entry.type,
                score: entry.score,
                confidence: Number(relative.toFixed(2)),
                reason: entry.reason,
                reasons: entry.reasons,
                rank: idx + 1,
            };
        });

    if (ranked.length === 0) {
        ranked = [{
            type: getFallbackChart(profile),
            score: 50,
            confidence: 0.5,
            reason: 'Fallback recommendation based on available columns',
            reasons: ['Fallback recommendation based on available columns'],
            rank: 1,
        }];
    }

    return ranked;
}

export function recommendVisualization(columns, rows = [], selectedFields = {}) {
    const rankedRecommendations = recommendCharts(
        columns,
        selectedFields.dimension,
        selectedFields.measures,
        { rows }
    );

    const recommendedChart = rankedRecommendations[0]?.type || ChartType.BAR;
    const config = assignRoles(recommendedChart, columns, rows, selectedFields);
    const top = rankedRecommendations[0] || { score: 50, confidence: 0.5, reason: 'Fallback recommendation' };

    const validation = validateRoleConfig({ chartType: recommendedChart, assignments: config.assignments || [] }, columns);
    const explanation = top.reason
        ? `${top.reason}. Auto-assigned ${config.xAxis || 'fallback dimension'} on X and ${config.yAxis || 'count aggregation'} on Y.`
        : 'Recommended a fallback chart and assigned default axis roles.';

    return {
        recommendedChart,
        rankedCharts: rankedRecommendations.map(r => r.type),
        rankedRecommendations,
        config,
        explanation,
        score: top.score,
        confidence: top.confidence,
        warnings: [...(config.warnings || []), ...(validation.warnings || [])],
        profile: profileColumns(columns, rows),
    };
}

    export { autoAssignFields, convertOldConfig, validateRoleConfig as validateConfig };