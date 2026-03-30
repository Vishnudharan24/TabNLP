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
        const values = Array.isArray(filter.values) ? filter.values.map(v => String(v)) : [];
        return {
            field: filter.column,
            operator: 'IN',
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

    return {
        field: filter.column,
        operator: filter.operator || 'EQUALS',
        value: filter.value,
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

const collectDimensions = ({ chartType, assignments, normalized, effectiveDimension, dataset }) => {
    const byRole = (role) => assignments.filter((a) => a?.role === role).map((a) => a?.field).filter(Boolean);

    if (chartType === ChartType.ORG_CHART || chartType === ChartType.ORG_TREE_STRUCTURED) {
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

    const allFilters = dedupeFilters(
        [...globalFilters, ...localFilters, ...drillFilters]
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

    const measures = chartType === ChartType.TABLE
        ? []
        : collectMeasuresFromAssignments(assignments, normalized.aggregation || 'COUNT');
    const sortField = measures[0]?.alias || measures[0]?.field || dimensions[0] || 'Count';

    return {
        datasetId,
        chartType,
        dimensions,
        measures,
        filters: allFilters,
        sort: {
            field: sortField,
            order: 'desc',
        },
        limit: chartType === ChartType.TABLE ? 1000 : 200,
    };
};
