import { buildOrgTree } from './chartConfigSystem';

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

const cloneHierarchyNode = (node = {}) => ({
    ...node,
    value: toNumeric(node.value),
    children: Array.isArray(node.children)
        ? node.children.map(cloneHierarchyNode)
        : undefined,
});

const nodeTotal = (node = {}) => {
    const own = toNumeric(node.value);
    const childrenTotal = Array.isArray(node.children)
        ? node.children.reduce((sum, child) => sum + nodeTotal(child), 0)
        : 0;
    return Math.max(own, childrenTotal);
};

const collectLeafNames = (node = {}, out = []) => {
    if (!Array.isArray(node.children) || node.children.length === 0) {
        if (node?.name) out.push(String(node.name));
        return out;
    }
    node.children.forEach((child) => collectLeafNames(child, out));
    return out;
};

const groupChildren = (children = [], parentValue = 0, topN = 5, threshold = 0.02) => {
    if (!Array.isArray(children) || children.length === 0) return [];
    const sorted = [...children].sort((a, b) => toNumeric(b.value) - toNumeric(a.value));
    const keep = [];
    const others = [];

    sorted.forEach((child, idx) => {
        const ratio = parentValue > 0 ? toNumeric(child.value) / parentValue : 1;
        if (idx < topN && ratio >= threshold) {
            keep.push(child);
        } else {
            others.push(child);
        }
    });

    if (others.length > 0) {
        const othersValue = others.reduce((sum, item) => sum + toNumeric(item.value), 0);
        const members = others.flatMap((item) => collectLeafNames(item, []));
        keep.push({
            name: 'Others',
            value: othersValue,
            children: [],
            __members: Array.from(new Set(members)),
        });
    }

    return keep;
};

const enrichHierarchy = (node = {}, depth = 0, total = 0, options = {}) => {
    const { topN = 5, threshold = 0.02, fields = [] } = options;
    const value = nodeTotal(node);
    const percent = total > 0 ? (value / total) * 100 : 0;
    const children = Array.isArray(node.children) ? node.children : [];
    const grouped = children.length > 0 ? groupChildren(children, value, topN, threshold) : [];
    return {
        ...node,
        value,
        percent,
        __field: fields[depth] || null,
        __depth: depth,
        children: grouped.length > 0
            ? grouped.map((child) => enrichHierarchy(child, depth + 1, total, options))
            : undefined,
    };
};

const toRowObject = (columns, row) => {
    if (Array.isArray(row)) {
        return Object.fromEntries(columns.map((col, idx) => [col, row[idx]]));
    }
    if (row && typeof row === 'object') return { ...row };
    return Object.fromEntries(columns.map((col) => [col, undefined]));
};

const jitter = (value, magnitude = 0.02) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return numeric + (Math.random() - 0.5) * magnitude * numeric;
};

