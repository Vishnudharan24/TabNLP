const DEFAULT_BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || '/api';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 350;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const STORAGE_KEY_AUTH_TOKEN = 'power_bi_v3_auth_token';

const normalizeBaseUrl = (baseUrl) => (baseUrl || DEFAULT_BACKEND_BASE_URL).replace(/\/$/, '');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isAbortLikeError = (error) => error?.name === 'AbortError' || error?.name === 'TimeoutError';

const withCancellationAndTimeout = (signal, timeoutMs) => {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
        const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
        timeoutError.name = 'TimeoutError';
        controller.abort(timeoutError);
    }, timeoutMs);

    let detachExternalAbort = null;
    if (signal) {
        if (signal.aborted) {
            controller.abort(signal.reason || new Error('Request was cancelled'));
        } else {
            const onAbort = () => controller.abort(signal.reason || new Error('Request was cancelled'));
            signal.addEventListener('abort', onAbort, { once: true });
            detachExternalAbort = () => signal.removeEventListener('abort', onAbort);
        }
    }

    const cleanup = () => {
        clearTimeout(timeoutId);
        if (detachExternalAbort) detachExternalAbort();
    };

    return { signal: controller.signal, cleanup };
};

const isRetryableError = (error) => {
    if (!error) return false;
    if (isAbortLikeError(error)) return false;
    if (error?.retryable === true) return true;
    if (error?.name === 'TypeError') return true; // network failure in fetch
    return false;
};

const computeBackoffDelay = (attempt, baseDelayMs) => {
    const exponential = baseDelayMs * (2 ** attempt);
    const jitter = 0.85 + Math.random() * 0.3;
    return Math.round(exponential * jitter);
};

async function request(path, options = {}, baseUrl, requestConfig = {}) {
    const {
        retries = DEFAULT_RETRY_COUNT,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
        signal,
    } = requestConfig;

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const { signal: requestSignal, cleanup } = withCancellationAndTimeout(signal, timeoutMs);
        const persistedToken = localStorage.getItem(STORAGE_KEY_AUTH_TOKEN);
        const providedHeaders = options.headers || {};
        const isFormDataBody = typeof FormData !== 'undefined' && options?.body instanceof FormData;
        const hasAuthorizationHeader = Object.keys(providedHeaders).some((key) => key.toLowerCase() === 'authorization');
        const hasContentTypeHeader = Object.keys(providedHeaders).some((key) => key.toLowerCase() === 'content-type');

        try {
            const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
                headers: {
                    ...(!isFormDataBody && !hasContentTypeHeader ? { 'Content-Type': 'application/json' } : {}),
                    ...(persistedToken && !hasAuthorizationHeader ? { Authorization: `Bearer ${persistedToken}` } : {}),
                    ...(options.headers || {}),
                },
                ...options,
                signal: requestSignal,
            });

            if (!response.ok && RETRYABLE_STATUS.has(response.status)) {
                const retryableHttpError = new Error(`Retryable HTTP status ${response.status}`);
                retryableHttpError.retryable = true;
                retryableHttpError.status = response.status;
                throw retryableHttpError;
            }

            let payload = null;
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                payload = await response.json();
            } else {
                payload = await response.text();
            }

            if (!response.ok) {
                const detail = typeof payload === 'object'
                    ? (payload?.detail || payload?.error?.message || payload?.message)
                    : payload;
                const reason = typeof payload === 'object'
                    ? payload?.error?.details?.reason
                    : null;
                const message = detail || `Request failed with status ${response.status}`;
                throw new Error(reason ? `${message} (${reason})` : message);
            }

            return payload;
        } catch (error) {
            lastError = error;

            if (isAbortLikeError(error)) {
                throw new Error('Request was cancelled or timed out');
            }

            const canRetry = attempt < retries && isRetryableError(error);
            if (!canRetry) {
                throw error;
            }

            await sleep(computeBackoffDelay(attempt, retryBaseDelayMs));
        } finally {
            cleanup();
        }
    }

    throw lastError || new Error('Request failed');
}

