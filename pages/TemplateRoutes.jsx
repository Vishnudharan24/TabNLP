import React, { useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import TemplateList from '../components/templates/TemplateList';
import TemplateMapping from '../components/templates/TemplateMapping';
import HRTemplateDashboard from '../components/templates/HRTemplateDashboard';
import { ANALYTICS_TEMPLATES } from '../data/templates';
import '../components/templates/templateSystem.css';

const TemplateRoutes = ({ datasetColumns = null, datasetData = [] }) => {
    const navigate = useNavigate();
    const [isLoading] = useState(false);
    const [templateSession, setTemplateSession] = useState({});

    const safeDatasetColumns = useMemo(() => {
        if (datasetColumns == null) {
            return [
                { name: 'Employee_ID', type: 'string' },
                { name: 'Employment_Status', type: 'string' },
                { name: 'Department', type: 'string' },
                { name: 'Business_Unit', type: 'string' },
                { name: 'Location', type: 'string' },
                { name: 'Workforce_Category', type: 'string' },
                { name: 'Gender', type: 'string' },
                { name: 'Marital_Status', type: 'string' },
            ];
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
