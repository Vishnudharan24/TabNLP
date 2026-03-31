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
    NODE: 'node',
    PARENT: 'parent',
    LABEL: 'label',
};

const NUMERIC_TYPES = new Set(['number']);
const TIME_TYPES = new Set(['date', 'datetime']);

const toUpperAgg = (agg) => {
    const value = String(agg || '').toUpperCase();
    return ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'GROUP_BY'].includes(value) ? value : undefined;
};

const toLegacyMeasureExpression = (field, aggregation) => {
    const agg = toUpperAgg(aggregation);
    if (field === '__count__') return 'COUNT(*)';
    if (!agg) return undefined;
    if (agg === 'GROUP_BY') return `COUNT(${field})`;
    return `${agg}(${field})`;
};

const normalizeLegacyAssignment = (assignment = {}) => {
    const next = { ...assignment };
    const role = String(next?.role || '');
    const isMeasureRole = ['x', 'y', 'value', 'size'].includes(role);
    const field = String(next?.field || '');

    if (isMeasureRole && !next?.expression && field) {
        const expression = toLegacyMeasureExpression(field, next?.aggregation);
        if (expression) next.expression = expression;
    }

    if ('aggregation' in next) {
        delete next.aggregation;
    }

    return next;
};

const normalizeChartType = (type) => {
    if (type === ChartType.BAR_CLUSTERED || type === ChartType.BAR_STACKED || type === ChartType.BAR_PERCENT || type === ChartType.BAR_HORIZONTAL || type === ChartType.BAR_HORIZONTAL_STACKED || type === ChartType.BAR_HORIZONTAL_PERCENT) return ChartType.BAR;
    if (type === ChartType.LINE_SMOOTH || type === ChartType.LINE_STRAIGHT || type === ChartType.LINE_STEP || type === ChartType.LINE_DASHED || type === ChartType.LINE_MULTI_AXIS) return ChartType.LINE;
    if (type === ChartType.AREA_SMOOTH || type === ChartType.AREA_STACKED || type === ChartType.AREA_PERCENT || type === ChartType.AREA_STEP) return ChartType.AREA;
    if (type === ChartType.ORG_TREE_STRUCTURED) return ChartType.ORG_CHART;
    if (type === ChartType.SPARKLINE) return ChartType.KPI_SINGLE;
    return type;
};

const isEmpty = (value) => value === null || value === undefined || String(value).trim() === '';

const safeNodeKey = (value) => String(value ?? '').trim();

const hasCycle = (nodeKey, parentKey, parentByNode) => {
    let cursor = parentKey;
    const guard = new Set([nodeKey]);

    while (cursor && !guard.has(cursor)) {
        guard.add(cursor);
        cursor = parentByNode.get(cursor);
    }

    return cursor === nodeKey;
};

const toNodeTitle = (node = {}) => {
    if (!isEmpty(node.label)) return String(node.label);
    if (!isEmpty(node.name)) return String(node.name);
    return String(node.id || 'Unknown');
};

const decorateOrgTree = (roots = []) => {
    const withSizes = (node) => {
        const children = Array.isArray(node.children) ? node.children.map(withSizes) : [];
        const teamSize = children.reduce((sum, child) => sum + child.teamSize, 0);
        const directReports = children.length;

        return {
            ...node,
            name: toNodeTitle(node),
            directReports,
            teamSize: Math.max(1, teamSize + 1),
            children: children.length > 0 ? children : undefined,
        };
    };

    return (Array.isArray(roots) ? roots : []).map(withSizes);
};

