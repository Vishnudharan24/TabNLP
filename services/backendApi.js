const DEFAULT_BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '/api';

const normalizeBaseUrl = (baseUrl) => (baseUrl || DEFAULT_BACKEND_BASE_URL).replace(/\/$/, '');

async function request(path, options = {}, baseUrl) {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });

    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        payload = await response.json();
    } else {
        payload = await response.text();
    }

    if (!response.ok) {
        const detail = typeof payload === 'object' ? payload?.detail : payload;
        throw new Error(detail || `Request failed with status ${response.status}`);
    }

    return payload;
}

export const backendApi = {
    ingest(params = {}, baseUrl) {
        const search = new URLSearchParams();
        if (params.source_id) search.set('source_id', params.source_id);
        if (params.url) search.set('url', params.url);
        const query = search.toString();
        return request(`/ingest${query ? `?${query}` : ''}`, { method: 'POST' }, baseUrl);
    },

    listSourceConfigs(baseUrl) {
        return request('/source-config', { method: 'GET' }, baseUrl);
    },

    getSourceConfig(sourceId, baseUrl) {
        return request(`/source-config/${encodeURIComponent(sourceId)}`, { method: 'GET' }, baseUrl);
    },

    saveSourceConfig(payload, baseUrl) {
        return request('/source-config', { method: 'POST', body: JSON.stringify(payload) }, baseUrl);
    },

    patchSourceConfig(sourceId, payload, baseUrl) {
        return request(`/source-config/${encodeURIComponent(sourceId)}`, { method: 'PATCH', body: JSON.stringify(payload) }, baseUrl);
    },

    ingestBySourceId(sourceId, baseUrl) {
        return request(`/ingest/source/${encodeURIComponent(sourceId)}`, { method: 'POST' }, baseUrl);
    },

    listLatestDatasets(limit = 100, baseUrl) {
        return request(`/datasets/latest?limit=${encodeURIComponent(limit)}`, { method: 'GET' }, baseUrl);
    },

    getLatestDatasetBySourceId(sourceId, baseUrl) {
        return request(`/datasets/latest/${encodeURIComponent(sourceId)}`, { method: 'GET' }, baseUrl);
    },

    getDatasetByDocumentId(documentId, baseUrl) {
        return request(`/datasets/${encodeURIComponent(documentId)}`, { method: 'GET' }, baseUrl);
    },

    getTestExcel(baseUrl) {
        return request('/test/excel', { method: 'GET' }, baseUrl);
    },

    createTestExcelSourceConfig(sourceId = 'local_excel_test', baseUrl) {
        const query = new URLSearchParams({ source_id: sourceId }).toString();
        return request(`/test/source-config/excel?${query}`, { method: 'POST' }, baseUrl);
    },

    createTestSftpSourceConfig(params = {}, baseUrl) {
        const search = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && `${value}`.trim() !== '') {
                search.set(key, `${value}`);
            }
        });
        const query = search.toString();
        return request(`/test/source-config/sftp${query ? `?${query}` : ''}`, { method: 'POST' }, baseUrl);
    },

    ingestTestExcel(sourceId = 'local_excel_test', baseUrl) {
        const query = new URLSearchParams({ source_id: sourceId }).toString();
        return request(`/test/ingest/excel?${query}`, { method: 'POST' }, baseUrl);
    },

    ingestTestSftp(sourceId = 'local_sftp_test', baseUrl) {
        const query = new URLSearchParams({ source_id: sourceId }).toString();
        return request(`/test/ingest/sftp?${query}`, { method: 'POST' }, baseUrl);
    },
};

export { DEFAULT_BACKEND_BASE_URL };
