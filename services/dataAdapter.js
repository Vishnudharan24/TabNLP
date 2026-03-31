const ensureArray = (value, message) => {
    if (!Array.isArray(value)) throw new Error(message);
    return value;
};

const normalizeMeasureList = (measures = []) => {
    return ensureArray(measures, 'Invalid config: measures must be an array').map((m, idx) => {
        if (typeof m === 'string') {
            const name = m.trim();
            if (!name) throw new Error(`Invalid config: measures[${idx}] is empty`);
            return { name };
        }

        if (m && typeof m === 'object') {
            const name = String(m.name || m.alias || '').trim();
            const expression = String(m.expression || '').trim();
            const field = String(m.field || '').trim();
            const resolvedName = name || field || expression;
            if (!resolvedName) throw new Error(`Invalid config: measures[${idx}] must include name, field, or expression`);
            return { ...m, name: resolvedName };
        }

        throw new Error(`Invalid config: measures[${idx}] is not valid`);
    });
};

export const getColumnIndex = (columns = [], field = '') => {
    const safeColumns = ensureArray(columns, 'Invalid response: columns must be an array');
    const target = String(field || '').trim();
    if (!target) throw new Error('Missing field name while resolving column index');

    const exact = safeColumns.indexOf(target);
    if (exact >= 0) return exact;

    const lower = target.toLowerCase();
    const ci = safeColumns.findIndex((c) => String(c || '').toLowerCase() === lower);
    if (ci >= 0) return ci;

    throw new Error(`Missing required column: '${target}'`);
};

export const buildDimensionLabel = (row = [], dimIndexes = []) => {
    if (!Array.isArray(row)) throw new Error('Invalid row: expected array row for dimension label building');
    const indexes = ensureArray(dimIndexes, 'Invalid dimension indexes: expected array');
    if (indexes.length === 0) throw new Error('Missing dimension indexes for label building');

    const parts = indexes.map((idx) => {
        const value = row[idx];
        return value === null || value === undefined || String(value) === '' ? 'Unknown' : String(value);
    });

    return parts.join(' • ');
};

const toNumeric = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const toRowObject = (columns, row) => {
    if (Array.isArray(row)) {
        return Object.fromEntries(columns.map((col, idx) => [col, row[idx]]));
    }
    if (row && typeof row === 'object') return { ...row };
    return Object.fromEntries(columns.map((col) => [col, undefined]));
};

const normalizeConfig = (config = {}) => {
    if (!config || typeof config !== 'object') throw new Error('Invalid config: expected object');

    const chartType = String(config.chartType || '').trim();
    if (!chartType) throw new Error('Invalid config: chartType is required');

    const dimensionFields = Array.isArray(config.dimensionFields)
        ? config.dimensionFields.filter(Boolean)
        : (config.dimensionField ? [config.dimensionField] : (config.dimension ? [config.dimension] : []));

    const measures = normalizeMeasureList(config.measures || []);

    return {
        ...config,
        chartType,
        dimensionFields,
        measures,
    };
};