export function buildOrgTree(data = [], nodeField, parentField, labelField, colorField) {
    const rows = Array.isArray(data) ? data : [];
    const nodeCol = String(nodeField || '').trim();
    const parentCol = String(parentField || '').trim();

    if (!nodeCol || !parentCol) {
        return {
            treeData: { name: 'Organization', children: [] },
            meta: { totalNodes: 0, roots: 0, cycleBreaks: 0, missingParents: 0 },
        };
    }

    const nodeMap = new Map();
    const parentByNode = new Map();
    const missingParentKeys = new Set();

    rows.forEach((row, idx) => {
        const nodeKey = safeNodeKey(row?.[nodeCol]);
        if (!nodeKey) return;

        const parentKey = safeNodeKey(row?.[parentCol]);
        const labelValue = labelField ? row?.[labelField] : undefined;
        const colorValue = colorField ? row?.[colorField] : undefined;

        if (!nodeMap.has(nodeKey)) {
            nodeMap.set(nodeKey, {
                id: nodeKey,
                key: nodeKey,
                name: nodeKey,
                label: !isEmpty(labelValue) ? String(labelValue) : undefined,
                colorValue: !isEmpty(colorValue) ? String(colorValue) : undefined,
                sourceIndex: idx,
                children: [],
                meta: {
                    nodeField: nodeCol,
                    parentField: parentCol,
                    labelField: labelField || null,
                    colorField: colorField || null,
                    nodeValue: nodeKey,
                    parentValue: parentKey || null,
                    labelValue: !isEmpty(labelValue) ? String(labelValue) : null,
                    colorValue: !isEmpty(colorValue) ? String(colorValue) : null,
                },
            });
        } else {
            const existing = nodeMap.get(nodeKey);
            if (isEmpty(existing.label) && !isEmpty(labelValue)) existing.label = String(labelValue);
            if (isEmpty(existing.colorValue) && !isEmpty(colorValue)) existing.colorValue = String(colorValue);
            existing.meta = {
                ...existing.meta,
                labelValue: existing.meta?.labelValue || (!isEmpty(labelValue) ? String(labelValue) : null),
                colorValue: existing.meta?.colorValue || (!isEmpty(colorValue) ? String(colorValue) : null),
            };
        }

        parentByNode.set(nodeKey, parentKey || null);
        if (parentKey && !nodeMap.has(parentKey)) {
            missingParentKeys.add(parentKey);
        }
    });

    const childrenByParent = new Map();
    const roots = [];
    let cycleBreaks = 0;
    let missingParents = 0;

    const attachToParent = (parentKey, nodeKey) => {
        if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
        childrenByParent.get(parentKey).push(nodeKey);
    };

    nodeMap.forEach((node, nodeKey) => {
        const rawParent = parentByNode.get(nodeKey);

        if (!rawParent) {
            roots.push(nodeKey);
            return;
        }

        if (rawParent === nodeKey || hasCycle(nodeKey, rawParent, parentByNode)) {
            cycleBreaks += 1;
            roots.push(nodeKey);
            return;
        }

        if (!nodeMap.has(rawParent)) {
            missingParents += 1;
            attachToParent('__unknown__', nodeKey);
            return;
        }

        attachToParent(rawParent, nodeKey);
    });

    const toTreeNode = (nodeKey, ancestry = new Set()) => {
        if (ancestry.has(nodeKey)) {
            cycleBreaks += 1;
            return null;
        }

        const nextAncestry = new Set(ancestry);
        nextAncestry.add(nodeKey);

        const node = nodeMap.get(nodeKey);
        if (!node) return null;

        const childKeys = childrenByParent.get(nodeKey) || [];
        const children = childKeys
            .map((childKey) => toTreeNode(childKey, nextAncestry))
            .filter(Boolean);

        return {
            ...node,
            name: toNodeTitle(node),
            children,
        };
    };

    const rootNodes = roots.map((rootKey) => toTreeNode(rootKey)).filter(Boolean);

    const unknownChildren = (childrenByParent.get('__unknown__') || [])
        .map((childKey) => toTreeNode(childKey))
        .filter(Boolean);

    if (unknownChildren.length > 0) {
        rootNodes.push({
            id: '__unknown__',
            key: '__unknown__',
            name: 'Unknown',
            label: 'Unknown',
            children: unknownChildren,
            meta: {
                nodeField: nodeCol,
                parentField: parentCol,
                labelField: labelField || null,
                colorField: colorField || null,
                nodeValue: '__unknown__',
                parentValue: null,
                labelValue: 'Unknown',
                colorValue: null,
                missingParentCount: unknownChildren.length,
            },
        });
    }

    const normalizedRoots = decorateOrgTree(rootNodes);
    const treeData = normalizedRoots.length <= 1
        ? (normalizedRoots[0] || { name: 'Organization', children: [] })
        : {
            id: '__organization__',
            key: '__organization__',
            name: 'Organization',
            label: 'Organization',
            children: normalizedRoots,
            meta: {
                nodeField: nodeCol,
                parentField: parentCol,
                labelField: labelField || null,
                colorField: colorField || null,
                nodeValue: '__organization__',
                parentValue: null,
                labelValue: 'Organization',
                colorValue: null,
            },
            directReports: normalizedRoots.length,
            teamSize: normalizedRoots.reduce((sum, node) => sum + Number(node.teamSize || 1), 1),
        };

    return {
        treeData,
        meta: {
            totalNodes: nodeMap.size,
            roots: normalizedRoots.length,
            cycleBreaks,
            missingParents,
            distinctMissingParentValues: missingParentKeys.size,
        },
    };
}

