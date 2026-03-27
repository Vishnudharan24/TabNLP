import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';

const normalizeFieldName = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const inferColumnType = (columnName = '') => {
    const value = String(columnName || '').toLowerCase();
    if (/date|time|year|month/.test(value)) return 'date';
    if (/salary|amount|price|cost|revenue|pay|count|qty|quantity|value|total/.test(value)) return 'number';
    return 'string';
};

const normalizeDatasetColumns = (datasetColumns) => {
    if (!Array.isArray(datasetColumns)) return [];

    return datasetColumns
        .map((column) => {
            if (typeof column === 'string') {
                return { name: column, type: inferColumnType(column) };
            }

            if (column && typeof column === 'object') {
                return {
                    name: column.name || '',
                    type: column.type || inferColumnType(column.name),
                };
            }

            return null;
        })
        .filter((column) => column?.name);
};

const buildAutoMapping = (requiredFields, datasetColumns) => {
    const mapping = {};
    const usedColumns = new Set();

    requiredFields.forEach((field) => {
        const normalizedField = normalizeFieldName(field.name);

        const exactMatch = datasetColumns.find((column) => (
            normalizeFieldName(column.name) === normalizedField
            && !usedColumns.has(column.name)
        ));

        if (exactMatch) {
            mapping[field.name] = exactMatch.name;
            usedColumns.add(exactMatch.name);
            return;
        }

        const partialMatch = datasetColumns.find((column) => {
            const normalizedColumn = normalizeFieldName(column.name);
            return (
                !usedColumns.has(column.name)
                && (normalizedColumn.includes(normalizedField)
                    || normalizedField.includes(normalizedColumn))
            );
        });

        if (partialMatch) {
            mapping[field.name] = partialMatch.name;
            usedColumns.add(partialMatch.name);
        }
    });

    return mapping;
};

const parseExperienceToMonths = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value * 12;

    const text = String(value).toLowerCase().trim();
    if (!text) return null;

    const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yr|year\(s\))/);
    const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?|mo|month\(s\))/);

    if (yearMatch || monthMatch) {
        const years = yearMatch ? Number(yearMatch[1]) : 0;
        const months = monthMatch ? Number(monthMatch[1]) : 0;
        const total = years * 12 + months;
        return Number.isFinite(total) ? total : null;
    }

    const fallback = Number(text.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(fallback) ? fallback : null;
};

const parseNumberLike = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const cleaned = String(value).replace(/[^0-9.-]/g, '').trim();
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;

    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
};

const isSampleTypeCompatible = (samples = [], expectedType, fieldName = '') => {
    if (!Array.isArray(samples) || samples.length === 0) return true;
    if (expectedType !== 'number') return true;

    const normalizedField = normalizeFieldName(fieldName);
    const isExperienceField = normalizedField.includes('experience');

    return samples.every((value) => {
        if (value === null || value === undefined || value === '') return true;
        if (isExperienceField) return parseExperienceToMonths(value) !== null;
        return parseNumberLike(value) !== null;
    });
};

