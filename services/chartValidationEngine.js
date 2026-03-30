import { ChartType } from '../types';
import { FieldRoles, convertOldConfig, configFromAssignments } from './chartConfigSystem';

const SAMPLE_LIMIT = 5000;

const toUpper = (value) => String(value || '').trim().toUpperCase();

const normalizeChartType = (type) => {
    if ([
        ChartType.BAR,
        ChartType.BAR_CLUSTERED,
        ChartType.BAR_STACKED,
        ChartType.BAR_PERCENT,
        ChartType.BAR_HORIZONTAL,
        ChartType.BAR_HORIZONTAL_STACKED,
        ChartType.BAR_HORIZONTAL_PERCENT,
    ].includes(type)) return ChartType.BAR;

    if ([ChartType.LINE, ChartType.LINE_SMOOTH, ChartType.LINE_STRAIGHT, ChartType.LINE_STEP, ChartType.LINE_DASHED, ChartType.LINE_MULTI_AXIS].includes(type)) return ChartType.LINE;
    if ([ChartType.AREA, ChartType.AREA_SMOOTH, ChartType.AREA_STACKED, ChartType.AREA_PERCENT, ChartType.AREA_STEP].includes(type)) return ChartType.AREA;
    return type;
};

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

const idNameRegex = /(^id$|_id$|(^|_)(id|uuid|key|code)$|identifier|employee_id|customer_id|user_id|order_id)/i;

const classifyFieldType = (column, rows = []) => {
    const name = String(column?.name || '').trim();
    const declared = String(column?.type || 'string').toLowerCase();

    const values = rows
        .map((r) => r?.[name])
        .filter((v) => !isBlank(v));

    const uniqueCount = new Set(values.map((v) => String(v))).size;
    const nonNullCount = values.length;
    const uniquenessRatio = nonNullCount > 0 ? uniqueCount / nonNullCount : 0;

    const numericCount = values.filter((v) => Number.isFinite(Number(v)) && `${v}`.trim() !== '').length;
    const dateCount = values.filter((v) => !Number.isNaN(new Date(v).getTime())).length;
    const numericRatio = nonNullCount > 0 ? (numericCount / nonNullCount) : 0;
    const dateRatio = nonNullCount > 0 ? (dateCount / nonNullCount) : 0;

    let type = 'categorical';

    // Prefer real data evidence over stale/wrong declared schema types.
    if (declared === 'number') {
        type = numericRatio >= 0.7 ? 'numeric' : 'categorical';
    } else if (declared === 'date' || declared === 'datetime') {
        type = dateRatio >= 0.7 ? 'date' : 'categorical';
    } else {
        if (numericRatio >= 0.9) type = 'numeric';
        else if (dateRatio >= 0.9) type = 'date';
    }

    const looksLikeId = idNameRegex.test(name) || (nonNullCount >= 20 && uniquenessRatio >= 0.98);
    if (looksLikeId && (type === 'categorical' || type === 'numeric')) {
        type = 'id';
    }

    if (type === 'categorical' && declared === 'boolean') {
        type = 'categorical';
    }

    return {
        name,
        type,
        uniqueCount,
        nonNullCount,
        uniquenessRatio,
    };
};

const inferFieldTypeFromData = (fieldName, rows = []) => {
    const values = (Array.isArray(rows) ? rows : [])
        .map((r) => r?.[fieldName])
        .filter((v) => !isBlank(v));

    const uniqueCount = new Set(values.map((v) => String(v))).size;
    const nonNullCount = values.length;
    const uniquenessRatio = nonNullCount > 0 ? uniqueCount / nonNullCount : 0;

    if (nonNullCount === 0) {
        return {
            name: fieldName,
            type: 'categorical',
            uniqueCount: 0,
            nonNullCount: 0,
            uniquenessRatio: 0,
        };
    }

    const numericCount = values.filter((v) => Number.isFinite(Number(v)) && `${v}`.trim() !== '').length;
    const dateCount = values.filter((v) => !Number.isNaN(new Date(v).getTime())).length;

    let type = 'categorical';
    if (numericCount / nonNullCount >= 0.9) type = 'numeric';
    else if (dateCount / nonNullCount >= 0.9) type = 'date';

    const looksLikeId = idNameRegex.test(fieldName) || (nonNullCount >= 20 && uniquenessRatio >= 0.98);
    if (looksLikeId && (type === 'categorical' || type === 'numeric')) {
        type = 'id';
    }

    return {
        name: fieldName,
        type,
        uniqueCount,
        nonNullCount,
        uniquenessRatio,
    };
};

