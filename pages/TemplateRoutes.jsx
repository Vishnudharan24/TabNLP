import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import TemplateList from '../components/templates/TemplateList';
import TemplateMapping from '../components/templates/TemplateMapping';
import HRTemplateDashboard from '../components/templates/HRTemplateDashboard';
import SalesTemplateDashboard from '../components/templates/SalesTemplateDashboard';
import FinanceTemplateDashboard from '../components/templates/FinanceTemplateDashboard';
import { ANALYTICS_TEMPLATES } from '../data/templates';
import { backendApi } from '../services/backendApi';
import '../components/templates/templateSystem.css';

const extractTemplateDashboardSnapshot = (report) => {
    const charts = Array.isArray(report?.charts) ? report.charts : [];
    const snapshot = charts.find((item) => (
        item?.type === 'hr-template-dashboard'
        || item?.id === 'hr-template-dashboard-snapshot'
        || item?.type === 'sales-template-dashboard'
        || item?.id === 'sales-template-dashboard-snapshot'
        || item?.type === 'finance-template-dashboard'
        || item?.id === 'finance-template-dashboard-snapshot'
    ));
    const payload = snapshot?.payload;
    if (!payload || typeof payload !== 'object') return null;

    return {
        templateId: String(payload.templateId || 'hr'),
        mapping: payload.mapping && typeof payload.mapping === 'object' ? payload.mapping : {},
        missingFields: Array.isArray(payload.missingFields) ? payload.missingFields : [],
        datasetData: Array.isArray(payload.datasetData) ? payload.datasetData : [],
        dataset: payload.dataset && typeof payload.dataset === 'object' ? payload.dataset : null,
    };
};

const TemplateDashboardSwitch = ({ sessionByTemplate, datasetData, dataset, isSharedView = false }) => {
    const { id } = useParams();

    if (id === 'finance') {
        return (
            <FinanceTemplateDashboard
                sessionByTemplate={sessionByTemplate}
                dataset={dataset}
                isSharedView={isSharedView}
            />
        );
    }

    if (id === 'sales') {
        return (
            <SalesTemplateDashboard
                sessionByTemplate={sessionByTemplate}
                dataset={dataset}
                isSharedView={isSharedView}
            />
        );
    }

    return (
        <HRTemplateDashboard
            sessionByTemplate={sessionByTemplate}
            datasetData={datasetData}
            isSharedView={isSharedView}
        />
    );
};

const TemplateRoutes = ({ datasets = [], selectedDatasetId = null, setSelectedDatasetId, sharedTemplateRoute = null }) => {
    const navigate = useNavigate();
    const [isLoading] = useState(false);
    const [templateSession, setTemplateSession] = useState({});
    const [sharedDashboardLoading, setSharedDashboardLoading] = useState(false);
    const [sharedDashboardError, setSharedDashboardError] = useState('');
    const [sharedDashboardPayload, setSharedDashboardPayload] = useState(null);

    const selectedDataset = useMemo(
        () => datasets.find(ds => ds.id === selectedDatasetId) || datasets[0] || null,
        [datasets, selectedDatasetId]
    );
    const datasetColumns = selectedDataset?.columns ?? [];
    const datasetData = selectedDataset?.data ?? [];

    const safeDatasetColumns = useMemo(() => {
        if (datasetColumns == null) {
            const hrTemplate = ANALYTICS_TEMPLATES.find((template) => template.id === 'hr');
            return (hrTemplate?.requiredFields || []).map((field) => ({
                name: field.name,
                type: field.type,
            }));
        }

        return datasetColumns;
    }, [datasetColumns]);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            const reportId = String(sharedTemplateRoute?.reportId || '').trim();
            const shareToken = String(sharedTemplateRoute?.shareToken || '').trim();
            if (!reportId || !shareToken) {
                setSharedDashboardPayload(null);
                setSharedDashboardError('');
                setSharedDashboardLoading(false);
                return;
            }

            setSharedDashboardLoading(true);
            setSharedDashboardError('');
            try {
                const response = await backendApi.getSharedReport(reportId, shareToken);
                if (cancelled) return;

                const snapshot = extractTemplateDashboardSnapshot(response?.report);
                if (!snapshot) {
                    throw new Error('Shared dashboard payload is missing or invalid');
                }
                setSharedDashboardPayload(snapshot);
            } catch (error) {
                if (cancelled) return;
                setSharedDashboardPayload(null);
                setSharedDashboardError(error?.message || 'Unable to open shared dashboard');
            } finally {
                if (!cancelled) setSharedDashboardLoading(false);
            }
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [sharedTemplateRoute?.reportId, sharedTemplateRoute?.shareToken]);

    const sharedTemplateSession = useMemo(() => {
        if (!sharedDashboardPayload) return {};
        const templateId = String(sharedDashboardPayload.templateId || 'hr');
        return {
            [templateId]: {
                mapping: sharedDashboardPayload.mapping || {},
                warnings: [],
                missingFields: sharedDashboardPayload.missingFields || [],
                generatedAt: new Date().toISOString(),
            },
        };
    }, [sharedDashboardPayload]);

    const handleGenerateDashboard = ({ template, mapping, warnings, missingFields }) => {
        if (!template?.id) return;

        setTemplateSession((prev) => ({
            ...prev,
            [template.id]: {
                mapping,
                warnings: warnings || [],
                missingFields: missingFields || [],
                generatedAt: new Date().toISOString(),
            },
        }));

        navigate(`/templates/${template.id}/dashboard`);
    };

    return (
        <Routes>
            <Route
                path="/templates"
                element={<TemplateList templates={ANALYTICS_TEMPLATES} isLoading={isLoading} />}
            />
            <Route
                path="/templates/:id/map"
                element={(
                    <TemplateMapping
                        templates={ANALYTICS_TEMPLATES}
                        datasets={datasets}
                        selectedDatasetId={selectedDataset?.id || null}
                        onSelectDataset={setSelectedDatasetId}
                        datasetColumns={safeDatasetColumns}
                        datasetData={datasetData}
                        onGenerateDashboard={handleGenerateDashboard}
                    />
                )}
            />
            <Route
                path="/templates/:id/dashboard"
                element={(
                    <TemplateDashboardSwitch
                        sessionByTemplate={templateSession}
                        datasetData={datasetData}
                        dataset={selectedDataset}
                    />
                )}
            />
            <Route
                path="/templates/:id/dashboard/shared/:reportId"
                element={sharedDashboardLoading ? (
                    <section className="cv-template-page">
                        <div className="cv-state-card">Loading shared dashboard...</div>
                    </section>
                ) : sharedDashboardError ? (
                    <section className="cv-template-page">
                        <div className="cv-validation-summary">
                            <p>{sharedDashboardError}</p>
                        </div>
                    </section>
                ) : (
                    <TemplateDashboardSwitch
                        sessionByTemplate={sharedTemplateSession}
                        datasetData={sharedDashboardPayload?.datasetData || []}
                        dataset={sharedDashboardPayload?.dataset || null}
                        isSharedView
                    />
                )}
            />
            <Route path="*" element={<Navigate to="/templates" replace />} />
        </Routes>
    );
};

export default TemplateRoutes;
