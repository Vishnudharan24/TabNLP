import { ChartType } from '../types';

/**
 * Analyzes dataset columns and recommends the most suitable chart types.
 * @param {import('../types').ColumnSchema[]} columns - The dataset columns
 * @param {string} [dimension] - Currently assigned dimension
 * @param {string[]} [measures] - Currently assigned measures
 * @returns {{ type: string, score: number, reason: string }[]}
 */
export function recommendCharts(columns, dimension, measures) {
    const numericCols = columns.filter(c => c.type === 'number');
    const categoricalCols = columns.filter(c => c.type === 'string');
    const dateCols = columns.filter(c => c.type === 'date');

    const hasDimension = !!dimension;
    const measureCount = measures?.length || 0;

    // Determine effective column profile from assignment or from dataset
    const effectiveNumeric = measureCount > 0 ? measureCount : numericCols.length;
    const effectiveCategorical = hasDimension ? 1 : categoricalCols.length;
    const effectiveDate = dateCols.length;

    const scores = [];

    const add = (type, score, reason) => scores.push({ type, score, reason });

    // 1 categorical + 1+ numeric → Bar charts
    if (effectiveCategorical >= 1 && effectiveNumeric >= 1) {
        add(ChartType.BAR_CLUSTERED, 90, 'Compare values across categories');
        add(ChartType.BAR_HORIZONTAL, 82, 'Horizontal comparison for readability');
        if (effectiveNumeric >= 2) {
            add(ChartType.BAR_STACKED, 85, 'Show composition across categories');
            add(ChartType.BAR_PERCENT, 78, 'Show proportional breakdown');
        }
    }

    // Time series → Line / Area
    if (effectiveDate >= 1 && effectiveNumeric >= 1) {
        add(ChartType.LINE_SMOOTH, 95, 'Best for time-series trends');
        add(ChartType.LINE_STRAIGHT, 88, 'Precise trend tracking');
        add(ChartType.AREA_SMOOTH, 84, 'Time trend with volume emphasis');
        add(ChartType.AREA_STACKED, 80, 'Stacked area for cumulative trends');
    }

    // Categorical + numeric → Lines also work
    if (effectiveCategorical >= 1 && effectiveNumeric >= 1) {
        add(ChartType.LINE_SMOOTH, 70, 'Trend across categories');
        add(ChartType.AREA_SMOOTH, 65, 'Area trend across categories');
    }

    // Part-to-whole
    if (effectiveCategorical >= 1 && effectiveNumeric >= 1) {
        add(ChartType.PIE, 75, 'Show proportions of a whole');
        add(ChartType.DONUT, 74, 'Proportions with a clean center');
        add(ChartType.TREEMAP, 68, 'Hierarchical proportions');
        add(ChartType.ROSE, 60, 'Polar proportional chart');
        add(ChartType.SUNBURST, 55, 'Nested category breakdown');
    }

    // 2+ numeric → Scatter / Bubble
    if (effectiveNumeric >= 2) {
        add(ChartType.SCATTER, 85, 'Correlation between two measures');
        if (effectiveNumeric >= 3) {
            add(ChartType.BUBBLE, 80, 'Three-variable relationship');
        }
    }

    // Radar – multiple measures, 1 dimension
    if (effectiveCategorical >= 1 && effectiveNumeric >= 3) {
        add(ChartType.RADAR, 72, 'Multi-metric profile comparison');
        add(ChartType.RADIAL_BAR, 60, 'Radial metric comparison');
    }

    // Combos
    if (effectiveCategorical >= 1 && effectiveNumeric >= 2) {
        add(ChartType.COMBO_BAR_LINE, 82, 'Compare bar + trend line');
        add(ChartType.COMBO_AREA_LINE, 70, 'Area + line overlay');
    }

    // KPI / Gauge – single numeric, no dimension needed
    if (effectiveNumeric >= 1) {
        add(ChartType.KPI_SINGLE, 60, 'Display a single key metric');
        add(ChartType.GAUGE, 55, 'Gauge indicator for a metric');
        add(ChartType.SPARKLINE, 50, 'Compact inline trend');
    }

    // Heatmap – 2 categoricals + 1 numeric
    if (effectiveCategorical >= 2 && effectiveNumeric >= 1) {
        add(ChartType.HEATMAP, 75, 'Density of values in a matrix');
    }

    // Table always available
    add(ChartType.TABLE, 40, 'Raw data table view');

    // Deduplicate by type (keep highest score)
    const deduped = {};
    for (const s of scores) {
        if (!deduped[s.type] || deduped[s.type].score < s.score) {
            deduped[s.type] = s;
        }
    }

    return Object.values(deduped).sort((a, b) => b.score - a.score);
}
