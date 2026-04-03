import { ChartType } from '../types';
import { FieldRoles, configFromAssignments, convertOldConfig } from './chartConfigSystem';

const SEMANTIC_PREFIX = '__semantic__:';
const SIMPLE_AGGREGATE_RE = /^\s*(SUM|AVG|COUNT|MIN|MAX|GROUP_BY)\s*\((.*)\)\s*$/i;

const parseSemanticMeasureFromAssignment = (assignment = {}) => {
    if (assignment?.semanticMeasureName) {
        return {
            name: String(assignment.semanticMeasureName),
            expression: assignment.semanticMeasureExpression || undefined,
        };
    }

    const field = String(assignment?.field || '');
    if (!field.startsWith(SEMANTIC_PREFIX)) return null;

    const name = field.slice(SEMANTIC_PREFIX.length).trim();
    if (!name) return null;

    return {
        name,
        expression: assignment?.semanticMeasureExpression || undefined,
    };
};

const toUpperAgg = (aggregation) => {
    const value = String(aggregation || '').toUpperCase();
    if (['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'GROUP_BY'].includes(value)) return value;
    return 'COUNT';
};

const parseSimpleAggregateExpression = (expression) => {
    const text = String(expression || '').trim();
    if (!text) return null;

    const match = SIMPLE_AGGREGATE_RE.exec(text);
    if (!match) return null;

    const aggregation = toUpperAgg(match[1]);
    if (!aggregation) return null;

    const rawField = String(match[2] || '').trim();
    if (!rawField) return null;

    return {
        aggregation,
        field: rawField === '*' ? '__count__' : rawField,
    };
};

const normalizeAssignments = (config) => {
    if (Array.isArray(config?.assignments) && config.assignments.length > 0) {
        return config.assignments;
    }
    return convertOldConfig(config).assignments || [];
};

const toServerFilter = (filter) => {
    if (!filter?.column) return null;

    if (filter.type === 'include') {
        const values = Array.isArray(filter.values) ? filter.values.map(v => String(v)) : [];
        return {
            field: filter.column,
            operator: 'IN',
            value: values,
        };
    }

    if (filter.type === 'exclude') {
        const values = Array.isArray(filter.values) ? filter.values.map(v => String(v)) : [];
        return {
            field: filter.column,
            operator: 'NOT_IN',
            value: values,
        };
    }

    if (filter.type === 'range') {
        return {
            field: filter.column,
            operator: 'BETWEEN',
            value: [Number(filter.rangeMin), Number(filter.rangeMax)],
        };
    }

    const operator = filter.operator || 'EQUALS';
    const opUpper = String(operator).toUpperCase();
    const rawValue = filter.value;

    if (opUpper === 'BETWEEN') {
        return {
            field: filter.column,
            operator: 'BETWEEN',
            value: [filter.value, filter.valueSecondary],
        };
    }

    if (!['IS_EMPTY', 'IS_TRUE', 'IS_FALSE'].includes(opUpper)) {
        if (rawValue === '' || rawValue === null || rawValue === undefined) {
            return null;
        }
    }

    return {
        field: filter.column,
        operator,
        value: rawValue,
    };
};

const dedupeFilters = (filters = []) => {
    const seen = new Set();
    const out = [];

    for (const f of filters) {
        if (!f || !f.field) continue;
        const key = JSON.stringify([f.field, f.operator, f.value]);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(f);
    }

    return out;
};

const collectMeasuresFromAssignments = (assignments = [], fallbackAggregation = 'COUNT', chartType = '', dataset = null) => {
    const normalizedType = String(chartType || '').toUpperCase();
    const includeXAsMeasure = normalizedType === ChartType.SCATTER || normalizedType === ChartType.BUBBLE;
    const numericColumns = new Set(
        (Array.isArray(dataset?.columns) ? dataset.columns : [])
            .filter((c) => c?.type === 'number')
            .map((c) => c.name)
    );
    const measureRoles = includeXAsMeasure
        ? [FieldRoles.X, FieldRoles.Y, FieldRoles.VALUE, FieldRoles.SIZE]
        : [FieldRoles.Y, FieldRoles.VALUE, FieldRoles.SIZE];

    const picked = [];

    assignments.forEach((a) => {
        if (!a?.field || !measureRoles.includes(a.role)) return;
        if (includeXAsMeasure && a.role === FieldRoles.X && a.field !== '__count__' && !numericColumns.has(a.field)) return;

        const semantic = parseSemanticMeasureFromAssignment(a);
        if (semantic?.name) {
            const key = `${semantic.name}::${semantic.expression || ''}`;
            if (!picked.some(item => `${item.name}::${item.expression || ''}` === key)) {
                picked.push({
                    name: semantic.name,
                    ...(semantic.expression ? { expression: semantic.expression } : {}),
                });
            }
            return;
        }

        if (typeof a?.expression === 'string' && a.expression.trim()) {
            const alias = a?.name || (a.field === '__count__' ? 'Count' : a.field);
            const expression = a.expression.trim();
            const parsed = parseSimpleAggregateExpression(expression);

            if (parsed?.field) {
                const key = `${alias}::${parsed.aggregation}::${parsed.field}`;
                if (!picked.some(item => `${item.name}::${item.aggregation || ''}::${item.field || ''}` === key)) {
                    picked.push({
                        name: alias,
                        field: parsed.field,
                        aggregation: parsed.aggregation,
                    });
                }
                return;
            }

            const key = `${alias}::${expression}`;
            if (!picked.some(item => `${item.name}::${item.expression || ''}` === key)) {
                picked.push({ name: alias, expression });
            }
            return;
        }

        const field = a.field;
        const aggregation = toUpperAgg(a.aggregation || fallbackAggregation);
        const alias = field === '__count__' ? 'Count' : field;
        const key = `${alias}::${aggregation}::${field}`;
        if (!picked.some(item => `${item.name}::${item.aggregation || ''}::${item.field || ''}` === key)) {
            picked.push({
                name: alias,
                field,
                aggregation,
            });
        }
    });

    if (picked.length === 0) {
        picked.push({ name: 'Count', field: '__count__', aggregation: 'COUNT' });
    }

    return picked;
};

const nextDrillDimension = (dataset, configDimension, drillPath = []) => {
    const cols = Array.isArray(dataset?.columns) ? dataset.columns : [];
    const used = new Set([configDimension, ...drillPath.map(d => d.dimensionCol)].filter(Boolean));

    const candidate = cols.find((c) => (c.type === 'string' || c.type === 'date') && !used.has(c.name));
    return candidate?.name || configDimension || cols[0]?.name || '';
};

const collectDimensions = ({ chartType, assignments, normalized, effectiveDimension, dataset }) => {
    const byRole = (role) => assignments.filter((a) => a?.role === role).map((a) => a?.field).filter(Boolean);

    if (chartType === ChartType.ORG_CHART || chartType === ChartType.ORG_TREE_STRUCTURED) {
        const hierarchyFields = Array.isArray(normalized?.hierarchyFields) ? normalized.hierarchyFields : [];
        if (hierarchyFields.length > 0) {
            return Array.from(new Set(hierarchyFields.filter(Boolean)));
        }
        return Array.from(new Set([
            ...byRole(FieldRoles.NODE),
            ...byRole(FieldRoles.PARENT),
            ...byRole(FieldRoles.LABEL),
            ...byRole(FieldRoles.COLOR),
        ]));
    }

    if (chartType === ChartType.SUNBURST || chartType === ChartType.TREEMAP) {
        return Array.from(new Set(byRole(FieldRoles.HIERARCHY)));
    }

    if (chartType === ChartType.TABLE) {
        return Array.from(new Set([
            normalized.dimension,
            ...(Array.isArray(normalized?.measures) ? normalized.measures : []),
            ...assignments.map((a) => a?.field),
        ].filter(Boolean)));
    }


    const defaultDimension = effectiveDimension || nextDrillDimension(dataset, normalized.dimension, []);

    const dimensionalRoles = [FieldRoles.X, FieldRoles.TIME, FieldRoles.LEGEND, FieldRoles.COLOR];
    const roleDimensions = assignments
        .filter((a) => dimensionalRoles.includes(a?.role))
        .map((a) => a?.field)
        .filter(Boolean);

    return Array.from(new Set([defaultDimension, ...roleDimensions].filter(Boolean)));
};

export const buildQuery = ({ config, dataset, datasetId, globalFilters = [], drillPath = [], effectiveDimension }) => {
    const normalized = {
        ...config,
        ...configFromAssignments(config?.type, normalizeAssignments(config)),
    };

    const assignments = normalizeAssignments(config);
    const localFilters = Array.isArray(normalized?.filters) ? normalized.filters : [];
    const drillFilters = drillPath.map((d) => ({
        column: d.dimensionCol,
        type: 'include',
        values: [String(d.value)],
        columnType: 'string',
    }));

    const datasetColumns = new Set(
        (Array.isArray(dataset?.columns) ? dataset.columns : []).map((c) => c?.name)
    );

    const scopedGlobalFilters = (Array.isArray(globalFilters) ? globalFilters : []).filter((filter) => {
        if (!filter) return false;
        if (filter.datasetId && filter.datasetId !== datasetId) return false;
        if (filter.column && datasetColumns.size > 0 && !datasetColumns.has(filter.column)) return false;
        return true;
    });

    const scopedLocalFilters = localFilters.filter((filter) => {
        if (!filter) return false;
        if (filter.column && datasetColumns.size > 0 && !datasetColumns.has(filter.column)) return false;
        return true;
    });

    const allFilters = dedupeFilters(
        [...scopedGlobalFilters, ...scopedLocalFilters, ...drillFilters]
            .map(toServerFilter)
            .filter(Boolean)
    );

    const chartType = normalized?.type;

    const dimensions = collectDimensions({
        chartType,
        assignments,
        normalized,
        effectiveDimension: effectiveDimension || nextDrillDimension(dataset, normalized.dimension, drillPath),
        dataset,
    });

    const orgHierarchyFields = Array.isArray(normalized?.hierarchyFields) ? normalized.hierarchyFields.filter(Boolean) : [];
    const useOrgHierarchy = (chartType === ChartType.ORG_CHART || chartType === ChartType.ORG_TREE_STRUCTURED) && orgHierarchyFields.length >= 2 && !normalized?.nodeField && !normalized?.parentField;
    const requestChartType = useOrgHierarchy ? ChartType.TABLE : chartType;

    const measures = requestChartType === ChartType.TABLE
        ? []
        : collectMeasuresFromAssignments(assignments, normalized.aggregation || 'COUNT', chartType, dataset);
    const sortField = measures[0]?.name || measures[0]?.expression || dimensions[0] || 'Count';
    const sortOrder = 'desc';

    return {
        datasetId,
        chartType: requestChartType,
        dimensions,
        measures,
        filters: allFilters,
        sort: {
            field: sortField,
            order: sortOrder,
        },
        limit: requestChartType === ChartType.TABLE ? 2000 : 200,
    };
};
