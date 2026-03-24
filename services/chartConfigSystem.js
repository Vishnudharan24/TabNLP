import { ChartType } from '../types';

export const FieldRoles = {
    X: 'x',
    Y: 'y',
    LEGEND: 'legend',
    SIZE: 'size',
    COLOR: 'color',
    HIERARCHY: 'hierarchy',
    TIME: 'time',
    VALUE: 'value',
};

const NUMERIC_TYPES = new Set(['number']);
const TIME_TYPES = new Set(['date', 'datetime']);

const toUpperAgg = (agg) => {
    const value = String(agg || '').toUpperCase();
    return ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].includes(value) ? value : undefined;
};

const normalizeChartType = (type) => {
    if (type === ChartType.BAR_CLUSTERED || type === ChartType.BAR_STACKED || type === ChartType.BAR_PERCENT || type === ChartType.BAR_HORIZONTAL || type === ChartType.BAR_HORIZONTAL_STACKED || type === ChartType.BAR_HORIZONTAL_PERCENT) return ChartType.BAR;
    if (type === ChartType.LINE_SMOOTH || type === ChartType.LINE_STRAIGHT || type === ChartType.LINE_STEP || type === ChartType.LINE_DASHED || type === ChartType.LINE_MULTI_AXIS) return ChartType.LINE;
    if (type === ChartType.AREA_SMOOTH || type === ChartType.AREA_STACKED || type === ChartType.AREA_PERCENT || type === ChartType.AREA_STEP) return ChartType.AREA;
    return type;
};

export function convertOldConfig(oldConfig = {}) {
    if (Array.isArray(oldConfig.assignments) && oldConfig.assignments.length > 0) {
        return {
            chartType: oldConfig.type || oldConfig.chartType || ChartType.BAR,
            assignments: oldConfig.assignments,
        };
    }

    const chartType = oldConfig.type || oldConfig.chartType || ChartType.BAR;
    const normalizedType = normalizeChartType(chartType);
    const assignments = [];

    const dim = oldConfig.dimension || oldConfig.xAxisField || '';
    const measures = Array.isArray(oldConfig.measures) ? oldConfig.measures.filter(Boolean) : [];
    const agg = toUpperAgg(oldConfig.aggregation) || 'SUM';

    if ([ChartType.SUNBURST, ChartType.TREEMAP].includes(normalizedType)) {
        const hierarchyFields = Array.isArray(oldConfig.hierarchyFields) && oldConfig.hierarchyFields.length > 0
            ? oldConfig.hierarchyFields
            : (dim ? [dim] : []);
        hierarchyFields.forEach((field) => assignments.push({ field, role: FieldRoles.HIERARCHY }));
        if (measures[0]) assignments.push({ field: measures[0], role: FieldRoles.VALUE, aggregation: agg });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE, aggregation: 'COUNT' });
        return { chartType, assignments };
    }

    if ([ChartType.PIE, ChartType.DONUT].includes(normalizedType)) {
        if (dim) assignments.push({ field: dim, role: FieldRoles.LEGEND });
        if (measures[0]) assignments.push({ field: measures[0], role: FieldRoles.VALUE, aggregation: agg });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE, aggregation: 'COUNT' });
        return { chartType, assignments };
    }

    if (normalizedType === ChartType.BUBBLE) {
        if (measures[0]) assignments.push({ field: measures[0], role: FieldRoles.X, aggregation: agg });
        if (measures[1] || measures[0]) assignments.push({ field: measures[1] || measures[0], role: FieldRoles.Y, aggregation: agg });
        if (measures[2] || measures[1] || measures[0]) assignments.push({ field: measures[2] || measures[1] || measures[0], role: FieldRoles.SIZE, aggregation: agg });
        if (dim) assignments.push({ field: dim, role: FieldRoles.COLOR });
        return { chartType, assignments };
    }

    if (normalizedType === ChartType.SCATTER) {
        if (measures[0]) assignments.push({ field: measures[0], role: FieldRoles.X, aggregation: agg });
        if (measures[1] || measures[0]) assignments.push({ field: measures[1] || measures[0], role: FieldRoles.Y, aggregation: agg });
        if (dim) assignments.push({ field: dim, role: FieldRoles.COLOR });
        return { chartType, assignments };
    }

    if ([ChartType.GAUGE, ChartType.KPI_SINGLE].includes(normalizedType)) {
        if (measures[0]) assignments.push({ field: measures[0], role: FieldRoles.VALUE, aggregation: agg });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE, aggregation: 'COUNT' });
        return { chartType, assignments };
    }

    if (dim) {
        const dimRole = normalizedType === ChartType.LINE || normalizedType === ChartType.AREA || normalizedType === ChartType.SPARKLINE
            ? FieldRoles.TIME
            : FieldRoles.X;
        assignments.push({ field: dim, role: dimRole });
    }

    measures.forEach((field) => assignments.push({ field, role: FieldRoles.Y, aggregation: agg }));

    if (assignments.length === 0) {
        assignments.push({ field: '__count__', role: FieldRoles.VALUE, aggregation: 'COUNT' });
    }

    return { chartType, assignments };
}

