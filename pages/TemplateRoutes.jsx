import React, { useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import TemplateList from '../components/templates/TemplateList';
import TemplateMapping from '../components/templates/TemplateMapping';
import HRTemplateDashboard from '../components/templates/HRTemplateDashboard';
import { ANALYTICS_TEMPLATES } from '../data/templates';
import '../components/templates/templateSystem.css';

const TemplateRoutes = ({ datasets = [], selectedDatasetId = null, setSelectedDatasetId }) => {
    const navigate = useNavigate();
    const [isLoading] = useState(false);
    const [templateSession, setTemplateSession] = useState({});

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

    const handleGenerateDashboard = ({ template, mapping, warnings }) => {
        if (!template?.id) return;

        setTemplateSession((prev) => ({
            ...prev,
            [template.id]: {
                mapping,
                warnings: warnings || [],
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
            <Route path="*" element={<Navigate to="/templates" replace />} />
        </Routes>
    );
};

export default TemplateRoutes;
