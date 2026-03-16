import React, { useEffect, useMemo, useState } from 'react';
import {
    RefreshCcw,
    Save,
    Play,
    Server,
    Link,
    HardDrive,
    CheckCircle2,
    AlertTriangle,
    Database,
    Pencil,
    Eye,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { backendApi, DEFAULT_BACKEND_BASE_URL } from '../services/backendApi';

const defaultApiForm = {
    source_id: '',
    name: '',
    source_type: 'api',
    api_endpoint: '',
    url: '',
};

const defaultSftpForm = {
    source_id: '',
    name: '',
    source_type: 'sftp',
    host: '',
    port: 22,
    username: '',
    private_key_path: '',
    remote_path: '',
    passphrase: '',
    known_hosts_path: '',
};

const SourceConfigIngestionPage = ({
    backendBaseUrl = DEFAULT_BACKEND_BASE_URL,
    onIngestionSuccess,
}) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [activeType, setActiveType] = useState('api');
    const [apiForm, setApiForm] = useState(defaultApiForm);
    const [sftpForm, setSftpForm] = useState(defaultSftpForm);

    const [configs, setConfigs] = useState([]);
    const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [ingestingSourceId, setIngestingSourceId] = useState('');

    const [status, setStatus] = useState({
        type: 'idle',
        title: '',
        message: '',
    });

    const normalizedBaseUrl = useMemo(() => backendBaseUrl.replace(/\/$/, ''), [backendBaseUrl]);

    const setSuccess = (title, message) => setStatus({ type: 'success', title, message });
    const setError = (title, message) => setStatus({ type: 'error', title, message });
    const clearStatus = () => setStatus({ type: 'idle', title: '', message: '' });

    const fetchSourceConfigs = async () => {
        setIsLoadingConfigs(true);
        try {
            const data = await backendApi.listSourceConfigs(normalizedBaseUrl);
            setConfigs(Array.isArray(data?.items) ? data.items : []);
        } catch (error) {
            setError('Unable to load source configs', error.message || 'Unknown error');
        } finally {
            setIsLoadingConfigs(false);
        }
    };

    useEffect(() => {
        fetchSourceConfigs();
    }, []);

    const buildPayload = () => {
        if (activeType === 'api') {
            return {
                source_id: apiForm.source_id.trim(),
                name: apiForm.name.trim(),
                source_type: 'api',
                api_endpoint: apiForm.api_endpoint.trim() || undefined,
                url: apiForm.url.trim() || undefined,
            };
        }

        return {
            source_id: sftpForm.source_id.trim(),
            name: sftpForm.name.trim(),
            source_type: 'sftp',
            sftp: {
                host: sftpForm.host.trim(),
                port: Number(sftpForm.port || 22),
                username: sftpForm.username.trim(),
                private_key_path: sftpForm.private_key_path.trim(),
                remote_path: sftpForm.remote_path.trim(),
                passphrase: sftpForm.passphrase.trim() || undefined,
                known_hosts_path: sftpForm.known_hosts_path.trim() || undefined,
            },
        };
    };

    const validatePayload = (payload) => {
        if (!payload.source_id) return 'source_id is required';
        if (!payload.name) return 'name is required';

        if (payload.source_type === 'api') {
            if (!payload.api_endpoint && !payload.url) {
                return 'Provide either api_endpoint or url for API source';
            }
        }

        if (payload.source_type === 'sftp') {
            const required = ['host', 'username', 'private_key_path', 'remote_path'];
            const missing = required.filter((field) => !payload.sftp?.[field]);
            if (missing.length) {
                return `Missing SFTP fields: ${missing.join(', ')}`;
            }
        }

        return null;
    };

    const handleSaveConfig = async () => {
        clearStatus();
        const payload = buildPayload();
        const validationError = validatePayload(payload);
        if (validationError) {
            setError('Validation error', validationError);
            return;
        }

        setIsSaving(true);
        try {
            await backendApi.saveSourceConfig(payload, normalizedBaseUrl);

            setSuccess('Source config saved', `Saved ${payload.source_type.toUpperCase()} config: ${payload.source_id}`);
            await fetchSourceConfigs();
        } catch (error) {
            setError('Save failed', error.message || 'Unknown error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleIngest = async (sourceIdFromRow) => {
        clearStatus();
        const sourceId = sourceIdFromRow || (activeType === 'api' ? apiForm.source_id.trim() : sftpForm.source_id.trim());
        if (!sourceId) {
            setError('Validation error', 'source_id is required to ingest');
            return;
        }

        setIngestingSourceId(sourceId);
        try {
            const data = await backendApi.ingestBySourceId(sourceId, normalizedBaseUrl);

            setSuccess(
                'Ingestion completed',
                `source_id=${sourceId} | version=${data?.version ?? 'N/A'} | document_id=${data?.document_id ?? 'N/A'}`,
            );

            if (onIngestionSuccess) {
                onIngestionSuccess(data);
            }
        } catch (error) {
            setError('Ingestion failed', error.message || 'Unknown error');
        } finally {
            setIngestingSourceId('');
        }
    };

    const applyConfigToForm = (config) => {
        const type = config?.source_type === 'sftp' ? 'sftp' : 'api';
        setActiveType(type);

        if (type === 'api') {
            setApiForm({
                source_id: config?.source_id || '',
                name: config?.name || '',
                source_type: 'api',
                api_endpoint: config?.api_endpoint || '',
                url: config?.url || '',
            });
            return;
        }

        const sftp = config?.sftp || {};
        setSftpForm({
            source_id: config?.source_id || '',
            name: config?.name || '',
            source_type: 'sftp',
            host: sftp?.host || '',
            port: sftp?.port || 22,
            username: sftp?.username || '',
            private_key_path: sftp?.private_key_path || '',
            remote_path: sftp?.remote_path || '',
            passphrase: sftp?.passphrase || '',
            known_hosts_path: sftp?.known_hosts_path || '',
        });
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-10 pt-10 pb-6 shrink-0">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="space-y-2">
                        <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <Server size={12} />
                            Source Configuration
                        </div>
                        <h2 className={`text-4xl font-black tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            Connect External Sources
                        </h2>
                        <p className={`max-w-2xl ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Create or update source configuration for API and SFTP, then trigger ingestion using source_id.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchSourceConfigs}
                            disabled={isLoadingConfigs}
                            className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center gap-2 ${isDark ? 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                        >
                            <RefreshCcw size={15} className={isLoadingConfigs ? 'animate-spin' : ''} />
                            Refresh Configs
                        </button>
                        <button
                            onClick={handleSaveConfig}
                            disabled={isSaving}
                            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${isDark ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-900 text-white hover:bg-black'} disabled:opacity-60`}
                        >
                            <Save size={15} />
                            {isSaving ? 'Saving...' : 'Save Config'}
                        </button>
                        <button
                            onClick={() => handleIngest()}
                            disabled={Boolean(ingestingSourceId)}
                            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${isDark ? 'bg-emerald-300 text-gray-900 hover:bg-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'} disabled:opacity-60`}
                        >
                            <Play size={15} />
                            {ingestingSourceId ? 'Ingesting...' : 'Ingest Current'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-10 pb-6 shrink-0">
                <div className={`rounded-2xl border p-2 inline-flex ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <button
                        onClick={() => setActiveType('api')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${activeType === 'api' ? (isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900') : (isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')}`}
                    >
                        <Link size={14} /> API Source
                    </button>
                    <button
                        onClick={() => setActiveType('sftp')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${activeType === 'sftp' ? (isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900') : (isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')}`}
                    >
                        <HardDrive size={14} /> SFTP Source
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-10 pb-10 grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2">
                    <div className={`rounded-2xl border p-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        {activeType === 'api' ? (
                            <div className="space-y-4">
                                <h3 className={`text-lg font-extrabold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>API Source Config</h3>
                                <FormInput label="source_id" value={apiForm.source_id} onChange={(v) => setApiForm((p) => ({ ...p, source_id: v }))} isDark={isDark} placeholder="sales_api_source" />
                                <FormInput label="name" value={apiForm.name} onChange={(v) => setApiForm((p) => ({ ...p, name: v }))} isDark={isDark} placeholder="Sales API" />
                                <FormInput label="api_endpoint" value={apiForm.api_endpoint} onChange={(v) => setApiForm((p) => ({ ...p, api_endpoint: v }))} isDark={isDark} placeholder="https://example.com/export/data.xlsx" />
                                <FormInput label="url (optional alternative)" value={apiForm.url} onChange={(v) => setApiForm((p) => ({ ...p, url: v }))} isDark={isDark} placeholder="https://example.com/export/data.csv" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <h3 className={`text-lg font-extrabold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>SFTP Source Config</h3>
                                <FormInput label="source_id" value={sftpForm.source_id} onChange={(v) => setSftpForm((p) => ({ ...p, source_id: v }))} isDark={isDark} placeholder="vendor_sftp_source" />
                                <FormInput label="name" value={sftpForm.name} onChange={(v) => setSftpForm((p) => ({ ...p, name: v }))} isDark={isDark} placeholder="Vendor SFTP" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormInput label="host" value={sftpForm.host} onChange={(v) => setSftpForm((p) => ({ ...p, host: v }))} isDark={isDark} placeholder="sftp.example.com" />
                                    <FormInput label="port" type="number" value={sftpForm.port} onChange={(v) => setSftpForm((p) => ({ ...p, port: v }))} isDark={isDark} placeholder="22" />
                                </div>
                                <FormInput label="username" value={sftpForm.username} onChange={(v) => setSftpForm((p) => ({ ...p, username: v }))} isDark={isDark} placeholder="sftp_user" />
                                <FormInput label="private_key_path" value={sftpForm.private_key_path} onChange={(v) => setSftpForm((p) => ({ ...p, private_key_path: v }))} isDark={isDark} placeholder="/home/user/.ssh/id_rsa" />
                                <FormInput label="remote_path" value={sftpForm.remote_path} onChange={(v) => setSftpForm((p) => ({ ...p, remote_path: v }))} isDark={isDark} placeholder="/exports/monthly_data.xlsx" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormInput label="passphrase (optional)" value={sftpForm.passphrase} onChange={(v) => setSftpForm((p) => ({ ...p, passphrase: v }))} isDark={isDark} placeholder="********" />
                                    <FormInput label="known_hosts_path (optional)" value={sftpForm.known_hosts_path} onChange={(v) => setSftpForm((p) => ({ ...p, known_hosts_path: v }))} isDark={isDark} placeholder="/home/user/.ssh/known_hosts" />
                                </div>
                            </div>
                        )}
                    </div>

                    {status.type !== 'idle' && (
                        <div className={`mt-6 rounded-2xl border p-4 flex items-start gap-3 ${status.type === 'success' ? (isDark ? 'bg-emerald-950/30 border-emerald-900 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700') : (isDark ? 'bg-rose-950/30 border-rose-900 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700')}`}>
                            {status.type === 'success' ? <CheckCircle2 size={18} className="mt-0.5" /> : <AlertTriangle size={18} className="mt-0.5" />}
                            <div>
                                <p className="font-bold text-sm">{status.title}</p>
                                <p className="text-xs mt-1 opacity-90 break-all">{status.message}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className={`rounded-2xl border p-5 h-fit ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-sm font-extrabold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Saved Source Configs
                        </h3>
                        <span className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{configs.length}</span>
                    </div>

                    <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                        {configs.length === 0 ? (
                            <div className={`rounded-xl border border-dashed p-5 text-center ${isDark ? 'border-gray-600 text-gray-500' : 'border-gray-300 text-gray-400'}`}>
                                <Database size={22} className="mx-auto mb-2 opacity-60" />
                                <p className="text-xs font-semibold">No source configs yet</p>
                            </div>
                        ) : (
                            configs.map((config) => {
                                const sourceId = config.source_id || '';
                                const type = config.source_type || 'api';
                                const isIngesting = ingestingSourceId === sourceId;
                                return (
                                    <div key={sourceId} className={`rounded-xl border p-3 ${isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-gray-50/60'}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className={`text-sm font-bold truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{config.name || sourceId}</p>
                                                <p className={`text-[11px] mt-0.5 break-all ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{sourceId}</p>
                                                <p className={`text-[10px] mt-1 uppercase tracking-widest font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{type}</p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => applyConfigToForm(config)}
                                                    className={`p-2 rounded-lg ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-white'}`}
                                                    title="Load to form"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleIngest(sourceId)}
                                                    disabled={isIngesting}
                                                    className={`p-2 rounded-lg ${isDark ? 'text-emerald-300 hover:bg-emerald-900/30' : 'text-emerald-700 hover:bg-emerald-100'} disabled:opacity-60`}
                                                    title="Ingest"
                                                >
                                                    <Play size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        {type === 'api' && (config.api_endpoint || config.url) && (
                                            <div className={`mt-2 text-[10px] break-all ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                                <Eye size={11} className="inline mr-1" />
                                                {config.api_endpoint || config.url}
                                            </div>
                                        )}
                                        {type === 'sftp' && config?.sftp?.remote_path && (
                                            <div className={`mt-2 text-[10px] break-all ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                                <Eye size={11} className="inline mr-1" />
                                                {config?.sftp?.remote_path}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const FormInput = ({ label, value, onChange, isDark, placeholder, type = 'text' }) => (
    <div>
        <label className={`block text-[11px] font-bold uppercase tracking-widest mb-1.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            {label}
        </label>
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all ${isDark ? 'bg-gray-900 border-gray-700 text-gray-200 placeholder-gray-600 focus:border-gray-500' : 'bg-white border-gray-200 text-gray-700 placeholder-gray-400 focus:border-gray-400'}`}
        />
    </div>
);

export default SourceConfigIngestionPage;
