import React, { useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import TemplateList from '../components/templates/TemplateList';
import TemplateMapping from '../components/templates/TemplateMapping';
import { ANALYTICS_TEMPLATES } from '../data/templates';
import '../components/templates/templateSystem.css';

const TemplateRoutes = ({ datasetColumns = null }) => {
    const [isLoading] = useState(false);

    const safeDatasetColumns = useMemo(() => {
        if (datasetColumns == null) {
            return [
                { name: 'Employee_ID', type: 'string' },
                { name: 'Employee_Name', type: 'string' },
                { name: 'Department', type: 'string' },
                { name: 'Salary', type: 'number' },
                { name: 'Hire_Date', type: 'date' },
            ];
        }

        return datasetColumns;
    }, [datasetColumns]);

    const handleGenerateDashboard = ({ template, mapping, warnings }) => {
        console.info('Template dashboard generation payload:', {
            templateId: template?.id,
            mapping,
            warnings,
        });
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
                        onGenerateDashboard={handleGenerateDashboard}
                    />
                )}
            />
            <Route path="*" element={<Navigate to="/templates" replace />} />
        </Routes>
    );
};

export default TemplateRoutes;