const makeMessage = (code, message, fix) => ({ code, message, ...(fix ? { fix } : {}) });

const hasNumericMeasure = (assignments, fieldMap) => {
    return assignments.some((a) => {
        if (![FieldRoles.Y, FieldRoles.VALUE, FieldRoles.SIZE, FieldRoles.X].includes(a?.role)) return false;
        if (!a?.field) return false;
        if (a.field === '__count__') return true;

        const agg = toUpper(a.aggregation);
        if (agg === 'COUNT' || agg === 'GROUP_BY') return true;

        const meta = fieldMap.get(a.field);
        return meta?.type === 'numeric';
    });
};

const getDistinctCount = (rows, field) => {
    if (!field) return 0;
    return new Set(
        (Array.isArray(rows) ? rows : [])
            .map((r) => r?.[field])
            .filter((v) => !isBlank(v))
            .map((v) => String(v))
    ).size;
};

const detectOrgCycle = (rows, nodeField, parentField) => {
    const parentByNode = new Map();

    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const node = String(row?.[nodeField] ?? '').trim();
        const parent = String(row?.[parentField] ?? '').trim();
        if (!node) return;
        parentByNode.set(node, parent || null);
    });

    for (const [node] of parentByNode.entries()) {
        const seen = new Set([node]);
        let cursor = parentByNode.get(node);
        while (cursor) {
            if (seen.has(cursor)) return true;
            seen.add(cursor);
            cursor = parentByNode.get(cursor);
        }
    }

    return false;
};

const detectMultipleRoots = (rows, nodeField, parentField) => {
    const nodes = new Set();
    const children = new Set();

    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const node = String(row?.[nodeField] ?? '').trim();
        const parent = String(row?.[parentField] ?? '').trim();
        if (node) nodes.add(node);
        if (parent) children.add(parent);
    });

    let rootCount = 0;
    nodes.forEach((n) => {
        if (!children.has(n)) rootCount += 1;
    });

    return rootCount;
};