export function configFromAssignments(chartType, assignments = []) {
    const safe = Array.isArray(assignments) ? assignments : [];
    const first = (role) => safe.find(a => a.role === role && a.field)?.field;
    const list = (role) => safe.filter(a => a.role === role && a.field).map(a => a.field);

    const hierarchy = list(FieldRoles.HIERARCHY);
    const yFields = list(FieldRoles.Y);
    const valueFields = list(FieldRoles.VALUE);
    const x = first(FieldRoles.TIME) || first(FieldRoles.X) || first(FieldRoles.LEGEND) || hierarchy[0] || '';

    const measures = [];
    [...yFields, ...valueFields, first(FieldRoles.SIZE), first(FieldRoles.X), first(FieldRoles.Y)]
        .filter(Boolean)
        .forEach((field) => {
            if (!measures.includes(field)) measures.push(field);
        });

    const agg = toUpperAgg(safe.find(a => ['y', 'value', 'size', 'x'].includes(a.role) && a.aggregation)?.aggregation) || 'SUM';

    return {
        type: chartType,
        dimension: x,
        measures: measures.length > 0 ? measures : ['__count__'],
        aggregation: agg,
        xAxisField: first(FieldRoles.X) || first(FieldRoles.TIME) || '',
        yAxisField: first(FieldRoles.Y) || first(FieldRoles.VALUE) || '',
        legendField: first(FieldRoles.LEGEND) || first(FieldRoles.COLOR) || '',
        sizeField: first(FieldRoles.SIZE) || '',
        hierarchyFields: hierarchy,
        assignments: safe,
    };
}

