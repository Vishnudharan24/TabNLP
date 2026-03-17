import { ChartType } from '../types';

/**
 * Analyzes dataset columns and recommends the most suitable chart types.
 * @param {import('../types').ColumnSchema[]} columns - The dataset columns
 * @param {string} [dimension] - Currently assigned dimension
 * @param {string[]} [measures] - Currently assigned measures
 * @returns {{ type: string, score: number, reason: string }[]}
 */
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
    const selectedDateMeasures = selectedMeasures.filter(c => c.type === 'date');

    const hasDimension = !!dimension;
    const dimensionCol = hasDimension ? colByName[dimension] : null;
    const isDateDimension = dimensionCol?.type === 'date';
    const isCategoricalDimension = ['string', 'boolean', 'date'].includes(dimensionCol?.type);

    // Effective profile: prefer explicit assignments if provided.
    const effectiveNumeric = selectedNumericMeasures.length > 0 ? selectedNumericMeasures.length : numericCols.length;
    const effectiveCategorical = hasDimension
        ? (isCategoricalDimension ? 1 : 0)
        : (categoricalCols.length + booleanCols.length);
    const effectiveDate = isDateDimension
        ? 1
        : (selectedDateMeasures.length > 0 ? selectedDateMeasures.length : dateCols.length);

    const scores = [];
    const add = (type, score, reason) => scores.push({ type, score, reason });

    const hasAnyFields = allColumns.length > 0;
    const hasNumeric = effectiveNumeric > 0;
    const hasCategorical = effectiveCategorical > 0;
    const hasDate = effectiveDate > 0;

    // ── Time series ───────────────────────────────────────────────────
    if (hasDate && hasNumeric) {
        add(ChartType.LINE_SMOOTH, 96, 'Best fit for time-series trends');
        add(ChartType.LINE_STRAIGHT, 92, 'Clear trend tracking over time');
        add(ChartType.AREA_SMOOTH, 88, 'Trend with magnitude emphasis');
        add(ChartType.AREA_STACKED, 84, 'Cumulative trend over time');
        add(ChartType.LINE_STEP, 78, 'Step-wise change across time buckets');
        add(ChartType.AREA_STEP, 74, 'Stepped area trend view');
        add(ChartType.SPARKLINE, 70, 'Compact trend indicator');
    }

    // Date-only data can still be visualized by count by date.
    if (hasDate && !hasNumeric) {
        add(ChartType.LINE_SMOOTH, 84, 'Record count trend by date');
        add(ChartType.BAR_CLUSTERED, 76, 'Count by date buckets');
    }

    // ── Categorical + numeric (comparison/composition) ───────────────
    if (hasCategorical && hasNumeric) {
        add(ChartType.BAR_CLUSTERED, 94, 'Compare measures across categories');
        add(ChartType.BAR_HORIZONTAL, 88, 'Readable with long category labels');
        add(ChartType.LINE_SMOOTH, 72, 'Category-wise trend view');

        if (effectiveNumeric >= 2) {
            add(ChartType.BAR_STACKED, 90, 'Composition by category');
            add(ChartType.BAR_PERCENT, 86, 'Proportional composition by category');
            add(ChartType.BAR_HORIZONTAL_STACKED, 84, 'Horizontal stacked comparison');
            add(ChartType.BAR_HORIZONTAL_PERCENT, 82, 'Horizontal proportional comparison');
            add(ChartType.COMBO_BAR_LINE, 88, 'Compare totals and trend in one chart');
            add(ChartType.COMBO_STACKED_LINE, 84, 'Stacked contribution plus trend');
            add(ChartType.COMBO_AREA_LINE, 78, 'Area + line for mixed emphasis');
            add(ChartType.LINE_MULTI_AXIS, 74, 'Different-scale measures on separate axes');
            add(ChartType.AREA_PERCENT, 74, 'Share-of-total trend by category');
        }

        // Part-to-whole
        add(ChartType.PIE, 82, 'Part-to-whole category split');
        add(ChartType.DONUT, 82, 'Part-to-whole with compact center');
        add(ChartType.ROSE, 72, 'Polar part-to-whole comparison');
        add(ChartType.TREEMAP, 76, 'Compact proportional breakdown');
        add(ChartType.SUNBURST, 70, 'Nested category hierarchy split');
    }

    // Categorical only can still use count-based charts.
    if (hasCategorical && !hasNumeric) {
        add(ChartType.BAR_CLUSTERED, 84, 'Frequency distribution by category');
        add(ChartType.BAR_HORIZONTAL, 82, 'Readable frequency comparison');
        add(ChartType.PIE, 74, 'Category share by count');
        add(ChartType.DONUT, 74, 'Category share by count');
        add(ChartType.TREEMAP, 68, 'Compact category frequency layout');
    }

    // ── Numeric-only profiles ────────────────────────────────────────
    if (hasNumeric && !hasCategorical && !hasDate) {
        if (effectiveNumeric === 1) {
            add(ChartType.KPI_SINGLE, 92, 'Single-metric KPI card');
            add(ChartType.KPI_PROGRESS, 84, 'Progress-style KPI');
            add(ChartType.KPI_BULLET, 80, 'Target-vs-actual KPI');
            add(ChartType.GAUGE, 78, 'Single metric gauge visualization');
            add(ChartType.CARD_LIST, 72, 'Summary metric card');
        } else {
            add(ChartType.SCATTER, 90, 'Correlation across numeric measures');
            add(ChartType.SCATTER_LINE, 80, 'Correlation with trend line');
            add(ChartType.BUBBLE, 84, 'Three-variable numeric relationship');
            add(ChartType.RADAR, 70, 'Multi-metric profile comparison');
            add(ChartType.RADIAL_BAR, 68, 'Radial multi-metric comparison');
        }
    }

    // ── Correlation and matrix views ────────────────────────────────
    if (effectiveNumeric >= 2) {
        add(ChartType.SCATTER, 88, 'Two-measure correlation view');
        add(ChartType.SCATTER_LINE, 78, 'Correlation with fitted trend');
    }
    if (effectiveNumeric >= 3) {
        add(ChartType.BUBBLE, 86, 'Three-variable relationship mapping');
    }
    if ((categoricalCols.length + booleanCols.length) >= 2 && hasNumeric) {
        add(ChartType.HEATMAP, 80, 'Matrix intensity across category pairs');
    }

    // ── Specialized recommendations ─────────────────────────────────
    if (hasCategorical && effectiveNumeric >= 3) {
        add(ChartType.RADAR, 76, 'Compare many metrics per category');
        add(ChartType.RADIAL_BAR, 70, 'Radial metric comparison by category');
    }

    if (hasNumeric) {
        add(ChartType.KPI_SINGLE, 66, 'High-level metric summary');
        add(ChartType.GAUGE, 60, 'Single KPI indicator view');
        add(ChartType.CARD_LIST, 58, 'Compact summary cards');
    }

    // Optional variants with lower default confidence.
    if (hasCategorical && hasNumeric) {
        add(ChartType.BAR_WATERFALL, 58, 'Sequential contribution analysis');
        add(ChartType.BAR_RANGE, 54, 'Range span comparison');
        add(ChartType.PIE_SEMI, 52, 'Semi-circle proportion view');
        add(ChartType.DONUT_SEMI, 52, 'Semi-circle donut proportion view');
        add(ChartType.AREA_GRADIENT, 56, 'Styled area trend emphasis');
        add(ChartType.AREA_REVERSE, 48, 'Alternative area direction styling');
        add(ChartType.LINE_DASHED, 50, 'Alternative line style emphasis');
        add(ChartType.LINE_AREA_MIX, 62, 'Line + area combined narrative');
    }

    // Baseline fallback: always available
    if (hasAnyFields) {
        add(ChartType.TABLE, 42, 'Raw data table view');
    }

    // Deduplicate by type (keep highest score)
    const deduped = {};
    for (const s of scores) {
        if (!deduped[s.type] || deduped[s.type].score < s.score) {
            deduped[s.type] = s;
        }
    }

    return Object.values(deduped).sort((a, b) => b.score - a.score);
}