export function searchNode(tree, query = '') {
    const q = String(query || '').trim().toLowerCase();
    if (!tree || !q) {
        return {
            matchedNodeIds: [],
            expandedNodeIds: [],
            firstMatchPath: [],
            found: false,
        };
    }

    const matched = new Set();
    const expanded = new Set();
    let firstPath = [];

    const walk = (node, path = []) => {
        if (!node) return false;
        const id = String(node.id || node.key || node.name || '').trim() || `node-${path.length}`;
        const nextPath = [...path, id];

        const haystack = [
            node.name,
            node.label,
            node.meta?.nodeValue,
            node.meta?.labelValue,
            node.meta?.colorValue,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        const nodeMatches = haystack.includes(q);
        let hasDescendantMatch = false;

        const children = Array.isArray(node.children) ? node.children : [];
        children.forEach((child) => {
            if (walk(child, nextPath)) hasDescendantMatch = true;
        });

        if (nodeMatches) {
            matched.add(id);
            if (firstPath.length === 0) firstPath = nextPath;
        }

        if (nodeMatches || hasDescendantMatch) {
            nextPath.forEach((pathId) => expanded.add(pathId));
            return true;
        }

        return false;
    };

    walk(tree, []);

    return {
        matchedNodeIds: Array.from(matched),
        expandedNodeIds: Array.from(expanded),
        firstMatchPath: firstPath,
        found: matched.size > 0,
    };
}

export function convertOldConfig(oldConfig = {}) {
    if (Array.isArray(oldConfig.assignments) && oldConfig.assignments.length > 0) {
        const chartType = oldConfig.type || oldConfig.chartType || ChartType.BAR;
        const isDeprecatedSparkline = chartType === ChartType.SPARKLINE;
        return {
            chartType: isDeprecatedSparkline ? ChartType.KPI_SINGLE : (oldConfig.type || oldConfig.chartType || ChartType.BAR),
            assignments: oldConfig.assignments.map(normalizeLegacyAssignment),
        };
    }

    const chartType = oldConfig.type || oldConfig.chartType || ChartType.BAR;
    const normalizedType = normalizeChartType(chartType);
    const isDeprecatedSparkline = chartType === ChartType.SPARKLINE;
    const resolvedChartType = isDeprecatedSparkline ? ChartType.KPI_SINGLE : normalizedType;
    const assignments = [];

    const dim = oldConfig.dimension || oldConfig.xAxisField || '';
    const measures = Array.isArray(oldConfig.measures) ? oldConfig.measures.filter(Boolean) : [];
    const agg = toUpperAgg(oldConfig.aggregation);

    if ([ChartType.SUNBURST, ChartType.TREEMAP].includes(normalizedType)) {
        const hierarchyFields = Array.isArray(oldConfig.hierarchyFields) && oldConfig.hierarchyFields.length > 0
            ? oldConfig.hierarchyFields
            : (dim ? [dim] : []);
        hierarchyFields.forEach((field) => assignments.push({ field, role: FieldRoles.HIERARCHY }));
        if (measures[0]) assignments.push(normalizeLegacyAssignment({ field: measures[0], role: FieldRoles.VALUE, ...(toLegacyMeasureExpression(measures[0], agg) ? { expression: toLegacyMeasureExpression(measures[0], agg) } : {}) }));
        else assignments.push(normalizeLegacyAssignment({ field: '__count__', role: FieldRoles.VALUE, expression: 'COUNT(*)' }));
        return { chartType: resolvedChartType, assignments };
    }

    if (normalizedType === ChartType.ORG_CHART) {
        const nodeField = oldConfig.nodeField || oldConfig.dimension || oldConfig.xAxisField || '';
        const parentField = oldConfig.parentField || oldConfig.yAxisField || '';
        const labelField = oldConfig.labelField || oldConfig.legendField || '';
        const colorField = oldConfig.colorField || '';

        if (nodeField) assignments.push({ field: nodeField, role: FieldRoles.NODE });
        if (parentField) assignments.push({ field: parentField, role: FieldRoles.PARENT });
        if (labelField) assignments.push({ field: labelField, role: FieldRoles.LABEL });
        if (colorField) assignments.push({ field: colorField, role: FieldRoles.COLOR });

        return { chartType: resolvedChartType, assignments };
    }

    if ([ChartType.PIE, ChartType.DONUT].includes(normalizedType)) {
        if (dim) assignments.push({ field: dim, role: FieldRoles.LEGEND });
        if (measures[0]) assignments.push(normalizeLegacyAssignment({ field: measures[0], role: FieldRoles.VALUE, ...(toLegacyMeasureExpression(measures[0], agg) ? { expression: toLegacyMeasureExpression(measures[0], agg) } : {}) }));
        else assignments.push(normalizeLegacyAssignment({ field: '__count__', role: FieldRoles.VALUE, expression: 'COUNT(*)' }));
        return { chartType: resolvedChartType, assignments };
    }

    if (normalizedType === ChartType.BUBBLE) {
        if (measures[0]) assignments.push(normalizeLegacyAssignment({ field: measures[0], role: FieldRoles.X, ...(toLegacyMeasureExpression(measures[0], agg) ? { expression: toLegacyMeasureExpression(measures[0], agg) } : {}) }));
        if (measures[1] || measures[0]) assignments.push(normalizeLegacyAssignment({ field: measures[1] || measures[0], role: FieldRoles.Y, ...(toLegacyMeasureExpression(measures[1] || measures[0], agg) ? { expression: toLegacyMeasureExpression(measures[1] || measures[0], agg) } : {}) }));
        if (measures[2] || measures[1] || measures[0]) assignments.push(normalizeLegacyAssignment({ field: measures[2] || measures[1] || measures[0], role: FieldRoles.SIZE, ...(toLegacyMeasureExpression(measures[2] || measures[1] || measures[0], agg) ? { expression: toLegacyMeasureExpression(measures[2] || measures[1] || measures[0], agg) } : {}) }));
        if (dim) assignments.push({ field: dim, role: FieldRoles.COLOR });
        return { chartType: resolvedChartType, assignments };
    }

    if (normalizedType === ChartType.SCATTER) {
        if (measures[0]) assignments.push(normalizeLegacyAssignment({ field: measures[0], role: FieldRoles.X, ...(toLegacyMeasureExpression(measures[0], agg) ? { expression: toLegacyMeasureExpression(measures[0], agg) } : {}) }));
        if (measures[1] || measures[0]) assignments.push(normalizeLegacyAssignment({ field: measures[1] || measures[0], role: FieldRoles.Y, ...(toLegacyMeasureExpression(measures[1] || measures[0], agg) ? { expression: toLegacyMeasureExpression(measures[1] || measures[0], agg) } : {}) }));
        if (dim) assignments.push({ field: dim, role: FieldRoles.COLOR });
        return { chartType: resolvedChartType, assignments };
    }

    if ([ChartType.GAUGE, ChartType.KPI_SINGLE].includes(normalizedType)) {
        if (measures[0]) assignments.push(normalizeLegacyAssignment({ field: measures[0], role: FieldRoles.VALUE, ...(toLegacyMeasureExpression(measures[0], agg) ? { expression: toLegacyMeasureExpression(measures[0], agg) } : {}) }));
        else assignments.push(normalizeLegacyAssignment({ field: '__count__', role: FieldRoles.VALUE, expression: 'COUNT(*)' }));
        return { chartType: resolvedChartType, assignments };
    }

    if (dim) {
        const dimRole = normalizedType === ChartType.LINE || normalizedType === ChartType.AREA
            ? FieldRoles.TIME
            : FieldRoles.X;
        assignments.push({ field: dim, role: dimRole });
    }

    measures.forEach((field) => assignments.push(normalizeLegacyAssignment({ field, role: FieldRoles.Y, ...(toLegacyMeasureExpression(field, agg) ? { expression: toLegacyMeasureExpression(field, agg) } : {}) })));

    if (assignments.length === 0) {
        assignments.push(normalizeLegacyAssignment({ field: '__count__', role: FieldRoles.VALUE, expression: 'COUNT(*)' }));
    }

    return { chartType: resolvedChartType, assignments };
}

export function configFromAssignments(chartType, assignments = []) {
    const safe = Array.isArray(assignments) ? assignments : [];
    const normalizedType = normalizeChartType(chartType);
    const first = (role) => safe.find(a => a.role === role && a.field)?.field;
    const list = (role) => safe.filter(a => a.role === role && a.field).map(a => a.field);

    const hierarchy = list(FieldRoles.HIERARCHY);
    const orgNode = first(FieldRoles.NODE);
    const orgParent = first(FieldRoles.PARENT);
    const orgLabel = first(FieldRoles.LABEL);
    const orgColor = first(FieldRoles.COLOR);
    const yFields = list(FieldRoles.Y);
    const valueFields = list(FieldRoles.VALUE);
    const x = first(FieldRoles.TIME) || first(FieldRoles.X) || first(FieldRoles.LEGEND) || hierarchy[0] || '';

    const measures = [];
    const includeXAsMeasure = normalizedType === ChartType.SCATTER || normalizedType === ChartType.BUBBLE;

    [...yFields, ...valueFields, first(FieldRoles.SIZE), ...(includeXAsMeasure ? [first(FieldRoles.X)] : []), first(FieldRoles.Y)]
        .filter(Boolean)
        .forEach((field) => {
            if (!measures.includes(field)) measures.push(field);
        });

    if (chartType === ChartType.ORG_CHART) {
        return {
            type: chartType,
            dimension: orgNode || '',
            measures: ['__count__'],
            xAxisField: orgNode || '',
            yAxisField: orgParent || '',
            legendField: orgColor || '',
            sizeField: '',
            hierarchyFields: [],
            nodeField: orgNode || '',
            parentField: orgParent || '',
            labelField: orgLabel || '',
            colorField: orgColor || '',
            assignments: safe,
        };
    }

    return {
        type: chartType,
        dimension: x,
        measures: measures.length > 0 ? measures : ['__count__'],
        xAxisField: first(FieldRoles.X) || first(FieldRoles.TIME) || '',
        yAxisField: first(FieldRoles.Y) || first(FieldRoles.VALUE) || '',
        legendField: first(FieldRoles.LEGEND) || first(FieldRoles.COLOR) || '',
        sizeField: first(FieldRoles.SIZE) || '',
        hierarchyFields: hierarchy,
        assignments: safe,
    };
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

    if (type === ChartType.ORG_CHART || type === ChartType.ORG_TREE_STRUCTURED) {
        const byName = safeColumns.map(c => ({ ...c, lower: String(c?.name || '').toLowerCase() }));
        const firstByRegex = (regex, pool = byName) => pool.find(c => regex.test(c.lower))?.name;

        const nodeField = firstByRegex(/(^|\b)(employee\s*id|emp\s*id|employee|staff\s*id|person\s*id|user\s*id)(\b|$)/)
            || firstByRegex(/(^|\b)(full\s*name|employee\s*name|name)(\b|$)/)
            || sortedCategorical[0]?.name;

        const parentField = firstByRegex(/(^|\b)(manager\s*id|mgr\s*id|manager|parent\s*id|supervisor\s*id|reports\s*to|lead\s*id)(\b|$)/)
            || sortedCategorical.find(c => c.name !== nodeField)?.name;

        const labelField = firstByRegex(/(^|\b)(designation|title|role|position|full\s*name|name)(\b|$)/)
            || sortedCategorical.find(c => c.name !== nodeField && c.name !== parentField)?.name;

        const colorField = firstByRegex(/(^|\b)(department|dept|business\s*unit|team|division|function)(\b|$)/)
            || sortedCategorical.find(c => ![nodeField, parentField, labelField].includes(c.name))?.name;

        if (nodeField) assignments.push({ field: nodeField, role: FieldRoles.NODE });
        if (parentField) assignments.push({ field: parentField, role: FieldRoles.PARENT });
        if (labelField && labelField !== nodeField) assignments.push({ field: labelField, role: FieldRoles.LABEL });
        if (colorField && ![nodeField, parentField, labelField].includes(colorField)) assignments.push({ field: colorField, role: FieldRoles.COLOR });

        return assignments;
    }

    if (type === ChartType.PIE || type === ChartType.DONUT) {
        if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.LEGEND });
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.VALUE });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE });
        return assignments;
    }

    if (type === ChartType.SUNBURST || type === ChartType.TREEMAP) {
        [firstCat, secondCat, sortedCategorical[2]?.name].filter(Boolean).forEach((field) => assignments.push({ field, role: FieldRoles.HIERARCHY }));
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.VALUE });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE });
        return assignments;
    }

    if (type === ChartType.SCATTER) {
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.X });
        if (secondNum || firstNum) assignments.push({ field: secondNum || firstNum || '__count__', role: FieldRoles.Y });
        if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.COLOR });
        return assignments;
    }

    if (type === ChartType.BUBBLE) {
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.X });
        assignments.push({ field: secondNum || firstNum || '__count__', role: FieldRoles.Y });
        assignments.push({ field: thirdNum || secondNum || firstNum || '__count__', role: FieldRoles.SIZE });
        if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.COLOR });
        return assignments;
    }

    if (type === ChartType.HEATMAP) {
        if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.X });
        if (secondCat || firstCat) assignments.push({ field: secondCat || firstCat || '__bucket__', role: FieldRoles.Y });
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.VALUE });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE });
        return assignments;
    }

    if (type === ChartType.GAUGE || type === ChartType.KPI_SINGLE) {
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.VALUE });
        else assignments.push({ field: '__count__', role: FieldRoles.VALUE });
        return assignments;
    }

    if (type === ChartType.RADAR) {
        if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.LEGEND });
        [firstNum, secondNum, thirdNum].filter(Boolean).forEach((field) => assignments.push({ field, role: FieldRoles.Y }));
        if (assignments.filter(a => a.role === FieldRoles.Y).length === 0) {
            assignments.push({ field: '__count__', role: FieldRoles.Y });
        }
        return assignments;
    }

    if (type === ChartType.LINE || type === ChartType.AREA) {
        if (firstTime) assignments.push({ field: firstTime, role: FieldRoles.TIME });
        else if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.X });
        if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.Y });
        else assignments.push({ field: '__count__', role: FieldRoles.Y });
        if (secondCat) assignments.push({ field: secondCat, role: FieldRoles.LEGEND });
        return assignments;
    }

    // BAR + generic fallback
    if (firstCat) assignments.push({ field: firstCat, role: FieldRoles.X });
    else if (firstTime) assignments.push({ field: firstTime, role: FieldRoles.TIME });
    if (firstNum) assignments.push({ field: firstNum, role: FieldRoles.Y });
    else assignments.push({ field: '__count__', role: FieldRoles.Y });
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

    if (normalizeChartType(normalized.chartType) === ChartType.ORG_CHART || normalizeChartType(normalized.chartType) === ChartType.ORG_TREE_STRUCTURED) {
        const nodeCount = assignments.filter(a => a.role === FieldRoles.NODE).length;
        const parentCount = assignments.filter(a => a.role === FieldRoles.PARENT).length;
        if (nodeCount === 0) warnings.push('Org chart needs a Node field.');
        if (parentCount === 0) warnings.push('Org chart needs a Parent field.');
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