export function auditChartConfiguration({ config = {}, columns = [], data = [] } = {}) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    const safeRows = Array.isArray(data) ? data.slice(0, SAMPLE_LIMIT) : [];

    const normalized = convertOldConfig(config || {});
    const chartType = normalizeChartType(normalized.chartType || config?.type || ChartType.BAR);
    const assignments = Array.isArray(normalized.assignments) ? normalized.assignments : [];

    const fieldMetaMap = new Map(
        (Array.isArray(columns) ? columns : []).map((c) => {
            const meta = classifyFieldType(c, safeRows);
            return [meta.name, meta];
        })
    );

    const getFieldMeta = (fieldName) => {
        if (!fieldName) return null;

        const exact = fieldMetaMap.get(fieldName);
        if (exact) return exact;

        const lowerName = String(fieldName).toLowerCase();
        const ciMatch = Array.from(fieldMetaMap.values()).find((m) => String(m.name || '').toLowerCase() === lowerName);
        if (ciMatch) return ciMatch;

        return inferFieldTypeFromData(fieldName, safeRows);
    };

    const byRole = (role) => assignments.filter((a) => a?.role === role && a?.field).map((a) => a.field);
    const firstRole = (roles = []) => {
        for (const role of roles) {
            const first = byRole(role)[0];
            if (first) return first;
        }
        return '';
    };

    const dimensionField = firstRole([FieldRoles.TIME, FieldRoles.X, FieldRoles.LEGEND, FieldRoles.HIERARCHY]);
    const valueAssignments = assignments.filter((a) => [FieldRoles.Y, FieldRoles.VALUE, FieldRoles.SIZE, FieldRoles.X].includes(a?.role) && a?.field);
    const hasNumeric = assignments.some((a) => {
        if (![FieldRoles.Y, FieldRoles.VALUE, FieldRoles.SIZE, FieldRoles.X].includes(a?.role)) return false;
        if (!a?.field) return false;
        if (a.field === '__count__') return true;

        const agg = toUpper(a.aggregation);
        if (agg === 'COUNT' || agg === 'GROUP_BY') return true;

        const meta = getFieldMeta(a.field);
        return meta?.type === 'numeric';
    });

    // Global aggregation rules
    valueAssignments.forEach((a) => {
        if (a.field === '__count__') return;

        const field = getFieldMeta(a.field);
        const agg = toUpper(a.aggregation || config?.aggregation || 'SUM');
        const aggForMessage = agg || 'SUM';

        if (!field) {
            errors.push(makeMessage('UNKNOWN_FIELD', `Assigned field '${a.field}' does not exist in dataset columns.`));
            return;
        }

        if (field.type === 'id' && !['COUNT', 'GROUP_BY'].includes(agg)) {
            errors.push(makeMessage(
                'ID_INVALID_AGG',
                `Aggregation ${aggForMessage} is not valid for ID field '${a.field}'. Use COUNT.`,
                { aggregation: 'COUNT' }
            ));
        }

        if (field.type === 'categorical' && ['SUM', 'AVG', 'MIN', 'MAX'].includes(agg)) {
            errors.push(makeMessage(
                'CATEGORICAL_INVALID_AGG',
                `Aggregation ${aggForMessage} is not valid for categorical field '${a.field}'.`,
                { aggregation: 'COUNT' }
            ));
        }

        if (field.type === 'numeric' && agg === 'COUNT') {
            warnings.push(makeMessage('COUNT_ON_NUMERIC', `Using COUNT on numeric field '${a.field}'. Consider SUM or AVG if needed.`));
        }
    });

    // Chart-specific rules
    const dimMeta = getFieldMeta(dimensionField);

    const requireDateDimension = () => {
        if (!dimensionField) {
            errors.push(makeMessage('MISSING_DATE_AXIS', 'Missing date field for axis.'));
            return;
        }
        if (dimMeta?.type !== 'date') {
            warnings.push(makeMessage(
                'NON_DATE_AXIS_ON_TREND',
                `Field '${dimensionField}' is not a date field. Chart will use categorical axis; LINE/AREA may be less suitable.`,
                { chartType: ChartType.BAR }
            ));
        }
    };

    const requireCategoricalDimension = () => {
        if (!dimensionField) {
            errors.push(makeMessage('MISSING_CATEGORY_AXIS', 'Missing categorical dimension field.'));
            return;
        }
        if (!dimMeta || !['categorical', 'id'].includes(dimMeta.type)) {
            errors.push(makeMessage('INVALID_CATEGORY_AXIS', `Field '${dimensionField}' is not categorical (detected: ${dimMeta?.type || 'unknown'}).`));
        }
    };

    const categoryCount = getDistinctCount(safeRows, dimensionField);

    switch (chartType) {
        case ChartType.BAR: {
            requireCategoricalDimension();
            if (!hasNumeric) errors.push(makeMessage('BAR_MISSING_NUMERIC', 'Bar chart requires at least one numeric/count value.'));
            if (categoryCount > 20) warnings.push(makeMessage('BAR_HIGH_CARDINALITY', `Bar chart has ${categoryCount} categories; labels may overlap.`));
            break;
        }
        case ChartType.LINE:
        case ChartType.AREA:
        case ChartType.SPARKLINE: {
            requireDateDimension();
            if (!hasNumeric) errors.push(makeMessage('LINE_MISSING_NUMERIC', 'Line/Area/Sparkline requires at least one numeric value.'));
            break;
        }
        case ChartType.PIE:
        case ChartType.DONUT:
        case ChartType.ROSE: {
            requireCategoricalDimension();
            if (!hasNumeric) errors.push(makeMessage('PIE_MISSING_NUMERIC', 'Pie/Donut requires at least one numeric/count value.'));
            if (categoryCount > 10) {
                errors.push(makeMessage('PIE_TOO_MANY_CATEGORIES', `Pie/Donut has ${categoryCount} categories; keep to 10 or fewer.`));
            } else if (categoryCount > 6) {
                warnings.push(makeMessage('PIE_HIGH_CARDINALITY', `Pie/Donut has ${categoryCount} categories; readability may degrade.`));
            }
            break;
        }
        case ChartType.SUNBURST: {
            const hierarchyFields = byRole(FieldRoles.HIERARCHY);
            if (hierarchyFields.length < 2) errors.push(makeMessage('SUNBURST_MIN_LEVELS', 'Sunburst requires at least 2 hierarchy levels.'));
            if (hierarchyFields.length > 5) errors.push(makeMessage('SUNBURST_MAX_LEVELS', 'Sunburst supports at most 5 hierarchy levels.'));
            if (!hasNumeric) errors.push(makeMessage('SUNBURST_MISSING_NUMERIC', 'Sunburst requires a numeric/count value.'));

            if (hierarchyFields.length > 0) {
                const leafDistinct = new Set(
                    safeRows.map((row) => hierarchyFields.map((f) => String(row?.[f] ?? 'Unknown')).join('||'))
                ).size;
                if (leafDistinct > 120) warnings.push(makeMessage('SUNBURST_TOO_MANY_LEAVES', `Sunburst has ${leafDistinct} leaf nodes; interaction may be crowded.`));
            }
            break;
        }
        case ChartType.RADAR: {
            requireCategoricalDimension();
            const numericSeriesCount = valueAssignments.filter((a) => {
                if (!a.field || a.field === '__count__') return true;
                const meta = getFieldMeta(a.field);
                return meta?.type === 'numeric' || ['COUNT', 'GROUP_BY'].includes(toUpper(a.aggregation));
            }).length;
            if (numericSeriesCount < 3) errors.push(makeMessage('RADAR_MIN_NUMERIC', 'Radar requires at least 3 numeric/count value fields.'));
            break;
        }
        case ChartType.SCATTER: {
            const xField = firstRole([FieldRoles.X]);
            const yField = firstRole([FieldRoles.Y]);
            const xMeta = getFieldMeta(xField);
            const yMeta = getFieldMeta(yField);
            if (!xField || !yField) errors.push(makeMessage('SCATTER_FIELDS_REQUIRED', 'Scatter requires X and Y fields.'));
            if (xField && xMeta?.type !== 'numeric') errors.push(makeMessage('SCATTER_X_NUMERIC', `Scatter X field '${xField}' must be numeric.`));
            if (yField && yMeta?.type !== 'numeric') errors.push(makeMessage('SCATTER_Y_NUMERIC', `Scatter Y field '${yField}' must be numeric.`));
            break;
        }
        case ChartType.BUBBLE: {
            const xField = firstRole([FieldRoles.X]);
            const yField = firstRole([FieldRoles.Y]);
            const sizeField = firstRole([FieldRoles.SIZE]);
            [
                { field: xField, label: 'X' },
                { field: yField, label: 'Y' },
                { field: sizeField, label: 'Size' },
            ].forEach(({ field, label }) => {
                const meta = getFieldMeta(field);
                if (!field) errors.push(makeMessage('BUBBLE_FIELD_MISSING', `Bubble requires ${label} numeric field.`));
                else if (meta?.type !== 'numeric') errors.push(makeMessage('BUBBLE_FIELD_NUMERIC', `Bubble ${label} field '${field}' must be numeric.`));
            });
            break;
        }
        case ChartType.TREEMAP: {
            const hierarchyFields = byRole(FieldRoles.HIERARCHY);
            if (hierarchyFields.length < 1 || hierarchyFields.length > 2) {
                errors.push(makeMessage('TREEMAP_HIERARCHY_RANGE', 'Treemap requires 1 to 2 hierarchy fields.'));
            }
            if (!hasNumeric) errors.push(makeMessage('TREEMAP_MISSING_NUMERIC', 'Treemap requires a numeric/count value field.'));

            if (hierarchyFields.length > 0) {
                const nodeCount = new Set(safeRows.map((row) => hierarchyFields.map((f) => String(row?.[f] ?? 'Unknown')).join('||'))).size;
                if (nodeCount > 80) warnings.push(makeMessage('TREEMAP_MANY_SMALL_NODES', `Treemap has ${nodeCount} nodes; many may render too small.`));
            }
            break;
        }
        case ChartType.HEATMAP: {
            const xField = firstRole([FieldRoles.X]);
            const yField = firstRole([FieldRoles.Y]);
            const valueField = firstRole([FieldRoles.VALUE]);
            if (!xField || !yField) errors.push(makeMessage('HEATMAP_AXES_REQUIRED', 'Heatmap requires two categorical axes.'));
            if (xField && !['categorical', 'id', 'date'].includes(getFieldMeta(xField)?.type)) errors.push(makeMessage('HEATMAP_X_TYPE', `Heatmap X field '${xField}' should be categorical/date.`));
            if (yField && !['categorical', 'id', 'date'].includes(getFieldMeta(yField)?.type)) errors.push(makeMessage('HEATMAP_Y_TYPE', `Heatmap Y field '${yField}' should be categorical/date.`));
            if (!valueField && !hasNumeric) errors.push(makeMessage('HEATMAP_VALUE_REQUIRED', 'Heatmap requires a numeric/count value field.'));
            break;
        }
        case ChartType.ORG_CHART: {
            const nodeField = firstRole([FieldRoles.NODE]);
            const parentField = firstRole([FieldRoles.PARENT]);

            if (!nodeField) errors.push(makeMessage('ORG_NODE_REQUIRED', 'Org chart requires a Node field.'));
            if (!parentField) errors.push(makeMessage('ORG_PARENT_REQUIRED', 'Org chart requires a Parent field.'));

            if (nodeField && parentField) {
                if (detectOrgCycle(safeRows, nodeField, parentField)) {
                    errors.push(makeMessage('ORG_CYCLE_DETECTED', 'Org chart contains cyclic parent-child relationships.'));
                }
                const rootCount = detectMultipleRoots(safeRows, nodeField, parentField);
                if (rootCount > 1) warnings.push(makeMessage('ORG_MULTIPLE_ROOTS', `Org chart has ${rootCount} roots.`));
            }
            break;
        }
        case ChartType.COMBO_BAR_LINE: {
            if (!dimensionField) errors.push(makeMessage('COMBO_DIM_REQUIRED', 'Combo chart requires a category/date axis field.'));
            else if (!['categorical', 'id', 'date'].includes(dimMeta?.type)) errors.push(makeMessage('COMBO_DIM_TYPE', `Combo axis field '${dimensionField}' should be categorical/date.`));

            const numericCount = valueAssignments.filter((a) => {
                if (!a.field || a.field === '__count__') return true;
                return getFieldMeta(a.field)?.type === 'numeric' || ['COUNT', 'GROUP_BY'].includes(toUpper(a.aggregation));
            }).length;

            if (numericCount < 2) errors.push(makeMessage('COMBO_MIN_NUMERIC', 'Combo Bar+Line requires at least 2 numeric/count series.'));
            break;
        }
        case ChartType.KPI_SINGLE:
        case ChartType.GAUGE: {
            if (!hasNumeric) errors.push(makeMessage('KPI_NUMERIC_REQUIRED', 'KPI/Gauge requires a numeric/count value field.'));
            break;
        }
        case ChartType.TABLE:
            break;
        default:
            break;
    }

    // High-cardinality generic warning
    if ([ChartType.BAR, ChartType.PIE, ChartType.DONUT, ChartType.SUNBURST].includes(chartType) && categoryCount > 20) {
        warnings.push(makeMessage('HIGH_CARDINALITY', `Dimension '${dimensionField || 'N/A'}' has ${categoryCount} categories.`));
    }

    // UX validation
    if ([ChartType.BAR, ChartType.LINE, ChartType.AREA, ChartType.COMBO_BAR_LINE].includes(chartType) && categoryCount > 30) {
        warnings.push(makeMessage('LABEL_OVERLAP_RISK', 'Axis labels are likely to overlap due to high category count.'));
    }

    if (safeRows.length === 0) {
        errors.push(makeMessage('EMPTY_DATASET', 'Dataset is empty.'));
    }

    if ([ChartType.PIE, ChartType.DONUT].includes(chartType) && dimensionField) {
        const counts = new Map();
        safeRows.forEach((row) => {
            const key = String(row?.[dimensionField] ?? 'Unknown');
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
        if (total > 0) {
            const tiny = Array.from(counts.values()).filter((n) => (n / total) < 0.02).length;
            if (tiny >= 3) warnings.push(makeMessage('TINY_PIE_SLICES', `${tiny} slices are below 2% and may be hard to read.`));
        }
    }

    // Wrong chart detection / suggestions
    const profile = {
        hasDate: Array.from(fieldMetaMap.values()).some((f) => f.type === 'date'),
        hasNumericColumn: Array.from(fieldMetaMap.values()).some((f) => f.type === 'numeric'),
        hasCategoricalColumn: Array.from(fieldMetaMap.values()).some((f) => ['categorical', 'id'].includes(f.type)),
        categoricalCount: Array.from(fieldMetaMap.values()).filter((f) => ['categorical', 'id'].includes(f.type)).length,
    };

    if (profile.hasDate && profile.hasNumericColumn && ![ChartType.LINE, ChartType.AREA, ChartType.SPARKLINE].includes(chartType)) {
        suggestions.push(makeMessage('SUGGEST_LINE', 'Date + numeric data detected. Consider a LINE chart.', { chartType: ChartType.LINE }));
    }

    if (profile.hasCategoricalColumn && !profile.hasNumericColumn && chartType !== ChartType.TABLE) {
        suggestions.push(makeMessage('SUGGEST_TABLE', 'Only categorical data detected. TABLE may be a better fit.', { chartType: ChartType.TABLE, aggregation: 'COUNT' }));
    }

    const hierarchyFieldCount = byRole(FieldRoles.HIERARCHY).length;
    if (hierarchyFieldCount >= 2 && ![ChartType.SUNBURST, ChartType.TREEMAP].includes(chartType)) {
        suggestions.push(makeMessage('SUGGEST_HIERARCHY', 'Hierarchical fields detected. Consider SUNBURST or TREEMAP.', { chartType: ChartType.SUNBURST }));
    }

    const nodeAssigned = byRole(FieldRoles.NODE).length > 0;
    const parentAssigned = byRole(FieldRoles.PARENT).length > 0;
    if (nodeAssigned && parentAssigned && chartType !== ChartType.ORG_CHART) {
        suggestions.push(makeMessage('SUGGEST_ORG', 'Node/Parent relationship detected. Consider ORG_CHART.', { chartType: ChartType.ORG_CHART }));
    }

    const unique = (items) => {
        const seen = new Set();
        return items.filter((it) => {
            const key = `${it.code}::${it.message}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };

    return {
        errors: unique(errors),
        warnings: unique(warnings),
        suggestions: unique(suggestions),
        fieldProfile: Array.from(fieldMetaMap.values()),
        chartType,
        normalizedConfig: configFromAssignments(chartType, assignments),
    };
}
