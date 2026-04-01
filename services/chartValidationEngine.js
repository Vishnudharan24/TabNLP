import { ChartType } from '../types';
import { FieldRoles, convertOldConfig, configFromAssignments } from './chartConfigSystem';
import { getChartRequirementText } from './chartRecommender';

const SAMPLE_LIMIT = 5000;

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

const isNumericLike = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;

    let text = value.trim();
    if (!text) return false;
    if (/^\(.*\)$/.test(text)) text = `-${text.slice(1, -1)}`;
    text = text.replace(/[,$£€¥₹%\s]/g, '');
    return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text);
};

const isDateLike = (value) => {
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value !== 'string') return false;
    const text = value.trim();
    if (!text) return false;
    if (isNumericLike(text)) return false;

    const hasDateCue = /[-/]|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b|\d{4}-\d{1,2}-\d{1,2}/i.test(text);
    if (!hasDateCue) return false;
    const parsed = new Date(text).getTime();
    return !Number.isNaN(parsed);
};

const classifyFieldType = (column, rows = []) => {
    const name = String(column?.name || '').trim();
    const declared = String(column?.type || 'string').toLowerCase();

    const values = rows
        .map((r) => r?.[name])
        .filter((v) => !isBlank(v));

    const uniqueCount = new Set(values.map((v) => String(v))).size;
    const nonNullCount = values.length;
    const uniquenessRatio = nonNullCount > 0 ? uniqueCount / nonNullCount : 0;

    const numericCount = values.filter((v) => isNumericLike(v)).length;
    const dateCount = values.filter((v) => isDateLike(v)).length;
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

    const numericCount = values.filter((v) => isNumericLike(v)).length;
    const dateCount = values.filter((v) => isDateLike(v)).length;

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

const isAggregatedExpression = (assignment = {}) => {
    const expression = String(assignment?.expression || '').trim().toUpperCase();
    if (!expression) return false;
    return /^(SUM|AVG|COUNT|MIN|MAX)\s*\(/.test(expression) || expression === 'COUNT(*)';
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
        (Array.isArray(columns) ? columns : []).map((c) => [
            c?.name,
            classifyFieldType(c, safeRows),
        ])
    );

    const getFieldMeta = (name) => fieldMetaMap.get(name) || inferFieldTypeFromData(name, safeRows);
    const byRole = (role) => assignments.filter(a => a?.role === role && a?.field);
    const valueRoles = [FieldRoles.Y, FieldRoles.VALUE, FieldRoles.SIZE, FieldRoles.X];

    assignments.forEach((a) => {
        if (!a?.field || a.field === '__count__') return;
        const meta = getFieldMeta(a.field);
        if (!meta?.name) {
            errors.push(makeMessage('UNKNOWN_FIELD', `Assigned field '${a.field}' does not exist in dataset columns.`));
        }
    });

    const hasNumeric = assignments.some((a) => {
        if (!valueRoles.includes(a?.role)) return false;
        if (a?.semanticMeasureName) return true;
        if (String(a?.field || '').startsWith('__semantic__:')) return true;
        if (a.field === '__count__') return true;
        if (isAggregatedExpression(a)) return true;
        if (['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].includes(String(a?.aggregation || '').toUpperCase())) return true;
        const meta = getFieldMeta(a.field);
        return meta?.type === 'numeric';
    });

    const xField = byRole(FieldRoles.TIME)[0]?.field || byRole(FieldRoles.X)[0]?.field || byRole(FieldRoles.LEGEND)[0]?.field;
    const xMeta = xField ? getFieldMeta(xField) : null;
    const hierarchyCount = byRole(FieldRoles.HIERARCHY).length;

    if (safeRows.length === 0) {
        errors.push(makeMessage('EMPTY_DATASET', 'Dataset is empty.'));
    }

    if (chartType === ChartType.BAR && (!xField || !hasNumeric)) {
        errors.push(makeMessage('BAR_REQUIRED', getChartRequirementText(ChartType.BAR)));
    }
    if ([ChartType.LINE, ChartType.AREA].includes(chartType)) {
        if (!xField || !hasNumeric) errors.push(makeMessage('TREND_REQUIRED', getChartRequirementText(chartType)));
        if (xMeta?.type !== 'date') warnings.push(makeMessage('TREND_NO_TIME', 'Time field is preferred for trend charts.'));
    }
    if ([ChartType.PIE, ChartType.DONUT].includes(chartType) && (!byRole(FieldRoles.LEGEND)[0] || !hasNumeric)) {
        errors.push(makeMessage('PIE_REQUIRED', getChartRequirementText(chartType)));
    }
    if (chartType === ChartType.SCATTER) {
        const x = byRole(FieldRoles.X)[0]?.field;
        const y = byRole(FieldRoles.Y)[0]?.field;
        const yValueFields = [
            ...byRole(FieldRoles.Y).map((a) => a.field),
            ...byRole(FieldRoles.VALUE).map((a) => a.field),
        ].filter(Boolean);
        const numericMeasureCount = Array.from(new Set(yValueFields)).filter((field) => getFieldMeta(field)?.type === 'numeric').length;
        const hasDirectXY = Boolean(x && y && getFieldMeta(x)?.type === 'numeric' && getFieldMeta(y)?.type === 'numeric');
        if (!hasDirectXY && numericMeasureCount < 2) {
            errors.push(makeMessage('SCATTER_REQUIRED', getChartRequirementText(ChartType.SCATTER)));
        }
    }
    if (chartType === ChartType.BUBBLE) {
        const x = byRole(FieldRoles.X)[0]?.field || byRole(FieldRoles.TIME)[0]?.field;
        const y = byRole(FieldRoles.Y)[0]?.field || byRole(FieldRoles.VALUE)[0]?.field;
        const s = byRole(FieldRoles.SIZE)[0]?.field;
        if (!x || !y || !s) errors.push(makeMessage('BUBBLE_REQUIRED', getChartRequirementText(ChartType.BUBBLE)));
    }
    if ([ChartType.TREEMAP, ChartType.SUNBURST].includes(chartType) && (hierarchyCount < 1 || !hasNumeric)) {
        errors.push(makeMessage('HIERARCHY_REQUIRED', getChartRequirementText(chartType)));
    }
    if (chartType === ChartType.COMBO_BAR_LINE) {
        const seriesCount = byRole(FieldRoles.Y).length + byRole(FieldRoles.VALUE).length;
        if (!xField || seriesCount < 2) errors.push(makeMessage('COMBO_REQUIRED', getChartRequirementText(ChartType.COMBO_BAR_LINE)));
    }
    if ([ChartType.GAUGE, ChartType.KPI_SINGLE].includes(chartType) && !hasNumeric) {
        errors.push(makeMessage('KPI_REQUIRED', getChartRequirementText(chartType)));
    }
    if (chartType === ChartType.RADAR) {
        const ySeries = byRole(FieldRoles.Y).length + byRole(FieldRoles.VALUE).length;
        if (!xField || ySeries < 2) errors.push(makeMessage('RADAR_REQUIRED', getChartRequirementText(ChartType.RADAR)));
    }
    if ([ChartType.ORG_CHART, ChartType.ORG_TREE_STRUCTURED].includes(chartType)) {
        const nodeField = byRole(FieldRoles.NODE)[0]?.field;
        const parentField = byRole(FieldRoles.PARENT)[0]?.field;
        const hierarchyFields = byRole(FieldRoles.HIERARCHY).map(a => a.field).filter(Boolean);

        if (hierarchyFields.length < 2 && (!nodeField || !parentField)) {
            errors.push(makeMessage('ORG_REQUIRED', 'Org chart requires hierarchy fields (2+ levels) or Node + Parent.'));
        }

        if (nodeField && parentField) {
            if (detectOrgCycle(safeRows, nodeField, parentField)) errors.push(makeMessage('ORG_CYCLE', 'Org chart contains a cycle.'));
            const roots = detectMultipleRoots(safeRows, nodeField, parentField);
            if (roots > 1) warnings.push(makeMessage('ORG_MULTI_ROOT', `Org chart has ${roots} roots.`));
        }
    }

    const categoryCount = getDistinctCount(safeRows, xField);
    if (categoryCount > 30 && [ChartType.BAR, ChartType.LINE, ChartType.AREA, ChartType.COMBO_BAR_LINE].includes(chartType)) {
        warnings.push(makeMessage('LABEL_OVERLAP', 'Axis labels may overlap. Consider filtering data at source.'));
    }
    if (categoryCount > 10 && [ChartType.PIE, ChartType.DONUT].includes(chartType)) {
        warnings.push(makeMessage('PIE_CROWDED', 'Too many categories for a pie/donut chart.'));
    }

    const hasTime = Array.from(fieldMetaMap.values()).some(f => f.type === 'date');
    if (hasTime && hasNumeric && ![ChartType.LINE, ChartType.AREA].includes(chartType)) {
        suggestions.push(makeMessage('SUGGEST_LINE', 'Time + measure detected. Consider LINE chart.', { chartType: ChartType.LINE }));
    }
    if (hierarchyCount >= 2 && ![ChartType.TREEMAP, ChartType.SUNBURST].includes(chartType)) {
        suggestions.push(makeMessage('SUGGEST_HIERARCHY', 'Hierarchy fields detected. Consider TREEMAP or SUNBURST.', { chartType: ChartType.TREEMAP }));
    }

    return {
        errors,
        warnings,
        suggestions,
        fieldProfile: Array.from(fieldMetaMap.values()),
        chartType,
        normalizedConfig: configFromAssignments(chartType, assignments),
    };
}