export function buildHierarchy(data = [], hierarchyFields = [], valueField = '__count__', aggregation = 'COUNT') {
    const levels = (Array.isArray(hierarchyFields) ? hierarchyFields : []).filter(Boolean);
    const rows = Array.isArray(data) ? data : [];
    if (levels.length === 0) return [];

    const valueAgg = toUpperAgg(aggregation) || 'COUNT';

    const nodeMap = new Map();

    const getNodeKey = (pathParts) => pathParts.join('||');

    const getValue = (row) => {
        if (valueField === '__count__') return 1;
        const n = Number(row?.[valueField]);
        return Number.isFinite(n) ? n : 0;
    };

    rows.forEach((row) => {
        let parentKey = '__root__';
        const pathParts = [];

        levels.forEach((field, levelIndex) => {
            const raw = row?.[field];
            const name = String(raw === null || raw === undefined || raw === '' ? 'Unknown' : raw);
            pathParts.push(name);
            const key = getNodeKey(pathParts);

            if (!nodeMap.has(key)) {
                nodeMap.set(key, {
                    key,
                    name,
                    level: levelIndex,
                    children: new Map(),
                    sum: 0,
                    count: 0,
                    min: Infinity,
                    max: -Infinity,
                    parentKey,
                });
            }

            const node = nodeMap.get(key);
            const value = getValue(row);
            node.sum += value;
            node.count += 1;
            node.min = Math.min(node.min, value);
            node.max = Math.max(node.max, value);

            if (parentKey !== '__root__') {
                const parent = nodeMap.get(parentKey);
                if (parent) parent.children.set(key, node);
            }

            parentKey = key;
        });
    });

    const roots = Array.from(nodeMap.values())
        .filter(node => node.parentKey === '__root__')
        .map((node) => {
            const toOutput = (n) => {
                const resolvedValue = valueAgg === 'AVG'
                    ? (n.count > 0 ? n.sum / n.count : 0)
                    : valueAgg === 'MIN'
                        ? (n.min === Infinity ? 0 : n.min)
                        : valueAgg === 'MAX'
                            ? (n.max === -Infinity ? 0 : n.max)
                            : valueAgg === 'COUNT'
                                ? n.count
                                : n.sum;

                return {
                    name: n.name,
                    value: resolvedValue,
                    children: Array.from(n.children.values()).map(toOutput),
                };
            };
            return toOutput(node);
        });

    return roots;
}

export function autoAssignFields(columns = [], chartType = ChartType.BAR) {
    const safeColumns = Array.isArray(columns) ? columns : [];
    const colType = (c) => c?.type || c?.sourceType || (c?.kind === 'numeric' ? 'number' : (c?.kind === 'time' ? 'date' : 'string'));
    const numeric = safeColumns.filter(c => NUMERIC_TYPES.has(colType(c)));
    const time = safeColumns.filter(c => TIME_TYPES.has(colType(c)));
    const categorical = safeColumns.filter(c => !NUMERIC_TYPES.has(colType(c)) && !TIME_TYPES.has(colType(c)));

    const cardHint = new Map();
    categorical.forEach((col) => {
        cardHint.set(col.name, Number.isFinite(col.cardinality) ? col.cardinality : 999999);
    });

    const sortedCategorical = [...categorical].sort((a, b) => (cardHint.get(a.name) || 999999) - (cardHint.get(b.name) || 999999));
    const type = normalizeChartType(chartType);

    const firstCat = sortedCategorical[0]?.name;
    const secondCat = sortedCategorical[1]?.name;
    const firstNum = numeric[0]?.name;
    const secondNum = numeric[1]?.name;
    const thirdNum = numeric[2]?.name;
    const firstTime = time[0]?.name;

    const assignments = [];

    if (type === ChartType.PIE || type === ChartType.DONUT) {
        if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.LEGEND });
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.VALUE, aggregation: 'SUM' });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE, aggregation: 'COUNT' });
        return assignments;
    }

    if (type === ChartType.SUNBURST || type === ChartType.TREEMAP) {
        [firstCat, secondCat, sortedCategorical[2]?.name].filter(Boolean).forEach((field) => assignments.push({ field, role: FieldRoles.HIERARCHY }));
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.VALUE, aggregation: 'SUM' });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE, aggregation: 'COUNT' });
        return assignments;
    }

    if (type === ChartType.SCATTER) {
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.X, aggregation: 'SUM' });
        if (secondNum || firstNum) assignments.push({ field: secondNum || firstNum || '__count__', role: FieldRoles.Y, aggregation: 'SUM' });
        if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.COLOR });
        return assignments;
    }

    if (type === ChartType.BUBBLE) {
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.X, aggregation: 'SUM' });
        assignments.push({ field: secondNum || firstNum || '__count__', role: FieldRoles.Y, aggregation: firstNum ? 'SUM' : 'COUNT' });
        assignments.push({ field: thirdNum || secondNum || firstNum || '__count__', role: FieldRoles.SIZE, aggregation: firstNum ? 'SUM' : 'COUNT' });
        if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.COLOR });
        return assignments;
    }

    if (type === ChartType.HEATMAP) {
        if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.X });
        if (secondCat || firstCat) assignments.push({ field: secondCat || firstCat || '__bucket__', role: FieldRoles.Y });
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.VALUE, aggregation: 'SUM' });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE, aggregation: 'COUNT' });
        return assignments;
    }

    if (type === ChartType.GAUGE || type === ChartType.KPI_SINGLE) {
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.VALUE, aggregation: 'SUM' });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE, aggregation: 'COUNT' });
        return assignments;
    }

    if (type === ChartType.RADAR) {
        if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.LEGEND });
        [firstNum, secondNum, thirdNum].filter(Boolean).forEach((field) => assignments.push({ field, role: FieldRoles.Y, aggregation: 'SUM' }));
        if (assignments.filter(a => a.role === FieldRoles.Y).length === 0) {
            assignments.push({ field: '__count__', role: FieldRoles.Y, aggregation: 'COUNT' });
        }
        return assignments;
    }

    if (type === ChartType.SPARKLINE || type === ChartType.LINE || type === ChartType.AREA) {
        if (firstTime) assignments.push({ field: firstTime, role: FieldRoles.TIME });
        else if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.X });
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.Y, aggregation: 'SUM' });
        else assignments.push({ field: '__count__', role: FieldRoles.Y, aggregation: 'COUNT' });
        if (secondCat) assignments.push({ field: secondCat, role: FieldRoles.LEGEND });
        return assignments;
    }

    // BAR + generic fallback
    if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.X });
    else if (firstTime) assignments.push({ field: firstTime, role: FieldRoles.TIME });
    if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.Y, aggregation: 'SUM' });
    else assignments.push({ field: '__count__', role: FieldRoles.Y, aggregation: 'COUNT' });
    if (secondCat) assignments.push({ field: secondCat, role: FieldRoles.LEGEND });

    return assignments;
}

