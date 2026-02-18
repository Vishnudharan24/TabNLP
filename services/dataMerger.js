/**
 * Data Merger Service
 * Provides join and union operations between two datasets.
 */

/**
 * @typedef {'inner' | 'left' | 'right' | 'full' | 'append'} JoinType
 */

/**
 * Merge two datasets using the specified join strategy.
 *
 * @param {Object} opts
 * @param {Object[]} opts.leftData   - Row array from the left dataset
 * @param {Object[]} opts.rightData  - Row array from the right dataset
 * @param {import('../types').ColumnSchema[]} opts.leftColumns
 * @param {import('../types').ColumnSchema[]} opts.rightColumns
 * @param {string}   opts.leftKey    - Column name used as the join key in left dataset
 * @param {string}   opts.rightKey   - Column name used as the join key in right dataset
 * @param {JoinType} opts.joinType   - One of 'inner' | 'left' | 'right' | 'full' | 'append'
 * @returns {{ data: Object[], columns: import('../types').ColumnSchema[] }}
 */
export function mergeDatasets({
    leftData,
    rightData,
    leftColumns,
    rightColumns,
    leftKey,
    rightKey,
    joinType,
}) {
    if (joinType === 'append') {
        return appendDatasets(leftData, rightData, leftColumns, rightColumns);
    }

    // Build a lookup map for the right dataset (key → array of rows)
    const rightMap = new Map();
    rightData.forEach(row => {
        const key = normalizeKey(row[rightKey]);
        if (!rightMap.has(key)) rightMap.set(key, []);
        rightMap.get(key).push(row);
    });

    // Determine the merged column list, avoiding duplicates for the join key
    const rightColsFiltered = rightColumns.filter(c => c.name !== rightKey);
    const rightColNames = new Set(rightColsFiltered.map(c => c.name));
    const leftColNames = new Set(leftColumns.map(c => c.name));

    // Disambiguate overlapping column names (excluding the join key itself)
    const renamedRightCols = rightColsFiltered.map(c => {
        if (leftColNames.has(c.name)) {
            return { ...c, originalName: c.name, name: `${c.name}_right` };
        }
        return { ...c, originalName: c.name };
    });

    const mergedColumns = [...leftColumns, ...renamedRightCols];
    const mergedData = [];

    const usedRightKeys = new Set();

    // Walk left rows
    leftData.forEach(leftRow => {
        const key = normalizeKey(leftRow[leftKey]);
        const matches = rightMap.get(key);

        if (matches && matches.length > 0) {
            usedRightKeys.add(key);
            matches.forEach(rightRow => {
                mergedData.push(buildMergedRow(leftRow, rightRow, leftColumns, renamedRightCols));
            });
        } else if (joinType === 'left' || joinType === 'full') {
            mergedData.push(buildMergedRow(leftRow, null, leftColumns, renamedRightCols));
        }
        // inner join — skip unmatched lefts
    });

    // For right / full: add right rows with no match
    if (joinType === 'right' || joinType === 'full') {
        rightData.forEach(rightRow => {
            const key = normalizeKey(rightRow[rightKey]);
            if (!usedRightKeys.has(key)) {
                mergedData.push(buildMergedRow(null, rightRow, leftColumns, renamedRightCols));
            }
        });
    }

    return { data: mergedData, columns: mergedColumns };
}

/* ── Helpers ───────────────────────────────────────── */

function normalizeKey(val) {
    if (val === null || val === undefined) return '__NULL__';
    return String(val).trim().toLowerCase();
}

function buildMergedRow(leftRow, rightRow, leftCols, renamedRightCols) {
    const row = {};

    leftCols.forEach(c => {
        row[c.name] = leftRow ? leftRow[c.name] ?? null : null;
    });

    renamedRightCols.forEach(c => {
        const sourceKey = c.originalName || c.name;
        row[c.name] = rightRow ? rightRow[sourceKey] ?? null : null;
    });

    return row;
}

function appendDatasets(leftData, rightData, leftColumns, rightColumns) {
    // Union all columns
    const colMap = new Map();
    leftColumns.forEach(c => colMap.set(c.name, c));
    rightColumns.forEach(c => {
        if (!colMap.has(c.name)) colMap.set(c.name, c);
    });

    const mergedColumns = Array.from(colMap.values());
    const allColNames = mergedColumns.map(c => c.name);

    const normalize = (row) => {
        const out = {};
        allColNames.forEach(name => {
            out[name] = row[name] ?? null;
        });
        return out;
    };

    const mergedData = [
        ...leftData.map(normalize),
        ...rightData.map(normalize),
    ];

    return { data: mergedData, columns: mergedColumns };
}

/**
 * Auto-suggest possible join keys between two datasets by matching column names.
 * @param {import('../types').ColumnSchema[]} leftCols
 * @param {import('../types').ColumnSchema[]} rightCols
 * @returns {{ leftKey: string, rightKey: string, confidence: number }[]}
 */
export function suggestJoinKeys(leftCols, rightCols) {
    const suggestions = [];

    leftCols.forEach(lc => {
        rightCols.forEach(rc => {
            const ln = lc.name.toLowerCase().replace(/[_\s-]/g, '');
            const rn = rc.name.toLowerCase().replace(/[_\s-]/g, '');

            // Exact name match
            if (ln === rn) {
                suggestions.push({ leftKey: lc.name, rightKey: rc.name, confidence: 100 });
            }
            // One contains the other (e.g. "customer_id" vs "id")
            else if (ln.includes(rn) || rn.includes(ln)) {
                suggestions.push({ leftKey: lc.name, rightKey: rc.name, confidence: 60 });
            }
            // Same type + similar name (Levenshtein-light: shared prefix ≥ 3)
            else if (lc.type === rc.type && ln.slice(0, 3) === rn.slice(0, 3) && ln.length > 3) {
                suggestions.push({ leftKey: lc.name, rightKey: rc.name, confidence: 30 });
            }
        });
    });

    return suggestions.sort((a, b) => b.confidence - a.confidence);
}
