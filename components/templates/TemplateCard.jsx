import React from 'react';

const TemplateCard = ({ template, onUseTemplate }) => {
    if (!template) return null;

    return (
        <article className="cv-template-card">
            <div className="cv-template-card__body">
                <h3 className="cv-template-card__title">{template.name}</h3>
                <p className="cv-template-card__description">{template.description}</p>
            </div>
            <button
                type="button"
                className="cv-btn cv-btn--primary"
                onClick={() => onUseTemplate(template.id)}
            >
                Use Template
            </button>
        </article>
    );
};

export default TemplateCard;
