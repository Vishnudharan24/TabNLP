import React, { useMemo, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from '../contexts/ThemeContext';
import { buildHrAnalytics, createDefaultHrFilters } from '../services/hrAnalyticsService';

const TABS = [
    { id: 'workforce', label: 'Workforce Overview' },
    { id: 'demographics', label: 'Demographics' },
    { id: 'organization', label: 'Organization Structure' },
    { id: 'movement', label: 'Movement & Lifecycle' },
    { id: 'attrition', label: 'Attrition Analysis' },
    { id: 'employee360', label: 'Employee 360' },
];

const ChartCard = ({ title, option, height = 280, empty = false, theme }) => (
    <div className={`rounded-2xl border p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h3 className={`text-sm font-bold mb-3 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
        {empty ? (
            <div className={`h-[${height}px] flex items-center justify-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>No data</div>
        ) : (
            <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'canvas' }} />
        )}
    </div>
);

const simpleBar = (data, isDark, horizontal = false) => ({
    tooltip: { trigger: 'axis' },
    grid: { left: horizontal ? 120 : 40, right: 20, top: 20, bottom: 40, containLabel: true },
    xAxis: horizontal ? { type: 'value' } : { type: 'category', data: data.map((d) => d.name), axisLabel: { rotate: 35 } },
    yAxis: horizontal ? { type: 'category', data: data.map((d) => d.name) } : { type: 'value' },
    series: [{
        type: 'bar',
        data: horizontal ? data.map((d) => d.value) : data.map((d) => d.value),
        itemStyle: { color: isDark ? '#60a5fa' : '#2563eb' },
        label: { show: true, position: horizontal ? 'right' : 'top' },
    }],
    textStyle: { color: isDark ? '#d1d5db' : '#374151' },
});

const simpleLine = (data, isDark) => {
    const sorted = [...data].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 20, top: 20, bottom: 40 },
        xAxis: { type: 'category', data: sorted.map((d) => d.name) },
        yAxis: { type: 'value' },
        series: [{ type: 'line', smooth: true, data: sorted.map((d) => d.value), areaStyle: {} }],
        color: [isDark ? '#34d399' : '#059669'],
        textStyle: { color: isDark ? '#d1d5db' : '#374151' },
    };
};

const simplePie = (data, isDark, donut = true) => ({
    tooltip: { trigger: 'item' },
    legend: { top: 'bottom', textStyle: { color: isDark ? '#d1d5db' : '#374151' } },
    series: [{
        type: 'pie',
        radius: donut ? ['45%', '70%'] : ['0%', '70%'],
        data,
        label: { formatter: '{b}: {d}%' },
    }],
    textStyle: { color: isDark ? '#d1d5db' : '#374151' },
});

const workforceKpi = ({ label, value, theme }) => (
    <div className={`rounded-xl border p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <p className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
        <p className={`text-2xl font-bold mt-1 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{value}</p>
    </div>
);

const HRAnalyticsDashboard = ({ datasets = [] }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [activeTab, setActiveTab] = useState('workforce');
    const [datasetId, setDatasetId] = useState('');
    const [filters, setFilters] = useState(createDefaultHrFilters());
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

    useEffect(() => {
        if (!datasetId && datasets.length > 0) {
            setDatasetId(datasets[0].id);
        }
    }, [datasets, datasetId]);

    const selectedDataset = useMemo(() => datasets.find((dataset) => dataset.id === datasetId) || datasets[0], [datasets, datasetId]);

    const analytics = useMemo(() => buildHrAnalytics(selectedDataset?.data || [], filters, selectedEmployeeId), [selectedDataset, filters, selectedEmployeeId]);

    useEffect(() => {
        if (!selectedEmployeeId && analytics.employees?.length) {
            setSelectedEmployeeId(analytics.employees[0].id);
        }
    }, [analytics.employees, selectedEmployeeId]);

    const filterControl = (id, label, options = []) => (
        <div className="flex flex-col gap-1">
            <label className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{label}</label>
            <select
                value={filters[id] || 'ALL'}
                onChange={(e) => setFilters((prev) => ({ ...prev, [id]: e.target.value }))}
                className={`rounded-lg border px-3 py-2 text-sm ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
            >
                <option value="ALL">All</option>
                {options.map((value) => (
                    <option key={value} value={value}>{value}</option>
                ))}
            </select>
        </div>
    );

    if (!selectedDataset) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <p className={isDark ? 'text-gray-500' : 'text-gray-500'}>No dataset available. Add HR data first.</p>
            </div>
        );
    }

    const gradeCategories = Array.from(new Set(analytics.organization.gradeDesignation.map((item) => item.grade)));
    const designationCategories = Array.from(new Set(analytics.organization.gradeDesignation.map((item) => item.designation)));

    const gradeStackedOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, textStyle: { color: isDark ? '#d1d5db' : '#374151' } },
        grid: { left: 20, right: 20, top: 20, bottom: 80, containLabel: true },
        xAxis: { type: 'category', data: gradeCategories },
        yAxis: { type: 'value' },
        series: designationCategories.map((designation) => ({
            name: designation,
            type: 'bar',
            stack: 'total',
            data: gradeCategories.map((grade) => analytics.organization.gradeDesignation.find((g) => g.grade === grade && g.designation === designation)?.value || 0),
        })),
        textStyle: { color: isDark ? '#d1d5db' : '#374151' },
    };

    const heatmapDepts = Array.from(new Set(analytics.attrition.deptLocationHeatmap.map((item) => item.department)));
    const heatmapLocs = Array.from(new Set(analytics.attrition.deptLocationHeatmap.map((item) => item.location)));
    const heatmapOption = {
        tooltip: { position: 'top' },
        grid: { height: '65%', top: '10%' },
        xAxis: { type: 'category', data: heatmapLocs },
        yAxis: { type: 'category', data: heatmapDepts },
        visualMap: {
            min: 0,
            max: Math.max(1, ...analytics.attrition.deptLocationHeatmap.map((item) => item.value)),
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '5%',
        },
        series: [{
            type: 'heatmap',
            data: analytics.attrition.deptLocationHeatmap.map((item) => [
                heatmapLocs.indexOf(item.location),
                heatmapDepts.indexOf(item.department),
                item.value,
            ]),
            label: { show: true },
        }],
        textStyle: { color: isDark ? '#d1d5db' : '#374151' },
    };

    return (
        <div className="flex-1 overflow-auto p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className={`text-2xl font-bold mr-auto ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>HR Analytics Dashboard</h1>
                <select
                    value={datasetId}
                    onChange={(e) => setDatasetId(e.target.value)}
                    className={`rounded-lg border px-3 py-2 text-sm ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                >
                    {datasets.map((dataset) => (
                        <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                    ))}
                </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                {filterControl('activeStatus', 'Active Status', analytics.filterOptions.activeStatus || [])}
                {filterControl('legalEntity', 'Legal Entity', analytics.filterOptions.legalEntity || [])}
                {filterControl('businessUnit', 'Business Unit', analytics.filterOptions.businessUnit || [])}
                {filterControl('functionName', 'Function', analytics.filterOptions.functionName || [])}
                {filterControl('department', 'Department', analytics.filterOptions.department || [])}
                {filterControl('location', 'Location', analytics.filterOptions.location || [])}
                {filterControl('grade', 'Grade', analytics.filterOptions.grade || [])}
                {filterControl('gender', 'Gender', analytics.filterOptions.gender || [])}
                <div className="flex flex-col gap-1">
                    <label className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>From Date</label>
                    <input
                        type="date"
                        value={filters.fromDate}
                        onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
                        className={`rounded-lg border px-3 py-2 text-sm ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>To Date</label>
                    <input
                        type="date"
                        value={filters.toDate}
                        onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
                        className={`rounded-lg border px-3 py-2 text-sm ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold ${activeTab === tab.id
                            ? (isDark ? 'bg-gray-100 text-gray-900' : 'bg-gray-900 text-white')
                            : (isDark ? 'bg-gray-800 text-gray-300 border border-gray-700' : 'bg-white text-gray-700 border border-gray-200')}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'workforce' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {workforceKpi({ label: 'Total Employees', value: analytics.workforce.totalEmployees, theme })}
                        {workforceKpi({ label: 'Active Employees', value: analytics.workforce.activeEmployees, theme })}
                        {workforceKpi({ label: 'New Joiners (Month)', value: analytics.workforce.newJoinersMonth, theme })}
                        {workforceKpi({ label: 'Exits (Month)', value: analytics.workforce.exitsMonth, theme })}
                        {workforceKpi({ label: 'Attrition Rate', value: `${analytics.workforce.attritionRate.toFixed(2)}%`, theme })}
                        {workforceKpi({ label: 'Avg Experience', value: analytics.workforce.avgExperience.toFixed(2), theme })}
                    </div>
                </div>
            )}

            {activeTab === 'demographics' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ChartCard title="Gender Split" option={simplePie(analytics.demographics.genderSplit, isDark, true)} theme={theme} empty={analytics.demographics.genderSplit.length === 0} />
                    <ChartCard title="Age Bands" option={simpleBar(analytics.demographics.ageBands, isDark)} theme={theme} empty={analytics.demographics.ageBands.length === 0} />
                    <ChartCard title="Marital Status" option={simpleBar(analytics.demographics.maritalStatus, isDark)} theme={theme} empty={analytics.demographics.maritalStatus.length === 0} />
                    <ChartCard title="Nationality" option={simpleBar(analytics.demographics.nationality, isDark)} theme={theme} empty={analytics.demographics.nationality.length === 0} />
                    <ChartCard title="Religion" option={simpleBar(analytics.demographics.religion, isDark)} theme={theme} empty={analytics.demographics.religion.length === 0} />
                    <ChartCard title="Highest Qualification" option={simpleBar(analytics.demographics.qualification, isDark)} theme={theme} empty={analytics.demographics.qualification.length === 0} />
                    <div className="lg:col-span-2">
                        <ChartCard title="State / City Headcount" option={simpleBar(analytics.demographics.stateCity, isDark)} theme={theme} empty={analytics.demographics.stateCity.length === 0} />
                    </div>
                </div>
            )}

            {activeTab === 'organization' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ChartCard
                        title="Legal Entity → Business Unit → Function → Department"
                        option={{
                            series: [{ type: 'sunburst', data: analytics.organization.hierarchy, radius: [0, '90%'] }],
                            tooltip: { trigger: 'item' },
                            textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                        }}
                        theme={theme}
                        empty={analytics.organization.hierarchy.length === 0}
                    />
                    <ChartCard title="Grade vs Designation" option={gradeStackedOption} theme={theme} empty={analytics.organization.gradeDesignation.length === 0} />
                    <ChartCard title="Workforce Category Mix" option={simplePie(analytics.organization.workforceCategoryMix, isDark, false)} theme={theme} empty={analytics.organization.workforceCategoryMix.length === 0} />
                    <ChartCard title="Nature of Employment Mix" option={simplePie(analytics.organization.natureOfEmploymentMix, isDark, false)} theme={theme} empty={analytics.organization.natureOfEmploymentMix.length === 0} />
                    <div className="lg:col-span-2">
                        <ChartCard
                            title="Manager Hierarchy"
                            option={{
                                tooltip: { trigger: 'item', triggerOn: 'mousemove' },
                                series: [{
                                    type: 'tree',
                                    data: analytics.organization.managerHierarchy,
                                    top: '5%',
                                    left: '8%',
                                    bottom: '5%',
                                    right: '20%',
                                    symbolSize: 8,
                                    label: { position: 'left', verticalAlign: 'middle', align: 'right', fontSize: 10 },
                                    leaves: { label: { position: 'right', align: 'left' } },
                                    expandAndCollapse: true,
                                    initialTreeDepth: 2,
                                }],
                                textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                            }}
                            theme={theme}
                            empty={analytics.organization.managerHierarchy.length === 0}
                            height={340}
                        />
                    </div>
                </div>
            )}

            {activeTab === 'movement' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ChartCard title="Joining Trend by Month" option={simpleLine(analytics.movement.joiningTrend, isDark)} theme={theme} empty={analytics.movement.joiningTrend.length === 0} />
                    <ChartCard title="Internal Movement Trend" option={simpleLine(analytics.movement.internalMovementTrend, isDark)} theme={theme} empty={analytics.movement.internalMovementTrend.length === 0} />
                    <ChartCard title="Reason for Movement" option={simpleBar(analytics.movement.movementReason, isDark, true)} theme={theme} empty={analytics.movement.movementReason.length === 0} />
                    <ChartCard
                        title="Probation Tracking"
                        option={simplePie([
                            { name: 'Completed', value: analytics.movement.probation.completed },
                            { name: 'Ongoing', value: analytics.movement.probation.ongoing },
                            { name: 'Overdue', value: analytics.movement.probation.overdue },
                        ], isDark, true)}
                        theme={theme}
                    />
                    <div className="lg:col-span-2">
                        <ChartCard
                            title="Status Pipeline"
                            option={{
                                tooltip: { trigger: 'item' },
                                series: [{ type: 'funnel', left: '10%', width: '80%', data: analytics.movement.statusPipeline }],
                                textStyle: { color: isDark ? '#d1d5db' : '#374151' },
                            }}
                            theme={theme}
                            empty={analytics.movement.statusPipeline.length === 0}
                        />
                    </div>
                </div>
            )}

            {activeTab === 'attrition' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ChartCard title="Exit Trend Over Time" option={simpleLine(analytics.attrition.exitTrend, isDark)} theme={theme} empty={analytics.attrition.exitTrend.length === 0} />
                    <ChartCard title="Exit Type Mix" option={simplePie(analytics.attrition.exitTypeMix, isDark, true)} theme={theme} empty={analytics.attrition.exitTypeMix.length === 0} />
                    <ChartCard title="Exit Reasons" option={simpleBar(analytics.attrition.exitReasons, isDark, true)} theme={theme} empty={analytics.attrition.exitReasons.length === 0} />
                    <ChartCard title="Attrition by Department" option={simpleBar(analytics.attrition.byDepartment, isDark)} theme={theme} empty={analytics.attrition.byDepartment.length === 0} />
                    <ChartCard title="Attrition by Location" option={simpleBar(analytics.attrition.byLocation, isDark)} theme={theme} empty={analytics.attrition.byLocation.length === 0} />
                    <ChartCard title="Attrition by Manager" option={simpleBar(analytics.attrition.byManager, isDark, true)} theme={theme} empty={analytics.attrition.byManager.length === 0} />
                    <div className="lg:col-span-2">
                        <ChartCard title="Attrition Heatmap (Department vs Location)" option={heatmapOption} theme={theme} empty={analytics.attrition.deptLocationHeatmap.length === 0} height={360} />
                    </div>
                </div>
            )}

            {activeTab === 'employee360' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <label className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Employee</label>
                        <select
                            value={selectedEmployeeId}
                            onChange={(e) => setSelectedEmployeeId(e.target.value)}
                            className={`rounded-lg border px-3 py-2 text-sm ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                        >
                            {analytics.employees.map((employee) => (
                                <option key={employee.id} value={employee.id}>{employee.name}</option>
                            ))}
                        </select>
                    </div>

                    {analytics.employee360 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className={`rounded-2xl border p-4 space-y-2 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                <h3 className={`font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Profile</h3>
                                <p><strong>Name:</strong> {analytics.employee360.name}</p>
                                <p><strong>Designation:</strong> {analytics.employee360.designation}</p>
                                <p><strong>Department:</strong> {analytics.employee360.department}</p>
                                <p><strong>Manager:</strong> {analytics.employee360.manager}</p>
                                <p><strong>Joining Date:</strong> {analytics.employee360.joiningDate}</p>
                                <p><strong>Location:</strong> {analytics.employee360.location}</p>
                            </div>

                            <div className={`rounded-2xl border p-4 lg:col-span-2 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                <h3 className={`font-bold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Timeline</h3>
                                <ul className="space-y-2 text-sm">
                                    {analytics.employee360.timeline.map((event, index) => (
                                        <li key={`${event.month}-${index}`} className={`rounded-lg p-2 ${isDark ? 'bg-gray-700/70' : 'bg-gray-50'}`}>
                                            <span className="font-semibold mr-2">{event.month}</span>
                                            <span>{event.label}</span>
                                        </li>
                                    ))}
                                    {analytics.employee360.timeline.length === 0 && <li>No timeline events available.</li>}
                                </ul>
                            </div>

                            <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                <h3 className={`font-bold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Qualification History</h3>
                                <ul className="text-sm space-y-1">
                                    {analytics.employee360.qualifications.map((qualification) => (
                                        <li key={qualification.field}><strong>{qualification.field}:</strong> {qualification.value}</li>
                                    ))}
                                    {analytics.employee360.qualifications.length === 0 && <li>No qualification history.</li>}
                                </ul>
                            </div>

                            <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                <h3 className={`font-bold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Contact</h3>
                                <ul className="text-sm space-y-1">
                                    {analytics.employee360.contactSummary.primary.map((entry) => (
                                        <li key={entry.label}><strong>{entry.label}:</strong> {entry.value}</li>
                                    ))}
                                    {analytics.employee360.contactSummary.primary.length === 0 && <li>No contact details.</li>}
                                </ul>
                            </div>

                            <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                                <h3 className={`font-bold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Emergency Contact</h3>
                                <ul className="text-sm space-y-1">
                                    {analytics.employee360.contactSummary.emergency.map((entry) => (
                                        <li key={entry.label}><strong>{entry.label}:</strong> {entry.value}</li>
                                    ))}
                                    {analytics.employee360.contactSummary.emergency.length === 0 && <li>No emergency contact.</li>}
                                </ul>
                            </div>
                        </div>
                    ) : (
                        <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>No employee record available for 360 profile.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default HRAnalyticsDashboard;