const groupClusters = (points = [], thresholdX = 0, thresholdY = 0) => {
    const buckets = new Map();
    const safeThresholdX = Number.isFinite(thresholdX) && thresholdX > 0 ? thresholdX : 0;
    const safeThresholdY = Number.isFinite(thresholdY) && thresholdY > 0 ? thresholdY : 0;

    points.forEach((point) => {
        const x = Number(point[0]) || 0;
        const y = Number(point[1]) || 0;
        const keyX = safeThresholdX > 0 ? Math.round(x / safeThresholdX) : Math.round(x * 1000);
        const keyY = safeThresholdY > 0 ? Math.round(y / safeThresholdY) : Math.round(y * 1000);
        const key = `${keyX}:${keyY}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(point);
    });

    return Array.from(buckets.values());
};

const spreadCluster = (cluster = [], radiusX = 0, radiusY = 0) => {
    if (cluster.length <= 1) return cluster;
    const angleStep = (2 * Math.PI) / cluster.length;
    const baseX = Number(cluster[0][0]) || 0;
    const baseY = Number(cluster[0][1]) || 0;

    return cluster.map((point, i) => {
        const angle = i * angleStep;
        const dx = Math.cos(angle) * radiusX;
        const dy = Math.sin(angle) * radiusY;
        return [baseX + dx, baseY + dy, point[2], point[3]];
    });
};

const normalizeConfig = (config = {}) => {
    if (!config || typeof config !== 'object') throw new Error('Invalid config: expected object');

    const chartType = String(config.chartType || '').trim();
    if (!chartType) throw new Error('Invalid config: chartType is required');

    const dimensionFields = Array.isArray(config.dimensionFields)
        ? config.dimensionFields.filter(Boolean)
        : (config.dimensionField ? [config.dimensionField] : (config.dimension ? [config.dimension] : []));

    const measures = normalizeMeasureList(config.measures || []);

    const normalizedHierarchy = Array.isArray(config.hierarchyFields)
        ? config.hierarchyFields.filter(Boolean)
        : [];

    return {
        ...config,
        chartType,
        dimensionFields: (chartType === 'ORG_CHART' || chartType === 'ORG_TREE_STRUCTURED') && normalizedHierarchy.length > 0
            ? normalizedHierarchy
            : dimensionFields,
        hierarchyFields: normalizedHierarchy,
        measures,
    };
};

const buildOrgHierarchy = (rows = [], hierarchyFields = [], options = {}) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const fields = Array.isArray(hierarchyFields) ? hierarchyFields.filter(Boolean) : [];
    if (fields.length === 0) return [];

    const labelField = options?.labelField ? String(options.labelField).trim() : '';
    const colorField = options?.colorField ? String(options.colorField).trim() : '';
    const nodeMeta = new Map();

    const relations = new Map();
    const rootCandidates = new Set();

    safeRows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        for (let i = 0; i < fields.length; i += 1) {
            const nodeRaw = row?.[fields[i]];
            const node = nodeRaw === null || nodeRaw === undefined || String(nodeRaw).trim() === '' ? '' : String(nodeRaw).trim();
            if (!node) continue;

            const parentRaw = i === 0 ? null : row?.[fields[i - 1]];
            const parentValue = parentRaw === null || parentRaw === undefined || String(parentRaw).trim() === '' ? null : String(parentRaw).trim();
            const parent = parentValue === node ? null : parentValue;
            const key = `${node}__${parent || ''}`;

            if ((labelField || colorField) && !nodeMeta.has(node)) {
                const labelRaw = labelField ? row?.[labelField] : null;
                const colorRaw = colorField ? row?.[colorField] : null;
                const label = labelRaw === null || labelRaw === undefined || String(labelRaw).trim() === ''
                    ? null
                    : String(labelRaw).trim();
                const color = colorRaw === null || colorRaw === undefined || String(colorRaw).trim() === ''
                    ? null
                    : String(colorRaw).trim();
                if (label || color) nodeMeta.set(node, { label, color });
            }

            if (!relations.has(key)) {
                const meta = nodeMeta.get(node);
                relations.set(key, {
                    node,
                    parent: parent || null,
                    ...(meta?.label ? { label: meta.label } : {}),
                    ...(meta?.color ? { color: meta.color } : {}),
                });
            }

            if (!parent) {
                rootCandidates.add(node);
            }
        }
    });

    if (rootCandidates.size > 1) {
        const virtualRoot = 'All Entities';
        const adjusted = new Map();
        relations.forEach((rel) => {
            if (!rel.parent && rootCandidates.has(rel.node)) {
                const key = `${rel.node}__${virtualRoot}`;
                adjusted.set(key, { ...rel, parent: virtualRoot });
            } else {
                const key = `${rel.node}__${rel.parent || ''}`;
                adjusted.set(key, { ...rel, parent: rel.parent || null });
            }
        });
        adjusted.set(`${virtualRoot}__`, { node: virtualRoot, parent: null });
        return Array.from(adjusted.values());
    }

    return Array.from(relations.values());
};

export const adaptQueryResponse = (response, config = {}) => {
    const columns = ensureArray(response?.columns, 'Invalid response: columns must be an array');
    const rows = ensureArray(response?.rows, 'Invalid response: rows must be an array');

    if (rows.length === 0) {
        throw new Error('Empty result: backend query returned no rows');
    }

    const normalizedConfig = normalizeConfig(config);
    const { chartType, dimensionFields, measures } = normalizedConfig;
    const rowMatrix = rows.map((row) => Array.isArray(row) ? [...row] : columns.map((c) => row?.[c]));
    const records = rowMatrix.map((row) => toRowObject(columns, row));

    const chartTypeUpper = chartType.toUpperCase();
    const isTable = chartTypeUpper === 'TABLE';
    const isPie = ['PIE', 'DONUT', 'ROSE', 'PIE_SEMI', 'DONUT_SEMI'].includes(chartTypeUpper);
    const isScatter = chartTypeUpper === 'SCATTER';
    const isBubble = chartTypeUpper === 'BUBBLE';
    const isCombo = chartTypeUpper.startsWith('COMBO');
    const isHierarchyChart = chartTypeUpper === 'TREEMAP' || chartTypeUpper === 'SUNBURST';
    const isOrgChart = chartTypeUpper === 'ORG_CHART' || chartTypeUpper === 'ORG_TREE_STRUCTURED';

    if (isTable) {
        return {
            columns: [...columns],
            rows: records,
            records,
            transformed: {
                table: true,
            },
            meta: response?.meta || {},
        };
    }

    if (isHierarchyChart) {
        const hierarchyIdx = getColumnIndex(columns, '__hierarchy');
        const hierarchy = rowMatrix?.[0]?.[hierarchyIdx];

        const hierarchyOptions = {
            topN: Number.isFinite(normalizedConfig?.hierarchyTopN) ? normalizedConfig.hierarchyTopN : 5,
            threshold: Number.isFinite(normalizedConfig?.hierarchyThreshold) ? normalizedConfig.hierarchyThreshold : 0.02,
            fields: Array.isArray(normalizedConfig?.hierarchyFields) ? normalizedConfig.hierarchyFields : [],
        };

        const baseNodes = Array.isArray(hierarchy) ? hierarchy.map(cloneHierarchyNode) : [];
        const total = baseNodes.reduce((sum, node) => sum + nodeTotal(node), 0);
        const processedHierarchy = baseNodes.map((node) => enrichHierarchy(node, 0, total, hierarchyOptions));

        const adaptedRows = [
            {
                name: dimensionFields?.[0] || 'Hierarchy',
                __hierarchy: processedHierarchy,
            },
        ];

        return {
            columns: [...columns],
            rows: adaptedRows,
            records,
            transformed: {
                hierarchy: adaptedRows[0].__hierarchy,
                total,
            },
            meta: response?.meta || {},
        };
    }

    if (isOrgChart) {
        const hasOrgTreeColumn = columns.some((c) => String(c || '').toLowerCase() === '__orgtree');
        if (hasOrgTreeColumn) {
            const treeIdx = getColumnIndex(columns, '__orgTree');
            const metaIdx = columns.some((c) => String(c || '').toLowerCase() === '__orgmeta')
                ? getColumnIndex(columns, '__orgMeta')
                : -1;

            const orgTree = rowMatrix?.[0]?.[treeIdx];
            const orgMeta = metaIdx >= 0 ? rowMatrix?.[0]?.[metaIdx] : null;

            const adaptedRows = [
                {
                    name: 'Organization',
                    __orgTree: orgTree || null,
                    __orgMeta: orgMeta || null,
                },
            ];

            return {
                columns: [...columns],
                rows: adaptedRows,
                records,
                transformed: {
                    orgTree,
                    orgMeta,
                },
                meta: response?.meta || {},
            };
        }

        const hierarchyFields = normalizedConfig.hierarchyFields || normalizedConfig.dimensionFields || [];
        const relations = buildOrgHierarchy(records, hierarchyFields, {
            labelField: normalizedConfig?.labelField,
            colorField: normalizedConfig?.colorField,
        });
        const treeInput = relations.map((rel) => ({
            node: rel.node,
            parent: rel.parent,
            ...(rel.label ? { __label: rel.label } : {}),
            ...(rel.color ? { __color: rel.color } : {}),
        }));
        const { treeData, meta } = buildOrgTree(
            treeInput,
            'node',
            'parent',
            normalizedConfig?.labelField ? '__label' : undefined,
            normalizedConfig?.colorField ? '__color' : undefined
        );

        const adaptedRows = [
            {
                name: 'Organization',
                __orgTree: treeData,
                __orgMeta: meta || null,
            },
        ];

        return {
            columns: [...columns],
            rows: adaptedRows,
            records,
            transformed: {
                orgTree: treeData,
                orgMeta: meta || null,
            },
            meta: response?.meta || {},
        };
    }

    const dimIndexes = dimensionFields.map((d) => getColumnIndex(columns, d));
    const measureIndexes = measures.map((m) => getColumnIndex(columns, m.name));

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

        const bubbleOptions = normalizedConfig.bubbleOptions || {};
        const enableJitter = bubbleOptions.enableJitter !== false;
        const enableClusterSpread = bubbleOptions.enableClusterSpread !== false;
        const jitterStrength = Number.isFinite(bubbleOptions.jitterStrength) ? bubbleOptions.jitterStrength : 0.02;
        const clusterThreshold = Number.isFinite(bubbleOptions.clusterThreshold) ? bubbleOptions.clusterThreshold : 0.01;

        const rawPoints = rowMatrix.map((row, idx) => {
            const x = toNumeric(row[xIdx]);
            const y = toNumeric(row[yIdx]);
            const z = sizeIdx === null ? 0 : toNumeric(row[sizeIdx]);
            const name = labels[idx] || '';
            return [x, y, z, name];
        });

        const xValues = rawPoints.map((p) => p[0]);
        const yValues = rawPoints.map((p) => p[1]);
        const xMin = Math.min(...xValues);
        const xMax = Math.max(...xValues);
        const yMin = Math.min(...yValues);
        const yMax = Math.max(...yValues);
        const xRange = Math.max(1, xMax - xMin);
        const yRange = Math.max(1, yMax - yMin);
        const thresholdX = xRange * clusterThreshold;
        const thresholdY = yRange * clusterThreshold;
        const spreadRadiusX = xRange * 0.015;
        const spreadRadiusY = yRange * 0.015;

        const clustered = enableClusterSpread
            ? groupClusters(rawPoints, thresholdX, thresholdY)
            : rawPoints.map((p) => [p]);

        const processed = clustered.flatMap((cluster) => {
            if (cluster.length === 1) return cluster;
            return spreadCluster(cluster, spreadRadiusX, spreadRadiusY);
        }).map((point) => {
            const [x, y, z, name] = point;
            const jitteredX = enableJitter ? jitter(x, jitterStrength) : x;
            const jitteredY = enableJitter ? jitter(y, jitterStrength) : y;
            return {
                name: name || '',
                value: [jitteredX, jitteredY, z],
                raw: [x, y, z],
            };
        });

        const scatterSeries = isBubble
            ? processed
            : rawPoints.map((p) => [p[0], p[1]]);

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
                ...(isBubble ? { bubbleOptions: { enableJitter, enableClusterSpread, jitterStrength, clusterThreshold } } : {}),
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

