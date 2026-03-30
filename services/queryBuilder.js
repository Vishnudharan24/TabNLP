import { ChartType } from '../types';
import { FieldRoles, configFromAssignments, convertOldConfig } from './chartConfigSystem';

const toUpperAgg = (aggregation) => {
    const value = String(aggregation || '').toUpperCase();
    if (['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'GROUP_BY'].includes(value)) return value;
    return 'COUNT';
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
        return {
            field: filter.column,
            type: 'include',
            values: Array.isArray(filter.values) ? filter.values.map(v => String(v)) : [],
            columnType: filter.columnType,
        };
    }

    if (filter.type === 'range') {
        return {
            field: filter.column,
            type: 'range',
            min: Number(filter.rangeMin),
            max: Number(filter.rangeMax),
            columnType: filter.columnType,
        };
    }

    // DataPanel local filter shape
    return {
        field: filter.column,
        type: 'operator',
        operator: filter.operator || 'EQUALS',
        value: filter.value,
        valueSecondary: filter.valueSecondary,
        columnType: filter.columnType,
    };
};

const dedupeFilters = (filters = []) => {
    const seen = new Set();
    const out = [];

    for (const f of filters) {
        if (!f || !f.field) continue;
        const key = JSON.stringify([f.field, f.type, f.operator, f.min, f.max, f.values, f.value, f.valueSecondary]);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(f);
    }

    return out;
};

const collectMeasuresFromAssignments = (assignments = [], fallbackAggregation = 'COUNT') => {
    const picked = [];

    assignments.forEach((a) => {
        if (!a?.field || ![FieldRoles.Y, FieldRoles.VALUE, FieldRoles.SIZE, FieldRoles.X].includes(a.role)) return;
        const field = a.field;
        const aggregation = toUpperAgg(a.aggregation || fallbackAggregation);
        const alias = field === '__count__' ? 'Count' : field;
        const key = `${field}::${aggregation}::${alias}`;
        if (!picked.some(item => `${item.field}::${item.aggregation}::${item.alias}` === key)) {
            picked.push({ field, aggregation, alias });
        }
    });

    if (picked.length === 0) {
        picked.push({ field: '__count__', aggregation: 'COUNT', alias: 'Count' });
    }

    return picked;
};

const nextDrillDimension = (dataset, configDimension, drillPath = []) => {
    const cols = Array.isArray(dataset?.columns) ? dataset.columns : [];
    const used = new Set([configDimension, ...drillPath.map(d => d.dimensionCol)].filter(Boolean));

    const candidate = cols.find((c) => (c.type === 'string' || c.type === 'date') && !used.has(c.name));
    return candidate?.name || configDimension || cols[0]?.name || '';
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

    const allFilters = dedupeFilters(
        [...globalFilters, ...localFilters, ...drillFilters]
            .map(toServerFilter)
            .filter(Boolean)
    );

    const chartType = normalized?.type;

    // ORG charts: backend returns tree payload
    if (chartType === ChartType.ORG_CHART || chartType === ChartType.ORG_TREE_STRUCTURED) {
        const nodeField = assignments.find(a => a.role === FieldRoles.NODE)?.field || normalized.nodeField || normalized.dimension;
        const parentField = assignments.find(a => a.role === FieldRoles.PARENT)?.field || normalized.parentField;
        const labelField = assignments.find(a => a.role === FieldRoles.LABEL)?.field || normalized.labelField;
        const colorField = assignments.find(a => a.role === FieldRoles.COLOR)?.field || normalized.colorField;

        return {
            datasetId,
            mode: 'org_tree',
            nodeField,
            parentField,
            labelField,
            colorField,
            filters: allFilters,
        };
    }

    // Hierarchy charts: backend returns hierarchy tree
    if (chartType === ChartType.SUNBURST || chartType === ChartType.TREEMAP) {
        const hierarchy = assignments
            .filter(a => a.role === FieldRoles.HIERARCHY)
            .map(a => a.field)
            .filter(Boolean);

        const measure = collectMeasuresFromAssignments(assignments, normalized.aggregation || 'COUNT')[0];

        return {
            datasetId,
            mode: 'hierarchy',
            hierarchy,
            valueField: measure?.field || '__count__',
            valueAggregation: measure?.aggregation || 'COUNT',
            filters: allFilters,
        };
    }

    // TABLE charts request raw records (already backend filtered)
    if (chartType === ChartType.TABLE) {
        const fields = Array.from(new Set([
            normalized.dimension,
            ...(Array.isArray(normalized.measures) ? normalized.measures : []),
            ...assignments.map(a => a.field),
        ].filter(Boolean)));

        return {
            datasetId,
            mode: 'raw',
            fields,
            filters: allFilters,
            limit: 1000,
        };
    }

    const dimension = effectiveDimension || nextDrillDimension(dataset, normalized.dimension, drillPath);
    const measures = collectMeasuresFromAssignments(assignments, normalized.aggregation || 'COUNT');

    return {
        datasetId,
        mode: 'aggregate',
        dimensions: dimension ? [dimension] : [],
        measures,
        filters: allFilters,
        sortBy: measures[0]?.alias || measures[0]?.field || 'Count',
        sortOrder: 'desc',
    };
};