async function requestBlob(path, options = {}, baseUrl, requestConfig = {}) {
    const {
        retries = DEFAULT_RETRY_COUNT,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
        signal,
    } = requestConfig;

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const { signal: requestSignal, cleanup } = withCancellationAndTimeout(signal, timeoutMs);
        const persistedToken = localStorage.getItem(STORAGE_KEY_AUTH_TOKEN);
        const providedHeaders = options.headers || {};
        const isFormDataBody = typeof FormData !== 'undefined' && options?.body instanceof FormData;
        const hasAuthorizationHeader = Object.keys(providedHeaders).some((key) => key.toLowerCase() === 'authorization');
        const hasContentTypeHeader = Object.keys(providedHeaders).some((key) => key.toLowerCase() === 'content-type');

        try {
            const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
                headers: {
                    ...(!isFormDataBody && !hasContentTypeHeader ? { 'Content-Type': 'application/json' } : {}),
                    ...(persistedToken && !hasAuthorizationHeader ? { Authorization: `Bearer ${persistedToken}` } : {}),
                    ...(options.headers || {}),
                },
                ...options,
                signal: requestSignal,
            });

            if (!response.ok && RETRYABLE_STATUS.has(response.status)) {
                const retryableHttpError = new Error(`Retryable HTTP status ${response.status}`);
                retryableHttpError.retryable = true;
                retryableHttpError.status = response.status;
                throw retryableHttpError;
            }

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || `Request failed with status ${response.status}`);
            }

            return await response.blob();
        } catch (error) {
            lastError = error;

            if (isAbortLikeError(error)) {
                throw new Error('Request was cancelled or timed out');
            }

            const canRetry = attempt < retries && isRetryableError(error);
            if (!canRetry) {
                throw error;
            }

            await sleep(computeBackoffDelay(attempt, retryBaseDelayMs));
        } finally {
            cleanup();
        }
    }

    throw lastError || new Error('Request failed');
}