export function validateConfig(config = {}, columns = []) {
    const warnings = [];
    const normalized = convertOldConfig(config);
    const assignments = Array.isArray(normalized.assignments) ? normalized.assignments : [];
    const byField = new Map((Array.isArray(columns) ? columns : []).map(c => [c.name, c]));

    const hasNumericRole = assignments.some((a) => [FieldRoles.Y, FieldRoles.VALUE, FieldRoles.SIZE, FieldRoles.X].includes(a.role) && a.field && a.field !== '__count__' && NUMERIC_TYPES.has(byField.get(a.field)?.type));
    const hasCountFallback = assignments.some((a) => a.field === '__count__');

    const hierarchyCount = assignments.filter(a => a.role === FieldRoles.HIERARCHY).length;
    if ([ChartType.SUNBURST, ChartType.TREEMAP].includes(normalizeChartType(normalized.chartType)) && hierarchyCount === 0) {
        warnings.push('Hierarchy chart has no hierarchy fields; using fallback grouping.');
    }

    if (!hasNumericRole && !hasCountFallback) {
        warnings.push('Missing numeric field, using count fallback.');
    }

    const xField = assignments.find(a => a.role === FieldRoles.X || a.role === FieldRoles.TIME)?.field;
    if (xField) {
        const card = byField.get(xField)?.cardinality;
        if (Number.isFinite(card) && card > 40) {
            warnings.push('Too many categories for bar/axis chart. Consider filtering top values.');
        }
    }

    const unknownFields = assignments
        .filter(a => a.field && a.field !== '__count__' && !byField.has(a.field))
        .map(a => a.field);
    if (unknownFields.length > 0) {
        warnings.push(`Unknown fields in assignments: ${Array.from(new Set(unknownFields)).join(', ')}`);
    }

    return {
        valid: true,
        warnings,
    };
}

export function getFieldsByRole(assignments = [], role) {
    return (Array.isArray(assignments) ? assignments : [])
        .filter(a => a?.role === role && a?.field)
        .map(a => a.field);
}
