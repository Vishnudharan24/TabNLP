import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import TemplateList from '../components/templates/TemplateList';
import TemplateMapping from '../components/templates/TemplateMapping';
import HRTemplateDashboard from '../components/templates/HRTemplateDashboard';
import { ANALYTICS_TEMPLATES } from '../data/templates';
import { backendApi } from '../services/backendApi';
import '../components/templates/templateSystem.css';

const extractHrDashboardSnapshot = (report) => {
    const charts = Array.isArray(report?.charts) ? report.charts : [];
    const snapshot = charts.find((item) => (
        item?.type === 'hr-template-dashboard' || item?.id === 'hr-template-dashboard-snapshot'
    ));
    const payload = snapshot?.payload;
    if (!payload || typeof payload !== 'object') return null;

    return {
        templateId: String(payload.templateId || 'hr'),
        mapping: payload.mapping && typeof payload.mapping === 'object' ? payload.mapping : {},
        missingFields: Array.isArray(payload.missingFields) ? payload.missingFields : [],
        datasetData: Array.isArray(payload.datasetData) ? payload.datasetData : [],
    };
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

                const snapshot = extractHrDashboardSnapshot(response?.report);
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
        return {
            hr: {
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
                    <HRTemplateDashboard
                        sessionByTemplate={templateSession}
                        datasetData={datasetData}
                    />
                )}
            />
            <Route
                path="/templates/:id/dashboard/shared/:reportId"
                element={sharedDashboardLoading ? (
                    <section className="cv-template-page">
                        <div className="cv-state-card">Loading shared HR dashboard...</div>
                    </section>
                ) : sharedDashboardError ? (
                    <section className="cv-template-page">
                        <div className="cv-validation-summary">
                            <p>{sharedDashboardError}</p>
                        </div>
                    </section>
                ) : (
                    <HRTemplateDashboard
                        sessionByTemplate={sharedTemplateSession}
                        datasetData={sharedDashboardPayload?.datasetData || []}
                        isSharedView
                    />
                )}
            />
            <Route path="*" element={<Navigate to="/templates" replace />} />
        </Routes>
    );
};

export default TemplateRoutes;