export const backendApi = {
    createAbortController() {
        return new AbortController();
    },

    createAuthHeaders(token) {
        if (!token) return {};
        return { Authorization: `Bearer ${token}` };
    },

    signUp(payload, baseUrl, requestConfig) {
        return request('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }, baseUrl, requestConfig);
    },

    login(payload, baseUrl, requestConfig) {
        return request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }, baseUrl, requestConfig);
    },

    getCurrentUser(token, baseUrl, requestConfig) {
        return request('/auth/me', {
            method: 'GET',
            headers: {
                ...this.createAuthHeaders(token),
            },
        }, baseUrl, requestConfig);
    },

    ingest(params = {}, baseUrl, requestConfig) {
        const search = new URLSearchParams();
        if (params.source_id) search.set('source_id', params.source_id);
        if (params.url) search.set('url', params.url);
        const query = search.toString();
        return request(`/ingest${query ? `?${query}` : ''}`, { method: 'POST' }, baseUrl, requestConfig);
    },

    listSourceConfigs(baseUrl, requestConfig) {
        return request('/source-config', { method: 'GET' }, baseUrl, requestConfig);
    },

    getSourceConfig(sourceId, baseUrl, requestConfig) {
        return request(`/source-config/${encodeURIComponent(sourceId)}`, { method: 'GET' }, baseUrl, requestConfig);
    },

    saveSourceConfig(payload, baseUrl, requestConfig) {
        return request('/source-config', { method: 'POST', body: JSON.stringify(payload) }, baseUrl, requestConfig);
    },

    patchSourceConfig(sourceId, payload, baseUrl, requestConfig) {
        return request(`/source-config/${encodeURIComponent(sourceId)}`, { method: 'PATCH', body: JSON.stringify(payload) }, baseUrl, requestConfig);
    },

    ingestBySourceId(sourceId, baseUrl, requestConfig) {
        return request(`/ingest/source/${encodeURIComponent(sourceId)}`, { method: 'POST' }, baseUrl, requestConfig);
    },

    uploadDatasetFile(file, baseUrl, requestConfig) {
        const form = new FormData();
        form.append('file', file);
        return request('/ingest/upload', { method: 'POST', body: form }, baseUrl, requestConfig);
    },

    listLatestDatasets(limit = 100, baseUrl, requestConfig) {
        return request(`/datasets/latest?limit=${encodeURIComponent(limit)}`, { method: 'GET' }, baseUrl, requestConfig);
    },

    listDatasets(limit = 1000, baseUrl, requestConfig) {
        return request(`/datasets?limit=${encodeURIComponent(limit)}`, { method: 'GET' }, baseUrl, requestConfig);
    },

    getLatestDatasetBySourceId(sourceId, baseUrl, requestConfig) {
        return request(`/datasets/latest/${encodeURIComponent(sourceId)}`, { method: 'GET' }, baseUrl, requestConfig);
    },

    getDatasetByDocumentId(documentId, baseUrl, requestConfig) {
        return request(`/datasets/${encodeURIComponent(documentId)}`, { method: 'GET' }, baseUrl, requestConfig);
    },

    mergeDatasets(payload, baseUrl, requestConfig) {
        return request('/datasets/merge', {
            method: 'POST',
            body: JSON.stringify(payload),
        }, baseUrl, requestConfig);
    },

    getHrAnalytics(moduleName, payload, baseUrl, requestConfig) {
        return request(`/hr/analytics/${encodeURIComponent(moduleName)}`, {
            method: 'POST',
            body: JSON.stringify(payload),
        }, baseUrl, requestConfig);
    },

    getHrAnalyticsSummary(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('summary', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsDemographics(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('demographics', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsHiring(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('hiring', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsAttrition(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('attrition', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsExperience(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('experience', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsOrg(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('org', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsPayroll(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('payroll', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsEducation(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('education', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsLocation(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('location', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsDepartment(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('department', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsLifecycle(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('lifecycle', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsCompliance(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('compliance', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsContact(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('contact', payload, baseUrl, requestConfig);
    },

    getHrAnalyticsDataQuality(payload, baseUrl, requestConfig) {
        return this.getHrAnalytics('data-quality', payload, baseUrl, requestConfig);
    },

    getChartRecommendations(payload, baseUrl, requestConfig) {
        return request('/chart/recommend', {
            method: 'POST',
            body: JSON.stringify(payload),
        }, baseUrl, requestConfig);
    },

    getChartConfig(payload, baseUrl, requestConfig) {
        return request('/chart/config', {
            method: 'POST',
            body: JSON.stringify(payload),
        }, baseUrl, requestConfig);
    },

    runQuery(payload, baseUrl, requestConfig) {
        return request('/query', {
            method: 'POST',
            body: JSON.stringify(payload),
        }, baseUrl, requestConfig);
    },

    createReport(payload, baseUrl, requestConfig) {
        return request('/reports', {
            method: 'POST',
            body: JSON.stringify(payload),
        }, baseUrl, requestConfig);
    },

    updateReport(reportId, payload, baseUrl, requestConfig) {
        return request(`/reports/${encodeURIComponent(reportId)}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        }, baseUrl, requestConfig);
    },

    getReport(reportId, baseUrl, requestConfig) {
        return request(`/reports/${encodeURIComponent(reportId)}`, {
            method: 'GET',
        }, baseUrl, requestConfig);
    },

    createReportShare(reportId, payload, baseUrl, requestConfig) {
        return request(`/reports/${encodeURIComponent(reportId)}/shares`, {
            method: 'POST',
            body: JSON.stringify(payload || {}),
        }, baseUrl, requestConfig);
    },

    getSharedReport(reportId, shareToken, baseUrl, requestConfig) {
        const query = new URLSearchParams({ shareToken: String(shareToken || '') }).toString();
        return request(`/shared-reports/${encodeURIComponent(reportId)}?${query}`, {
            method: 'GET',
        }, baseUrl, requestConfig);
    },

    exportQuery(payload, baseUrl, requestConfig) {
        return requestBlob('/query/export', {
            method: 'POST',
            body: JSON.stringify(payload),
        }, baseUrl, requestConfig);
    },

    getSemanticMeasures(datasetId, baseUrl, requestConfig) {
        const query = new URLSearchParams({ datasetId: String(datasetId || '') }).toString();
        return request(`/semantic/measures?${query}`, {
            method: 'GET',
        }, baseUrl, requestConfig);
    },

    getTestExcel(baseUrl, requestConfig) {
        return request('/test/file', { method: 'GET' }, baseUrl, requestConfig);
    },

    createTestExcelSourceConfig(sourceId = 'local_excel_test', baseUrl, requestConfig) {
        const query = new URLSearchParams({ source_id: sourceId }).toString();
        return request(`/test/source-config/excel?${query}`, { method: 'POST' }, baseUrl, requestConfig);
    },

    createTestSftpSourceConfig(params = {}, baseUrl, requestConfig) {
        const search = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && `${value}`.trim() !== '') {
                search.set(key, `${value}`);
            }
        });
        const query = search.toString();
        return request(`/test/source-config/sftp${query ? `?${query}` : ''}`, { method: 'POST' }, baseUrl, requestConfig);
    },

    ingestTestExcel(sourceId = 'local_excel_test', baseUrl, requestConfig) {
        const query = new URLSearchParams({ source_id: sourceId }).toString();
        return request(`/test/ingest/excel?${query}`, { method: 'POST' }, baseUrl, requestConfig);
    },

    ingestTestSftp(sourceId = 'local_sftp_test', baseUrl, requestConfig) {
        const query = new URLSearchParams({ source_id: sourceId }).toString();
        return request(`/test/ingest/sftp?${query}`, { method: 'POST' }, baseUrl, requestConfig);
    },
};

export { DEFAULT_BACKEND_BASE_URL };
