import { ChartType } from '../types';

export function recommendCharts(columns, dimension, measures) {
    const allColumns = Array.isArray(columns) ? columns : [];
    const colByName = Object.fromEntries(allColumns.map(c => [c.name, c]));

    const numericCols = allColumns.filter(c => c.type === 'number');
    const categoricalCols = allColumns.filter(c => c.type === 'string');
    const dateCols = allColumns.filter(c => c.type === 'date');
    const booleanCols = allColumns.filter(c => c.type === 'boolean');

    const selectedMeasures = Array.isArray(measures)
        ? measures.map(m => colByName[m]).filter(Boolean)
        : [];

    const selectedNumericMeasures = selectedMeasures.filter(c => c.type === 'number');

    const dimensionCol = dimension ? colByName[dimension] : null;

    // ─────────────────────────────────────────────
    // ✅ CONTEXT
    // ─────────────────────────────────────────────
    const numericCount = selectedNumericMeasures.length || numericCols.length;
    const categoricalCount = dimensionCol ? 1 : (categoricalCols.length + booleanCols.length);

    const ctx = {
        hasNumeric: numericCount > 0,
        hasCategorical: categoricalCount > 0,
        hasDate: dimensionCol?.type === 'date' || dateCols.length > 0,

        numericCount,
        categoricalCount,

        isTimeSeries: dimensionCol?.type === 'date' && numericCount > 0,
        isSingleMetric: numericCount === 1,
        isMultiMetric: numericCount >= 2,
        isHighCardinality: categoricalCount > 8,
        hasHierarchy: categoricalCols.length >= 2
    };

    // ─────────────────────────────────────────────
    // ✅ RULES (ALL CHARTS COVERED)
    // ─────────────────────────────────────────────
    const RULES = [

        // 📈 LINE CHARTS
        { chart: ChartType.LINE_SMOOTH, score: 96, when: c => c.isTimeSeries, reason: () => 'Smooth time-series trend' },
        { chart: ChartType.LINE_STRAIGHT, score: 92, when: c => c.isTimeSeries, reason: () => 'Precise trend tracking' },
        { chart: ChartType.LINE_STEP, score: 80, when: c => c.isTimeSeries, reason: () => 'Step-wise changes' },
        { chart: ChartType.LINE_DASHED, score: 70, when: c => c.isTimeSeries, reason: () => 'Alternative visual emphasis' },
        { chart: ChartType.LINE_MULTI_AXIS, score: 78, when: c => c.isTimeSeries && c.numericCount >= 2, reason: () => 'Different scale comparison' },

        // 📊 AREA CHARTS
        { chart: ChartType.AREA_SMOOTH, score: 88, when: c => c.isTimeSeries, reason: () => 'Trend with volume emphasis' },
        { chart: ChartType.AREA_STEP, score: 75, when: c => c.isTimeSeries, reason: () => 'Stepped area trend' },
        { chart: ChartType.AREA_STACKED, score: 85, when: c => c.isTimeSeries && c.numericCount >= 2, reason: () => 'Cumulative trend' },
        { chart: ChartType.AREA_PERCENT, score: 82, when: c => c.isTimeSeries && c.numericCount >= 2, reason: () => 'Proportional trend' },
        { chart: ChartType.AREA_GRADIENT, score: 65, when: c => c.isTimeSeries, reason: () => 'Styled trend' },
        { chart: ChartType.AREA_REVERSE, score: 55, when: c => c.isTimeSeries, reason: () => 'Alternative orientation' },

        // 📊 BAR CHARTS
        { chart: ChartType.BAR_CLUSTERED, score: 94, when: c => c.hasCategorical && c.hasNumeric, reason: () => 'Category comparison' },
        { chart: ChartType.BAR_HORIZONTAL, score: 88, when: c => c.hasCategorical && c.hasNumeric, reason: () => 'Better for long labels' },
        { chart: ChartType.BAR_STACKED, score: 90, when: c => c.numericCount >= 2, reason: () => 'Composition analysis' },
        { chart: ChartType.BAR_PERCENT, score: 86, when: c => c.numericCount >= 2, reason: () => 'Proportional comparison' },
        { chart: ChartType.BAR_HORIZONTAL_STACKED, score: 84, when: c => c.numericCount >= 2, reason: () => 'Horizontal composition' },
        { chart: ChartType.BAR_HORIZONTAL_PERCENT, score: 82, when: c => c.numericCount >= 2, reason: () => 'Horizontal proportion' },

        { chart: ChartType.BAR_WATERFALL, score: 70, when: c => c.isSingleMetric && c.hasCategorical, reason: () => 'Sequential contributions' },
        { chart: ChartType.BAR_RANGE, score: 68, when: c => c.numericCount >= 1, reason: () => 'Range comparison' },

        // 🥧 PIE / DONUT
        {
            chart: ChartType.PIE,
            score: c => c.isHighCardinality ? 40 : 82,
            when: c => c.hasCategorical && c.hasNumeric,
            reason: () => 'Part-to-whole'
        },
        {
            chart: ChartType.DONUT,
            score: c => c.isHighCardinality ? 45 : 82,
            when: c => c.hasCategorical && c.hasNumeric,
            reason: () => 'Compact part-to-whole'
        },
        { chart: ChartType.PIE_SEMI, score: 60, when: c => c.hasCategorical, reason: () => 'Semi-circle proportion' },
        { chart: ChartType.DONUT_SEMI, score: 60, when: c => c.hasCategorical, reason: () => 'Semi donut view' },

        // 🌸 ADVANCED CIRCULAR
        { chart: ChartType.ROSE, score: 72, when: c => c.hasCategorical, reason: () => 'Polar comparison' },
        { chart: ChartType.SUNBURST, score: 75, when: c => c.hasHierarchy, reason: () => 'Hierarchical breakdown' },
        { chart: ChartType.RADIAL_BAR, score: 70, when: c => c.numericCount >= 2, reason: () => 'Radial metric comparison' },
        { chart: ChartType.RADAR, score: c => c.numericCount >= 3 ? 72 : 50, when: c => c.numericCount >= 2, reason: () => 'Multi-metric comparison' },

        // 🔗 RELATIONSHIP
        { chart: ChartType.SCATTER, score: 90, when: c => c.numericCount >= 2, reason: () => 'Correlation analysis' },
        { chart: ChartType.SCATTER_LINE, score: 80, when: c => c.numericCount >= 2, reason: () => 'Correlation with trend' },
        { chart: ChartType.BUBBLE, score: 85, when: c => c.numericCount >= 3, reason: () => '3-variable relation' },

        // 🧊 MATRIX
        { chart: ChartType.HEATMAP, score: 80, when: c => c.hasCategorical && c.numericCount >= 1 && c.categoricalCount >= 2, reason: () => 'Matrix intensity' },

        // 🌳 STRUCTURE
        { chart: ChartType.TREEMAP, score: 78, when: c => c.hasCategorical, reason: () => 'Compact hierarchy' },

        // 🔀 COMBO
        { chart: ChartType.COMBO_BAR_LINE, score: 88, when: c => c.hasCategorical && c.numericCount >= 2, reason: () => 'Compare trend + bars' },
        { chart: ChartType.COMBO_STACKED_LINE, score: 85, when: c => c.numericCount >= 2, reason: () => 'Stacked + trend' },
        { chart: ChartType.COMBO_AREA_LINE, score: 80, when: c => c.numericCount >= 2, reason: () => 'Area + line mix' },

        // 📊 KPI / INDICATORS
        { chart: ChartType.KPI_SINGLE, score: 92, when: c => c.isSingleMetric, reason: () => 'Single KPI' },
        { chart: ChartType.KPI_PROGRESS, score: 85, when: c => c.isSingleMetric, reason: () => 'Progress indicator' },
        { chart: ChartType.KPI_BULLET, score: 82, when: c => c.isSingleMetric, reason: () => 'Target vs actual' },
        { chart: ChartType.GAUGE, score: 78, when: c => c.isSingleMetric, reason: () => 'Gauge visualization' },
        { chart: ChartType.CARD_LIST, score: 70, when: c => c.hasNumeric, reason: () => 'Summary cards' },
        { chart: ChartType.SPARKLINE, score: 72, when: c => c.isTimeSeries, reason: () => 'Mini trend' },

        // 📋 FALLBACK
        { chart: ChartType.TABLE, score: 40, when: () => true, reason: () => 'Raw data' }
    ];

    // ─────────────────────────────────────────────
    // ✅ APPLY RULES
    // ─────────────────────────────────────────────
    const scoreMap = new Map();

    for (const rule of RULES) {
        if (!rule.when(ctx)) continue;

        const score = typeof rule.score === 'function'
            ? rule.score(ctx)
            : rule.score;

        if (score <= 0) continue;

        const existing = scoreMap.get(rule.chart);

        if (!existing || existing.score < score) {
            scoreMap.set(rule.chart, {
                type: rule.chart,
                score,
                reason: rule.reason(ctx)
            });
        }
    }

    // ─────────────────────────────────────────────
    // ✅ FINAL OUTPUT
    // ─────────────────────────────────────────────
    return Array.from(scoreMap.values())
        .map(r => ({
            ...r,
            confidence:
                r.score >= 90 ? 'high' :
                r.score >= 70 ? 'medium' : 'low'
        }))
        .sort((a, b) => b.score - a.score);
}