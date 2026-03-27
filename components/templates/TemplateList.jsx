import React from 'react';
import { useNavigate } from 'react-router-dom';
import TemplateCard from './TemplateCard';
import { useTheme } from '../../contexts/ThemeContext';

const TemplateList = ({ templates = [], isLoading = false }) => {
    const navigate = useNavigate();
    const { theme } = useTheme();

    const handleUseTemplate = (templateId) => {
        navigate(`/templates/${templateId}/map`);
    };

    return (
        <section className={`cv-template-page ${theme === 'dark' ? 'cv-template-page--dark' : ''}`}>
            <header className="cv-template-page__header">
                <h1>Chillview Templates</h1>
                <p>Choose a ready-to-use analytics template to accelerate dashboard creation.</p>
            </header>

            {isLoading && (
                <div className="cv-state-card">Loading templates...</div>
            )}

            {!isLoading && templates.length === 0 && (
                <div className="cv-state-card">No templates available right now.</div>
            )}

            {!isLoading && templates.length > 0 && (
                <div className="cv-template-grid">
                    {templates.map((template) => (
                        <TemplateCard
                            key={template.id}
                            template={template}
                            onUseTemplate={handleUseTemplate}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};

export default TemplateList;
