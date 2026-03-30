export const adaptQueryResponse = (response) => {
    const columns = Array.isArray(response?.columns) ? response.columns : [];
    const rowMatrix = Array.isArray(response?.rows) ? response.rows : [];

    const rows = rowMatrix.map((row) => {
        if (Array.isArray(row)) {
            return Object.fromEntries(columns.map((col, idx) => [col, row[idx]]));
        }
        if (row && typeof row === 'object') {
            return row;
        }
        return {};
    });

    return {
        columns,
        rows,
        meta: response?.meta || {},
    };
};