export const adaptQueryResponse = (response, config = {}) => {
    const columns = ensureArray(response?.columns, 'Invalid response: columns must be an array');
    const rows = ensureArray(response?.rows, 'Invalid response: rows must be an array');

    if (rows.length === 0) {
        throw new Error('Empty result: backend query returned no rows');
    }

    const normalizedConfig = normalizeConfig(config);
    const { chartType, dimensionFields, measures } = normalizedConfig;

    const dimIndexes = dimensionFields.map((d) => getColumnIndex(columns, d));
    const measureIndexes = measures.map((m) => getColumnIndex(columns, m.name));
    const rowMatrix = rows.map((row) => Array.isArray(row) ? [...row] : columns.map((c) => row?.[c]));
    const records = rowMatrix.map((row) => toRowObject(columns, row));

    const chartTypeUpper = chartType.toUpperCase();
    const isPie = ['PIE', 'DONUT', 'ROSE', 'PIE_SEMI', 'DONUT_SEMI'].includes(chartTypeUpper);
    const isScatter = chartTypeUpper === 'SCATTER';
    const isBubble = chartTypeUpper === 'BUBBLE';
    const isCombo = chartTypeUpper.startsWith('COMBO');

    if (!isScatter && !isBubble && dimensionFields.length === 0) {
        throw new Error(`Invalid config: dimensionFields are required for chartType '${chartType}'`);
    }

    if (measureIndexes.length === 0) {
        throw new Error('Invalid config: at least one measure is required');
    }

    const labels = dimensionFields.length > 0
        ? rowMatrix.map((row) => buildDimensionLabel(row, dimIndexes))
        : [];

    if (isScatter || isBubble) {
        const xName = String(normalizedConfig.xMeasure || measures[0]?.name || '').trim();
        const yName = String(normalizedConfig.yMeasure || measures[1]?.name || measures[0]?.name || '').trim();
        if (!xName || !yName) throw new Error('Invalid config: scatter/bubble requires xMeasure and yMeasure');

        const xIdx = getColumnIndex(columns, xName);
        const yIdx = getColumnIndex(columns, yName);
        const sizeName = String(normalizedConfig.sizeMeasure || measures[2]?.name || '').trim();
        const sizeIdx = sizeName ? getColumnIndex(columns, sizeName) : null;

        const scatterSeries = rowMatrix.map((row) => {
            const x = toNumeric(row[xIdx]);
            const y = toNumeric(row[yIdx]);
            if (isBubble) {
                const z = sizeIdx === null ? 0 : toNumeric(row[sizeIdx]);
                return [x, y, z];
            }
            return [x, y];
        });

        const adaptedRows = records.map((record, idx) => ({
            ...record,
            name: labels[idx] || record?.name || '',
        }));

        return {
            columns: [...columns],
            rows: adaptedRows,
            records,
            transformed: {
                series: scatterSeries,
                xMeasure: xName,
                yMeasure: yName,
                ...(isBubble ? { sizeMeasure: sizeName || null } : {}),
            },
            meta: response?.meta || {},
        };
    }

    if (isPie) {
        if (dimensionFields.length === 0) throw new Error('Invalid config: pie/donut requires one dimension field');

        const pieMeasureIdx = measureIndexes[0];
        const pieSeries = rowMatrix.map((row, idx) => ({
            name: labels[idx],
            value: toNumeric(row[pieMeasureIdx]),
        }));

        const adaptedRows = records.map((record, idx) => ({
            ...record,
            name: labels[idx],
        }));

        return {
            columns: [...columns],
            rows: adaptedRows,
            records,
            transformed: {
                series: pieSeries,
            },
            meta: response?.meta || {},
        };
    }

    const measureSeries = measures.map((m, mIdx) => {
        const idx = measureIndexes[mIdx];
        return {
            name: m.name,
            data: rowMatrix.map((row) => toNumeric(row[idx])),
        };
    });

    const adaptedRows = records.map((record, idx) => {
        const out = { ...record, name: labels[idx] };
        measureSeries.forEach((series) => {
            out[series.name] = series.data[idx];
        });
        return out;
    });

    if (isCombo) {
        const requestedTypes = Array.isArray(normalizedConfig.seriesTypes) ? normalizedConfig.seriesTypes : [];
        const comboSeries = measureSeries.map((series, idx) => ({
            type: requestedTypes[idx] || (idx === 0 ? 'bar' : 'line'),
            name: series.name,
            data: series.data,
        }));

        return {
            columns: [...columns],
            rows: adaptedRows,
            records,
            transformed: {
                xAxis: labels,
                series: comboSeries,
            },
            meta: response?.meta || {},
        };
    }

    if (measureSeries.length === 1) {
        return {
            columns: [...columns],
            rows: adaptedRows,
            records,
            transformed: {
                xAxis: labels,
                series: [measureSeries[0].data],
            },
            meta: response?.meta || {},
        };
    }

    return {
        columns: [...columns],
        rows: adaptedRows,
        records,
        transformed: {
            xAxis: labels,
            series: measureSeries,
        },
        meta: response?.meta || {},
    };
};
