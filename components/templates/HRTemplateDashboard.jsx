import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { useTheme } from '../../contexts/ThemeContext';
import { backendApi } from '../../services/backendApi';

const MODULES = [
    'summary',
    'demographics',
    'hiring',
    'attrition',
    'experience',
    'org',
    'payroll',
    'education',
    'location',
    'department',
    'lifecycle',
    'compliance',
    'contact',
    'data-quality',
];

const toValueMap = (items = []) => {
    const map = {};
    items.forEach((item) => {
        if (item?.name != null) map[item.name] = item.value || 0;
    });
    return map;
};

const chartBase = (isDark) => ({
    backgroundColor: 'transparent',
    textStyle: { color: isDark ? '#e5e7eb' : '#0f172a' },
    tooltip: { trigger: 'item' },
});

const KpiCard = ({ title, value, hint, isDark }) => (
    <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{title}</p>
        <h3 className={`mt-2 text-3xl font-black ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{value}</h3>
        {hint && <p className={`mt-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{hint}</p>}
    </div>
);

const ChartCard = ({ title, option, isDark, height = 320 }) => (
    <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h3 className={`mb-3 text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
        <ReactECharts option={option} style={{ width: '100%', height }} notMerge lazyUpdate />
    </div>
);

const HRTemplateDashboard = ({ sessionByTemplate, datasetData = [] }) => {
    const { id } = useParams();
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const session = sessionByTemplate?.[id] || null;
    const mapping = session?.mapping || null;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [analytics, setAnalytics] = useState({});
    const [validation, setValidation] = useState([]);

    useEffect(() => {
        let mounted = true;

        const run = async () => {
            if (id !== 'hr') return;
            if (!mapping || !Array.isArray(datasetData) || datasetData.length === 0) return;

            setLoading(true);
            setError('');

            try {
                const payload = { data: datasetData, mapping };
                const responses = await Promise.all(MODULES.map((moduleName) => backendApi.getHrAnalytics(moduleName, payload)));

                if (!mounted) return;

                const nextAnalytics = {};
                const validationList = [];

                responses.forEach((res) => {
                    nextAnalytics[res.module] = res.data || {};
                    if (res.validation) {
                        validationList.push({ module: res.module, ...res.validation });
                    }
                });

                setAnalytics(nextAnalytics);
                setValidation(validationList);
            } catch (e) {
                if (!mounted) return;
                setError(e?.message || 'Failed to load HR analytics');
            } finally {
                if (mounted) setLoading(false);
            }
        };

        run();

        return () => {
            mounted = false;
        };
    }, [id, mapping, datasetData]);

    const summary = analytics.summary || {};
    const attrition = analytics.attrition || {};
    const demographics = analytics.demographics || {};
    const hiring = analytics.hiring || {};
    const org = analytics.org || {};

    const hasValidationWarnings = useMemo(
        () => validation.some((v) => (v?.missingFields?.length || 0) > 0 || (v?.typeWarnings?.length || 0) > 0),
        [validation]
    );

    const summaryKpis = summary.kpis || {};
    const summaryCharts = summary.charts || {};

    const deptItems = summaryCharts.headcount_by_department || summary.headcountByDepartment || [];
    const businessUnitItems = summaryCharts.headcount_by_business_unit || summary.headcountByBusinessUnit || [];
    const locationItems = summaryCharts.headcount_by_location || summary.headcountByLocation || [];
    const workforceCategoryItems = summaryCharts.workforce_category_distribution || summary.workforceCategoryDistribution || [];
    const genderItems = summaryCharts.gender_ratio || summary.genderRatio || [];
    const maritalStatusItems = summaryCharts.marital_status_distribution || summary.maritalStatusDistribution || [];
    const ageItems = demographics.ageDistribution || [];
    const hiringItems = hiring.monthlyHiringTrend || [];
    const attritionByDept = attrition.exitsByDepartment || [];

    const headcountMap = toValueMap(deptItems);
    const attritionBarData = attritionByDept.map((item) => ({
        name: item.name,
        value: item.value,
        total: headcountMap[item.name] || 0,
    }));

    if (id !== 'hr') {
        return (
            <section className={`cv-template-page ${isDark ? 'cv-template-page--dark' : ''}`}>
                <div className="cv-state-card">
                    Dashboard is available only for HR template. <Link to="/templates">Go back</Link>
                </div>
            </section>
        );
    }

    if (!session || !mapping) {
        return (
            <section className={`cv-template-page ${isDark ? 'cv-template-page--dark' : ''}`}>
                <div className="cv-state-card">
                    Mapping not found. Please map your template fields first.{' '}
                    <Link to="/templates/hr/map">Go to mapping</Link>
                </div>
            </section>
        );
    }

    if (!Array.isArray(datasetData) || datasetData.length === 0) {
        return (
            <section className={`cv-template-page ${isDark ? 'cv-template-page--dark' : ''}`}>
                <div className="cv-state-card">No dataset rows available for analytics.</div>
            </section>
        );
    }

    return (
        <section className={`cv-template-page ${isDark ? 'cv-template-page--dark' : ''}`}>
            <header className="cv-template-page__header cv-template-page__header--map">
                <div>
                    <h1>HR Analytics Dashboard</h1>
                    <p>Template-driven HR insights generated from mapped fields and dataset rows.</p>
                </div>
                <Link className="cv-btn cv-btn--ghost" to="/templates/hr/map">Back to Mapping</Link>
            </header>

            {loading && <div className="cv-state-card">Generating HR analytics...</div>}
            {!loading && error && <div className="cv-validation-summary"><p>{error}</p></div>}

            {!loading && !error && hasValidationWarnings && (
                <div className="cv-validation-summary">
                    {validation.map((v) => (
                        <div key={v.module}>
                            {v.missingFields?.length > 0 && <p>{v.module}: missing fields - {v.missingFields.join(', ')}</p>}
                            {v.typeWarnings?.length > 0 && <p>{v.module}: type warnings - {v.typeWarnings.map((w) => w.field).join(', ')}</p>}
                        </div>
                    ))}
                </div>
            )}

            {!loading && !error && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        <KpiCard title="Total Employees" value={summaryKpis.totalEmployees ?? summary.totalEmployees ?? 0} hint="Across mapped dataset" isDark={isDark} />
                        <KpiCard title="Active Employees" value={summaryKpis.activeEmployees ?? summary.activeEmployees ?? 0} hint="Current active workforce" isDark={isDark} />
                        <KpiCard title="Inactive Employees" value={summaryKpis.inactiveEmployees ?? summary.inactiveEmployees ?? 0} hint="Derived from workforce status" isDark={isDark} />
                        <KpiCard title="Attrition Rate" value={`${attrition.attritionRate || 0}%`} hint="Based on exits" isDark={isDark} />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
                        <ChartCard
                            title="Department Distribution"
                            isDark={isDark}
                            option={{
                                ...chartBase(isDark),
                                xAxis: { type: 'category', data: deptItems.map((d) => d.name) },
                                yAxis: { type: 'value' },
                                series: [{ type: 'bar', data: deptItems.map((d) => d.value), itemStyle: { color: '#2563eb' } }],
                            }}
                        />

                        <ChartCard
                            title="Gender Distribution"
                            isDark={isDark}
                            option={{
                                ...chartBase(isDark),
                                legend: { top: 10, textStyle: { color: isDark ? '#d1d5db' : '#334155' } },
                                series: [{ type: 'pie', radius: ['40%', '70%'], data: genderItems }],
                            }}
                        />

                        <ChartCard
                            title="Business Unit Distribution"
                            isDark={isDark}
                            option={{
                                ...chartBase(isDark),
                                xAxis: { type: 'category', data: businessUnitItems.map((d) => d.name) },
                                yAxis: { type: 'value' },
                                series: [{ type: 'bar', data: businessUnitItems.map((d) => d.value), itemStyle: { color: '#0ea5e9' } }],
                            }}
                        />

                        <ChartCard
                            title="Location Distribution"
                            isDark={isDark}
                            option={{
                                ...chartBase(isDark),
                                xAxis: { type: 'category', data: locationItems.map((d) => d.name) },
                                yAxis: { type: 'value' },
                                series: [{ type: 'bar', data: locationItems.map((d) => d.value), itemStyle: { color: '#14b8a6' } }],
                            }}
                        />

                        <ChartCard
                            title="Workforce Category Distribution"
                            isDark={isDark}
                            option={{
                                ...chartBase(isDark),
                                legend: { top: 10, textStyle: { color: isDark ? '#d1d5db' : '#334155' } },
                                series: [{ type: 'pie', radius: ['35%', '70%'], data: workforceCategoryItems }],
                            }}
                        />

                        <ChartCard
                            title="Marital Status Distribution"
                            isDark={isDark}
                            option={{
                                ...chartBase(isDark),
                                legend: { top: 10, textStyle: { color: isDark ? '#d1d5db' : '#334155' } },
                                series: [{ type: 'pie', radius: ['35%', '70%'], data: maritalStatusItems }],
                            }}
                        />

                        <ChartCard
                            title="Age Distribution"
                            isDark={isDark}
                            option={{
                                ...chartBase(isDark),
                                xAxis: { type: 'category', data: ageItems.map((d) => d.name) },
                                yAxis: { type: 'value' },
                                series: [{ type: 'bar', data: ageItems.map((d) => d.value), itemStyle: { color: '#16a34a' } }],
                            }}
                        />

                        <ChartCard
                            title="Hiring Trend"
                            isDark={isDark}
                            option={{
                                ...chartBase(isDark),
                                xAxis: { type: 'category', data: hiringItems.map((d) => d.name) },
                                yAxis: { type: 'value' },
                                series: [{ type: 'line', smooth: true, data: hiringItems.map((d) => d.value), itemStyle: { color: '#7c3aed' } }],
                            }}
                        />

                        <ChartCard
                            title="Attrition by Department"
                            isDark={isDark}
                            option={{
                                ...chartBase(isDark),
                                xAxis: { type: 'category', data: attritionBarData.map((d) => d.name) },
                                yAxis: { type: 'value' },
                                series: [{ type: 'bar', data: attritionBarData.map((d) => d.value), itemStyle: { color: '#dc2626' } }],
                            }}
                        />

                        <ChartCard
                            title="Organization Tree"
                            isDark={isDark}
                            option={{
                                ...chartBase(isDark),
                                series: [
                                    {
                                        type: 'tree',
                                        data: [org.hierarchy || { name: 'Organization', children: [] }],
                                        top: '5%',
                                        left: '8%',
                                        bottom: '5%',
                                        right: '20%',
                                        symbolSize: 8,
                                        initialTreeDepth: 2,
                                        expandAndCollapse: true,
                                        label: { position: 'left', verticalAlign: 'middle', align: 'right', fontSize: 11 },
                                        leaves: { label: { position: 'right', align: 'left' } },
                                    },
                                ],
                            }}
                        />
                    </div>
                </>
            )}
        </section>
    );
};

export default HRTemplateDashboard;