const TemplateMapping = ({ templates = [], datasetColumns, datasetData = [], onGenerateDashboard }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { theme } = useTheme();

    const template = useMemo(
        () => templates.find((entry) => entry.id === id),
        [templates, id]
    );

    const normalizedColumns = useMemo(
        () => normalizeDatasetColumns(datasetColumns),
        [datasetColumns]
    );

    const [mapping, setMapping] = useState({});
    const [fieldSearch, setFieldSearch] = useState({});
    const [openField, setOpenField] = useState(null);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        if (!template) return;
        const nextMapping = buildAutoMapping(template.requiredFields, normalizedColumns);
        setMapping(nextMapping);
        setFieldSearch({});
        setOpenField(null);
        setSubmitted(false);
    }, [template, normalizedColumns]);

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (!event.target.closest('.cv-searchable-dropdown')) {
                setOpenField(null);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const validation = useMemo(() => {
        if (!template) {
            return { missing: [], mismatches: [] };
        }

        const missing = [];
        const mismatches = [];

        template.requiredFields.forEach((field) => {
            const selectedColumnName = mapping[field.name];
            if (!selectedColumnName) {
                missing.push(field.name);
                return;
            }

            const selectedColumn = normalizedColumns.find((column) => column.name === selectedColumnName);
            const selectedType = selectedColumn?.type || 'string';
            const sampleValues = Array.isArray(datasetData)
                ? datasetData
                    .map((row) => row?.[selectedColumnName])
                    .filter((value) => value !== null && value !== undefined && value !== '')
                    .slice(0, 40)
                : [];

            const sampleCompatible = isSampleTypeCompatible(sampleValues, field.type, field.name);

            if (field.type !== selectedType && !sampleCompatible) {
                mismatches.push({
                    field: field.name,
                    expected: field.type,
                    actual: selectedType,
                });
            }
        });

        return { missing, mismatches };
    }, [template, mapping, normalizedColumns, datasetData]);

    const uploadedColumnLines = useMemo(() => {
        const names = normalizedColumns.map((column) => column.name).filter(Boolean);
        if (names.length === 0) return [];

        const maxPerLine = 8;
        const lines = [];
        for (let i = 0; i < names.length; i += maxPerLine) {
            lines.push(names.slice(i, i + maxPerLine).join(', '));
        }
        return lines;
    }, [normalizedColumns]);

    const handleChangeMapping = (fieldName, columnName) => {
        setMapping((prev) => ({
            ...prev,
            [fieldName]: columnName || '',
        }));
    };

    const handleSearchChange = (fieldName, query) => {
        setFieldSearch((prev) => ({
            ...prev,
            [fieldName]: query,
        }));
    };

    const handleToggleDropdown = (fieldName) => {
        setOpenField((prev) => (prev === fieldName ? null : fieldName));
        setFieldSearch((prev) => ({
            ...prev,
            [fieldName]: prev[fieldName] || '',
        }));
    };

    const handleSelectFromDropdown = (fieldName, columnName) => {
        handleChangeMapping(fieldName, columnName);
        setOpenField(null);
        setFieldSearch((prev) => ({
            ...prev,
            [fieldName]: '',
        }));
    };

    const handleGenerateDashboard = () => {
        setSubmitted(true);
        if (validation.missing.length > 0) return;

        if (typeof onGenerateDashboard === 'function') {
            onGenerateDashboard({
                template,
                mapping,
                warnings: validation.mismatches,
            });
            return;
        }

        navigate('/templates');
    };

    if (!template) {
        return (
            <section className={`cv-template-page ${theme === 'dark' ? 'cv-template-page--dark' : ''}`}>
                <div className="cv-state-card">
                    Template not found. <Link to="/templates">Go back to templates</Link>
                </div>
            </section>
        );
    }

    if (datasetColumns == null) {
        return (
            <section className={`cv-template-page ${theme === 'dark' ? 'cv-template-page--dark' : ''}`}>
                <div className="cv-state-card">Loading dataset columns...</div>
            </section>
        );
    }

    return (
        <section className={`cv-template-page ${theme === 'dark' ? 'cv-template-page--dark' : ''}`}>
            <header className="cv-template-page__header cv-template-page__header--map">
                <div>
                    <h1>{template.name} Mapping</h1>
                    <p>Map your dataset columns to the required template fields.</p>
                </div>
                <Link className="cv-btn cv-btn--ghost" to="/templates">Back to Templates</Link>
            </header>

            {normalizedColumns.length === 0 ? (
                <div className="cv-state-card">
                    No uploaded columns available. Upload data and revisit mapping.
                </div>
            ) : (
                <div className="cv-mapping-grid">
                    <div className="cv-mapping-panel">
                        <h2>Template Fields</h2>
                        {template.requiredFields.map((field) => {
                            const mismatch = validation.mismatches.find((entry) => entry.field === field.name);
                            const searchValue = (fieldSearch[field.name] || '').trim().toLowerCase();
                            const selectedColumnName = mapping[field.name] || '';
                            const filteredColumns = normalizedColumns.filter((column) => (
                                !searchValue
                                || column.name.toLowerCase().includes(searchValue)
                                || String(column.type || '').toLowerCase().includes(searchValue)
                            ));
                            return (
                                <div key={field.name} className="cv-mapping-row">
                                    <div>
                                        <strong>{field.name}</strong>
                                        <p className="cv-field-meta">Expected type: {field.type}</p>
                                    </div>
                                    <div className="cv-searchable-dropdown">
                                        <button
                                            type="button"
                                            className="cv-searchable-dropdown__trigger"
                                            onClick={() => handleToggleDropdown(field.name)}
                                        >
                                            <span className={!selectedColumnName ? 'cv-searchable-dropdown__placeholder' : ''}>
                                                {selectedColumnName || 'Select dataset column'}
                                            </span>
                                            <span aria-hidden="true">▾</span>
                                        </button>

                                        {openField === field.name && (
                                            <div className="cv-searchable-dropdown__menu">
                                                <input
                                                    type="text"
                                                    value={fieldSearch[field.name] || ''}
                                                    onChange={(event) => handleSearchChange(field.name, event.target.value)}
                                                    placeholder="Search inside dropdown"
                                                    className="cv-searchable-dropdown__search"
                                                    autoFocus
                                                />
                                                <div className="cv-searchable-dropdown__options">
                                                    <button
                                                        type="button"
                                                        className="cv-searchable-dropdown__option"
                                                        onMouseDown={(event) => {
                                                            event.preventDefault();
                                                            handleSelectFromDropdown(field.name, '');
                                                        }}
                                                    >
                                                        Clear selection
                                                    </button>
                                                    {filteredColumns.map((column) => (
                                                        <button
                                                            key={column.name}
                                                            type="button"
                                                            className="cv-searchable-dropdown__option"
                                                            onMouseDown={(event) => {
                                                                event.preventDefault();
                                                                handleSelectFromDropdown(field.name, column.name);
                                                            }}
                                                        >
                                                            <span>{column.name}</span>
                                                            <span className="cv-tag">{column.type}</span>
                                                        </button>
                                                    ))}
                                                    {filteredColumns.length === 0 && (
                                                        <div className="cv-searchable-dropdown__empty">No matching columns</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {submitted && !mapping[field.name] && (
                                        <p className="cv-warning">Missing required field mapping.</p>
                                    )}
                                    {mismatch && (
                                        <p className="cv-warning">
                                            Type mismatch: expected {mismatch.expected}, got {mismatch.actual}.
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="cv-mapping-panel">
                        <h2>Uploaded Dataset Columns</h2>
                        <div className="cv-column-list-compact">
                            {uploadedColumnLines.map((line, index) => (
                                <p key={`${line}-${index}`}>
                                    {line}
                                    {index < uploadedColumnLines.length - 1 ? ',' : ''}
                                </p>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {(validation.missing.length > 0 || validation.mismatches.length > 0) && (
                <div className="cv-validation-summary">
                    {validation.missing.length > 0 && (
                        <p>
                            Missing fields: {validation.missing.join(', ')}
                        </p>
                    )}
                    {validation.mismatches.length > 0 && (
                        <p>
                            Type warnings: {validation.mismatches.map((m) => m.field).join(', ')}
                        </p>
                    )}
                </div>
            )}

            <div className="cv-actions-row">
                <button
                    type="button"
                    className="cv-btn cv-btn--primary"
                    onClick={handleGenerateDashboard}
                    disabled={normalizedColumns.length === 0}
                >
                    Generate Dashboard
                </button>
            </div>
        </section>
    );
};

export default TemplateMapping;
