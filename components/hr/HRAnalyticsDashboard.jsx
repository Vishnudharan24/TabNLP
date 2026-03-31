import React, { useMemo, useState, useRef, useEffect } from 'react';
import { BriefcaseBusiness, AlertTriangle, TrendingUp, Users2, FileText, Presentation } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import { useTheme } from '../../contexts/ThemeContext';
import { recommendCharts } from '../../services/chartRecommender';
import { buildChartOption } from '../../services/echartsOptionBuilder';
import { ChartType } from '../../types';
import HRKpiCards from './HRKpiCards';
import HRFiltersBar from './HRFiltersBar';
import HRChartCard from './HRChartCard';
import {
    processHrDataset,
    formatMonthKey,
    monthLabel,
    average,
    groupCount,
} from './hrDataProcessor';

const sortByValueDesc = (items = []) => [...items].sort((a, b) => b.value - a.value);

const HR_COLOR_PRESETS = {
    vibrant: ['#2563EB', '#7C3AED', '#EA580C', '#16A34A', '#DC2626', '#0D9488'],
    cool: ['#1D4ED8', '#0891B2', '#0EA5E9', '#4338CA', '#7C3AED', '#0F766E'],
    warm: ['#DC2626', '#EA580C', '#D97706', '#CA8A04', '#B45309', '#BE123C'],
    neutral: ['#334155', '#475569', '#64748B', '#94A3B8', '#1F2937', '#0F172A'],
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const hexToRgb = (hex) => {
    const normalized = String(hex || '').replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    };
};

const rgbToHsl = ({ r, g, b }) => {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
        if (max === rn) h = ((gn - bn) / delta) % 6;
        else if (max === gn) h = (bn - rn) / delta + 2;
        else h = (rn - gn) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
    }

    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    return { h, s, l };
};

const hslToHex = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const buildWheelPalette = (baseHex) => {
    const rgb = hexToRgb(baseHex);
    if (!rgb) return HR_COLOR_PRESETS.vibrant;
    const { h, s, l } = rgbToHsl(rgb);
    const offsets = [0, 28, 56, 180, 208, 236];
    return offsets.map((offset, idx) => {
        const hue = (h + offset) % 360;
        const sat = clamp(s + (idx % 2 === 0 ? 0.06 : -0.04), 0.35, 0.9);
        const light = clamp(l + (idx < 3 ? 0.02 : -0.02), 0.35, 0.65);
        return hslToHex(hue, sat, light);
    });
};

const buildBaseGrid = (isDark) => ({
    left: 28,
    right: 18,
    top: 30,
    bottom: 30,
    containLabel: true,
    backgroundColor: 'transparent',
    borderColor: isDark ? '#374151' : '#E5E7EB',
});

const ALL_CHART_TYPES = [
    ChartType.BAR,
    ChartType.LINE,
    ChartType.AREA,
    ChartType.PIE,
    ChartType.DONUT,
    ChartType.SCATTER,
    ChartType.BUBBLE,
    ChartType.HEATMAP,
    ChartType.TREEMAP,
    ChartType.SUNBURST,
    ChartType.COMBO_BAR_LINE,
    ChartType.GAUGE,
    ChartType.RADAR,
    ChartType.KPI_SINGLE,
    ChartType.TABLE,
];
const toLabel = (type) => type.replace(/_/g, ' ');

const getRecommendedChartTypes = ({ columns, dimension, measures = [] }) => {
    const recs = recommendCharts(columns, dimension, measures).map(r => r.type);
    const ordered = [];
    recs.forEach((type) => {
        if (!ordered.includes(type)) ordered.push(type);
    });
    ALL_CHART_TYPES.forEach((type) => {
        if (!ordered.includes(type)) ordered.push(type);
    });
    return ordered;
};

const toMonthSeries = (items, dateAccessor) => {
    const map = new Map();
    items.forEach((item) => {
        const key = formatMonthKey(dateAccessor(item));
        if (!key) return;
        map.set(key, (map.get(key) || 0) + 1);
    });

    const keys = Array.from(map.keys()).sort();
    return {
        labels: keys.map(monthLabel),
        values: keys.map(k => map.get(k)),
        keys,
    };
};

const HRAnalyticsDashboard = ({ datasets, selectedDatasetId, setSelectedDatasetId }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const exportRootRef = useRef(null);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isExportingPpt, setIsExportingPpt] = useState(false);

    const [filters, setFilters] = useState({
        department: '__all__',
        gender: '__all__',
        location: '__all__',
        status: '__all__',
        fromDate: '',
        toDate: '',
        search: '',
    });

    const [chartTypes, setChartTypes] = useState({
        department: ChartType.BAR,
        gender: ChartType.PIE,
        age: ChartType.BAR,
        hiringTrend: ChartType.LINE,
        attritionTrend: ChartType.LINE,
        attritionByDepartment: ChartType.COMBO_BAR_LINE,
        education: ChartType.BAR,
    });

    const [chartStyle, setChartStyle] = useState({
        colorMode: 'multi',
        singleColor: '#2563EB',
        multiColors: [],
        wheelColor: '#2563EB',
    });

    const chartTypeRecommendations = useMemo(() => {
        const departmentColumns = [
            { name: 'Department', type: 'string' },
            { name: 'Employee Count', type: 'number' },
        ];
        const genderColumns = [
            { name: 'Gender', type: 'string' },
            { name: 'Employee Count', type: 'number' },
        ];
        const ageColumns = [
            { name: 'Age Bucket', type: 'string' },
            { name: 'Employee Count', type: 'number' },
        ];
        const hiringColumns = [
            { name: 'Join Month', type: 'date' },
            { name: 'Joined Count', type: 'number' },
        ];
        const attritionTrendColumns = [
            { name: 'Exit Month', type: 'date' },
            { name: 'Exited Count', type: 'number' },
        ];
        const attritionDeptColumns = [
            { name: 'Department', type: 'string' },
            { name: 'Attrition Rate', type: 'number' },
            { name: 'Exited Count', type: 'number' },
        ];
        const educationColumns = [
            { name: 'Education Level', type: 'string' },
            { name: 'Employee Count', type: 'number' },
        ];

        return {
            department: getRecommendedChartTypes({
                columns: departmentColumns,
                dimension: 'Department',
                measures: ['Employee Count'],
            }),
            gender: getRecommendedChartTypes({
                columns: genderColumns,
                dimension: 'Gender',
                measures: ['Employee Count'],
            }),
            age: getRecommendedChartTypes({
                columns: ageColumns,
                dimension: 'Age Bucket',
                measures: ['Employee Count'],
            }),
            hiringTrend: getRecommendedChartTypes({
                columns: hiringColumns,
                dimension: 'Join Month',
                measures: ['Joined Count'],
            }),
            attritionTrend: getRecommendedChartTypes({
                columns: attritionTrendColumns,
                dimension: 'Exit Month',
                measures: ['Exited Count'],
            }),
            attritionByDepartment: getRecommendedChartTypes({
                columns: attritionDeptColumns,
                dimension: 'Department',
                measures: ['Attrition Rate', 'Exited Count'],
            }),
            education: getRecommendedChartTypes({
                columns: educationColumns,
                dimension: 'Education Level',
                measures: ['Employee Count'],
            }),
        };
    }, []);

    useEffect(() => {
        setChartTypes((prev) => {
            const next = { ...prev };
            let changed = false;

            Object.keys(chartTypeRecommendations).forEach((key) => {
                const options = chartTypeRecommendations[key] || ALL_CHART_TYPES;
                if (!options.includes(next[key])) {
                    next[key] = options[0];
                    changed = true;
                }
            });

            return changed ? next : prev;
        });
    }, [chartTypeRecommendations]);

    const selectedDataset = useMemo(
        () => datasets.find(ds => ds.id === selectedDatasetId) || datasets[0] || null,
        [datasets, selectedDatasetId]
    );

    const processed = useMemo(() => processHrDataset(selectedDataset), [selectedDataset]);

    const filteredEmployees = useMemo(() => {
        const fromDate = filters.fromDate ? new Date(`${filters.fromDate}T00:00:00`) : null;
        const toDate = filters.toDate ? new Date(`${filters.toDate}T23:59:59`) : null;
        const q = (filters.search || '').toLowerCase().trim();

        return processed.employees.filter((employee) => {
            if (filters.department !== '__all__' && employee.department !== filters.department) return false;
            if (filters.gender !== '__all__' && employee.gender !== filters.gender) return false;
            if (filters.location !== '__all__' && employee.location !== filters.location) return false;
            if (filters.status !== '__all__' && employee.status !== filters.status) return false;

            if (fromDate || toDate) {
                if (!employee.joiningDate) return false;
                if (fromDate && employee.joiningDate < fromDate) return false;
                if (toDate && employee.joiningDate > toDate) return false;
            }

            if (q) {
                const haystack = [employee.employeeId, employee.fullName, employee.email, employee.department, employee.location]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                if (!haystack.includes(q)) return false;
            }

            return true;
        });
    }, [processed.employees, filters]);

    const metrics = useMemo(() => {
        const totalEmployees = filteredEmployees.length;
        const exitedEmployees = filteredEmployees.filter(e => e.status === 'Exited' || e.resignationDate).length;
        const activeEmployees = filteredEmployees.filter(e => e.status === 'Active' || e.status === 'Probation').length;
        const attritionRate = totalEmployees > 0 ? (exitedEmployees / totalEmployees) * 100 : 0;
        const activeRate = totalEmployees > 0 ? (activeEmployees / totalEmployees) * 100 : 0;
        const avgExperience = average(
            filteredEmployees
                .map(e => e.experienceYears)
                .filter(v => Number.isFinite(v) && v >= 0 && v <= 60)
        );

        return {
            totalEmployees,
            exitedEmployees,
            activeEmployees,
            attritionRate,
            activeRate,
            avgExperience,
        };
    }, [filteredEmployees]);

    const departmentDist = useMemo(() => sortByValueDesc(groupCount(filteredEmployees, e => e.department)), [filteredEmployees]);
    const genderDist = useMemo(() => sortByValueDesc(groupCount(filteredEmployees, e => e.gender)), [filteredEmployees]);
    const educationDist = useMemo(() => sortByValueDesc(groupCount(filteredEmployees, e => e.educationLevel || 'Not Specified')), [filteredEmployees]);

    const ageHistogram = useMemo(() => {
        const bins = [
            { name: '18-24', min: 18, max: 24 },
            { name: '25-34', min: 25, max: 34 },
            { name: '35-44', min: 35, max: 44 },
            { name: '45-54', min: 45, max: 54 },
            { name: '55+', min: 55, max: 200 },
        ];

        const ages = filteredEmployees.map(e => e.age).filter(v => Number.isFinite(v));
        bins.forEach(bin => {
            bin.value = ages.filter(age => age >= bin.min && age <= bin.max).length;
        });

        return bins;
    }, [filteredEmployees]);

    const hiringTrend = useMemo(() => toMonthSeries(filteredEmployees, e => e.joiningDate), [filteredEmployees]);
    const attritionTrend = useMemo(
        () => toMonthSeries(filteredEmployees.filter(e => e.resignationDate), e => e.resignationDate),
        [filteredEmployees]
    );

    const attritionByDepartment = useMemo(() => {
        const all = groupCount(filteredEmployees, e => e.department);
        const exited = groupCount(filteredEmployees.filter(e => e.status === 'Exited' || e.resignationDate), e => e.department);
        const exitedMap = new Map(exited.map(item => [item.name, item.value]));

        return all.map((dept) => {
            const exitedCount = exitedMap.get(dept.name) || 0;
            const rate = dept.value > 0 ? (exitedCount / dept.value) * 100 : 0;
            return {
                name: dept.name,
                employees: dept.value,
                exited: exitedCount,
                rate,
            };
        }).sort((a, b) => b.rate - a.rate);
    }, [filteredEmployees]);

    const salaryVsExperience = useMemo(() => (
        filteredEmployees
            .filter(e => Number.isFinite(e.salary) && Number.isFinite(e.experienceYears))
            .map(e => ({
                value: [Number(e.experienceYears.toFixed(2)), e.salary],
                employeeId: e.employeeId,
                name: e.fullName,
                department: e.department,
                designation: e.designation,
            }))
    ), [filteredEmployees]);

    const highAttritionDepartments = useMemo(() => {
        const overallRate = metrics.attritionRate;
        return attritionByDepartment
            .filter(item => item.employees >= 5 && item.rate > overallRate + 5)
            .slice(0, 5);
    }, [attritionByDepartment, metrics.attritionRate]);

    const anomalies = useMemo(() => {
        const salaryThreshold = processed.salaryP95;
        return filteredEmployees
            .filter((e) => (
                (Number.isFinite(e.experienceYears) && e.experienceYears >= 30)
                || (salaryThreshold && Number.isFinite(e.salary) && e.salary >= salaryThreshold)
            ))
            .slice(0, 10);
    }, [filteredEmployees, processed.salaryP95]);

    const baseChartColors = isDark
        ? ['#60A5FA', '#34D399', '#F59E0B', '#F87171', '#A78BFA', '#22D3EE']
        : ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2'];

    const chartColors = useMemo(() => {
        const mode = chartStyle?.colorMode === 'single' ? 'single' : 'multi';
        const single = typeof chartStyle?.singleColor === 'string' && chartStyle.singleColor.trim()
            ? chartStyle.singleColor.trim()
            : null;
        const multi = Array.isArray(chartStyle?.multiColors)
            ? chartStyle.multiColors.map(c => String(c || '').trim()).filter(Boolean)
            : [];

        if (mode === 'single' && single) return [single];
        if (mode === 'multi' && multi.length > 0) return multi;
        return baseChartColors;
    }, [chartStyle, baseChartColors]);

    const sharedChartStyle = useMemo(() => ({
        colorMode: chartStyle?.colorMode === 'single' ? 'single' : 'multi',
        singleColor: chartStyle?.singleColor || '#2563EB',
        multiColors: Array.isArray(chartStyle?.multiColors) ? chartStyle.multiColors : [],
    }), [chartStyle]);

    const commonAxisStyle = {
        axisLabel: { color: isDark ? '#D1D5DB' : '#4B5563' },
        axisLine: { lineStyle: { color: isDark ? '#4B5563' : '#D1D5DB' } },
        splitLine: { lineStyle: { color: isDark ? '#374151' : '#F3F4F6' } },
    };

    const departmentOption = buildChartOption(
        chartTypes.department,
        departmentDist.map(item => ({ name: item.name, employees: item.value })),
        { dimension: 'Department', measures: ['employees'], title: 'Employee Distribution by Department', style: sharedChartStyle },
        theme,
        'clear',
        'vibrant'
    );

    const genderOption = buildChartOption(
        chartTypes.gender,
        genderDist.map(item => ({ name: item.name, employees: item.value })),
        { dimension: 'Gender', measures: ['employees'], title: 'Gender Distribution', style: sharedChartStyle },
        theme,
        'clear',
        'vibrant'
    );

    const ageOption = buildChartOption(
        chartTypes.age,
        ageHistogram.map(item => ({ name: item.name, employees: item.value })),
        { dimension: 'Age Bucket', measures: ['employees'], title: 'Age Distribution', style: sharedChartStyle },
        theme,
        'clear',
        'vibrant'
    );

    const hiringOption = buildChartOption(
        chartTypes.hiringTrend,
        hiringTrend.labels.map((label, idx) => ({ name: label, joined: hiringTrend.values[idx] || 0 })),
        { dimension: 'Join Month', measures: ['joined'], title: 'Hiring Trend Over Time', style: sharedChartStyle },
        theme,
        'clear',
        'vibrant'
    );

    const attritionTrendOption = buildChartOption(
        chartTypes.attritionTrend,
        attritionTrend.labels.map((label, idx) => ({ name: label, exited: attritionTrend.values[idx] || 0 })),
        { dimension: 'Exit Month', measures: ['exited'], title: 'Attrition Trend Over Time', style: sharedChartStyle },
        theme,
        'clear',
        'vibrant'
    );

    const attritionByDeptOption = buildChartOption(
        chartTypes.attritionByDepartment,
        attritionByDepartment.map(item => ({ name: item.name, rate: Number(item.rate.toFixed(2)), exited: item.exited })),
        { dimension: 'Department', measures: ['rate', 'exited'], title: 'Attrition by Department', style: sharedChartStyle },
        theme,
        'clear',
        'vibrant'
    );

    const scatterOption = {
        color: [chartColors[4]],
        tooltip: {
            trigger: 'item',
            formatter: (param) => {
                const item = param.data;
                return [
                    `<b>${item.name || item.employeeId}</b>`,
                    `Employee ID: ${item.employeeId}`,
                    `Department: ${item.department || 'N/A'}`,
                    `Designation: ${item.designation || 'N/A'}`,
                    `Experience: ${item.value?.[0] ?? 'N/A'} years`,
                    `Salary: ${Number(item.value?.[1] || 0).toLocaleString()}`,
                ].join('<br/>');
            },
        },
        grid: buildBaseGrid(isDark),
        xAxis: { type: 'value', name: 'Experience (Years)', ...commonAxisStyle },
        yAxis: { type: 'value', name: 'Salary', ...commonAxisStyle },
        series: [{
            type: 'scatter',
            symbolSize: (value) => Math.max(8, Math.min(20, (Number(value[1]) || 0) / 100000)),
            data: salaryVsExperience,
            emphasis: { focus: 'series' },
        }],
    };

    const educationOption = buildChartOption(
        chartTypes.education,
        educationDist.map(item => ({ name: item.name, employees: item.value })),
        { dimension: 'Education Level', measures: ['employees'], title: 'Education Level Distribution', style: sharedChartStyle },
        theme,
        'clear',
        'vibrant'
    );

    const handleDepartmentDrill = {
        click: (params) => {
            if (!params?.name) return;
            setFilters(prev => ({
                ...prev,
                department: prev.department === params.name ? '__all__' : params.name,
            }));
        },
    };

    const getFilterSummary = () => {
        const chunks = [];
        if (filters.department !== '__all__') chunks.push(`Department: ${filters.department}`);
        if (filters.gender !== '__all__') chunks.push(`Gender: ${filters.gender}`);
        if (filters.location !== '__all__') chunks.push(`Location: ${filters.location}`);
        if (filters.status !== '__all__') chunks.push(`Status: ${filters.status}`);
        if (filters.fromDate) chunks.push(`Join Date From: ${filters.fromDate}`);
        if (filters.toDate) chunks.push(`Join Date To: ${filters.toDate}`);
        if ((filters.search || '').trim()) chunks.push(`Search: ${filters.search.trim()}`);
        return chunks.length > 0 ? chunks.join(' | ') : 'No filters applied';
    };

    const buildFileSafeName = (baseName, extension) => {
        const cleaned = (baseName || 'hr-analytics')
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/g, '-')
            .replace(/-{2,}/g, '-')
            .replace(/^-+|-+$/g, '');
        return `${cleaned || 'hr-analytics'}.${extension}`;
    };

    const getExportTargets = () => {
        const root = exportRootRef.current;
        if (!root) return [];
        const nodes = root.querySelectorAll('[data-hr-export-card="true"]');
        return Array.from(nodes).map((element) => ({
            element,
            title: element.getAttribute('data-hr-export-title') || 'HR Visual',
        }));
    };

    const captureTargets = async () => {
        const targets = getExportTargets();
        if (targets.length === 0) return [];

        const captures = [];
        for (const target of targets) {
            const canvas = await html2canvas(target.element, {
                scale: 2,
                useCORS: true,
                backgroundColor: isDark ? '#111827' : '#ffffff',
            });

            captures.push({
                title: target.title,
                imageData: canvas.toDataURL('image/png'),
                width: canvas.width,
                height: canvas.height,
            });
        }
        return captures;
    };

    const handleExportPdf = async () => {
        if (isExportingPdf || isExportingPpt) return;

        setIsExportingPdf(true);
        try {
            const captures = await captureTargets();
            if (captures.length === 0) return;

            const generatedAt = new Date().toLocaleString();
            const filterSummary = getFilterSummary();

            const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 28;

            // Cover page with timestamp
            doc.setFontSize(24);
            doc.text('HR Analytics Export', margin, 72);
            doc.setFontSize(13);
            doc.text(`Dataset: ${selectedDataset?._meta?.fileName || selectedDataset?._meta?.metadata?.file_name || selectedDataset?.name || 'N/A'}`, margin, 106);
            doc.text(`Generated: ${generatedAt}`, margin, 128);

            const summaryLines = doc.splitTextToSize(`Filters: ${filterSummary}`, pageWidth - margin * 2);
            doc.text(summaryLines, margin, 154);

            doc.setFontSize(11);
            doc.text(`Included visuals: ${captures.length}`, margin, pageHeight - 36);

            for (const capture of captures) {
                doc.addPage();
                doc.setFontSize(14);
                doc.text(capture.title, margin, margin + 4);

                const maxWidth = pageWidth - margin * 2;
                const maxHeight = pageHeight - margin * 2 - 24;
                const ratio = Math.min(maxWidth / capture.width, maxHeight / capture.height);

                const imgWidth = capture.width * ratio;
                const imgHeight = capture.height * ratio;
                const x = (pageWidth - imgWidth) / 2;
                const y = margin + 24 + (maxHeight - imgHeight) / 2;

                doc.addImage(capture.imageData, 'PNG', x, y, imgWidth, imgHeight);
            }

            doc.save(buildFileSafeName('hr-analytics-dashboard', 'pdf'));
        } catch (error) {
            console.error('Failed to export HR dashboard PDF:', error);
            window.alert('Unable to export HR analytics as PDF right now.');
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handleExportPpt = async () => {
        if (isExportingPpt || isExportingPdf) return;

        setIsExportingPpt(true);
        try {
            const captures = await captureTargets();
            if (captures.length === 0) return;

            const generatedAt = new Date().toLocaleString();
            const filterSummary = getFilterSummary();

            const pptx = new PptxGenJS();
            pptx.layout = 'LAYOUT_WIDE';
            pptx.author = 'ChillView';
            pptx.subject = 'HR Analytics Dashboard Export';
            pptx.title = 'HR Analytics Export';

            // Cover slide with timestamp
            const cover = pptx.addSlide();
            cover.addText('HR Analytics Export', {
                x: 0.5,
                y: 0.5,
                w: 12,
                h: 0.6,
                fontSize: 28,
                bold: true,
                color: isDark ? 'FFFFFF' : '111827',
            });
            cover.addText(`Dataset: ${selectedDataset?._meta?.fileName || selectedDataset?._meta?.metadata?.file_name || selectedDataset?.name || 'N/A'}`, {
                x: 0.5,
                y: 1.3,
                w: 12,
                h: 0.4,
                fontSize: 14,
                color: isDark ? 'D1D5DB' : '374151',
            });
            cover.addText(`Generated: ${generatedAt}`, {
                x: 0.5,
                y: 1.75,
                w: 12,
                h: 0.4,
                fontSize: 14,
                color: isDark ? 'D1D5DB' : '374151',
            });
            cover.addText(`Filters: ${filterSummary}`, {
                x: 0.5,
                y: 2.25,
                w: 12,
                h: 1.2,
                fontSize: 12,
                color: isDark ? 'D1D5DB' : '374151',
                breakLine: true,
            });

            captures.forEach((capture) => {
                const slide = pptx.addSlide();
                slide.addText(capture.title, {
                    x: 0.4,
                    y: 0.2,
                    w: 12.5,
                    h: 0.4,
                    fontSize: 16,
                    bold: true,
                    color: isDark ? 'FFFFFF' : '111827',
                });

                slide.addImage({
                    data: capture.imageData,
                    x: 0.4,
                    y: 0.8,
                    w: 12.5,
                    h: 6.0,
                    sizing: {
                        type: 'contain',
                        x: 0.4,
                        y: 0.8,
                        w: 12.5,
                        h: 6.0,
                    },
                });
            });

            await pptx.writeFile({ fileName: buildFileSafeName('hr-analytics-dashboard', 'pptx') });
        } catch (error) {
            console.error('Failed to export HR dashboard PPT:', error);
            window.alert('Unable to export HR analytics as PPT right now.');
        } finally {
            setIsExportingPpt(false);
        }
    };

    if (!selectedDataset) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className={`max-w-lg text-center rounded-2xl border p-8 ${isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}>
                    <h2 className="text-xl font-bold">No dataset available</h2>
                    <p className="text-sm mt-2">Upload an HR dataset in Data Hub, then open HR Data Visualization.</p>
                </div>
            </div>
        );
    }

    return (
        <div ref={exportRootRef} className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-3 justify-between">
                <div>
                    <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>HR Data Visualization</p>
                    <h1 className={`text-2xl font-black tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>HR Analytics Dashboard</h1>
                </div>
                <div className="min-w-[260px] flex flex-wrap items-end gap-2 justify-end">
                    <button
                        onClick={handleExportPdf}
                        disabled={isExportingPdf || isExportingPpt}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                        <FileText size={15} />
                        {isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}
                    </button>
                    <button
                        onClick={handleExportPpt}
                        disabled={isExportingPpt || isExportingPdf}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                        <Presentation size={15} />
                        {isExportingPpt ? 'Exporting PPT...' : 'Export PPT'}
                    </button>
                    <div className="min-w-[260px]">
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Dataset</label>
                        <select
                            value={selectedDatasetId || selectedDataset.id}
                            onChange={(e) => setSelectedDatasetId(e.target.value)}
                            className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                        >
                            {datasets.map(ds => (
                                <option key={ds.id} value={ds.id}>{ds?._meta?.fileName || ds?._meta?.metadata?.file_name || ds.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <HRFiltersBar
                dimensions={processed.dimensions}
                filters={filters}
                onFiltersChange={setFilters}
                isDark={isDark}
            />

            <div className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Chart Controls</h3>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Recommended via chart recommender</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <label className="space-y-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Color Mode</span>
                        <select
                            value={chartStyle.colorMode || 'multi'}
                            onChange={(e) => setChartStyle(prev => ({ ...prev, colorMode: e.target.value }))}
                            className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                        >
                            <option value="multi">Multi Color</option>
                            <option value="single">Single Color</option>
                        </select>
                    </label>

                    {(chartStyle.colorMode || 'multi') === 'single' ? (
                        <label className="space-y-1 md:col-span-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Chart Color</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={chartStyle.singleColor || '#2563EB'}
                                    onChange={(e) => setChartStyle(prev => ({ ...prev, singleColor: e.target.value }))}
                                    className="h-10 w-12 p-0 border border-gray-300 dark:border-gray-600 rounded"
                                />
                                <input
                                    type="text"
                                    value={chartStyle.singleColor || '#2563EB'}
                                    onChange={(e) => setChartStyle(prev => ({ ...prev, singleColor: e.target.value }))}
                                    className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                                />
                            </div>
                        </label>
                    ) : (
                        <div className="space-y-2 md:col-span-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Multi Color Palette</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={chartStyle.wheelColor || '#2563EB'}
                                    onChange={(e) => setChartStyle(prev => ({
                                        ...prev,
                                        wheelColor: e.target.value,
                                        multiColors: buildWheelPalette(e.target.value),
                                    }))}
                                    className="h-9 w-11 p-0 border border-gray-300 dark:border-gray-600 rounded"
                                />
                                <button
                                    onClick={() => setChartStyle(prev => ({
                                        ...prev,
                                        multiColors: buildWheelPalette(prev.wheelColor || '#2563EB'),
                                    }))}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border ${isDark ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-700'}`}
                                >
                                    Apply Color Wheel
                                </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                {Object.entries(HR_COLOR_PRESETS).map(([name, palette]) => (
                                    <button
                                        key={name}
                                        onClick={() => setChartStyle(prev => ({ ...prev, multiColors: palette }))}
                                        className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border ${isDark ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-700'}`}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={Array.isArray(chartStyle.multiColors) ? chartStyle.multiColors.join(', ') : ''}
                                onChange={(e) => setChartStyle(prev => ({ ...prev, multiColors: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                                placeholder="#2563EB, #7C3AED, #16A34A"
                                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                            />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <label className="space-y-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Department Dist.</span>
                        <select value={chartTypes.department} onChange={(e) => setChartTypes(prev => ({ ...prev, department: e.target.value }))} className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}>
                            {(chartTypeRecommendations.department || ALL_CHART_TYPES).map((option, idx) => (
                                <option key={option} value={option}>{`${toLabel(option)}${idx === 0 ? ' (Recommended)' : ''}`}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Gender Dist.</span>
                        <select value={chartTypes.gender} onChange={(e) => setChartTypes(prev => ({ ...prev, gender: e.target.value }))} className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}>
                            {(chartTypeRecommendations.gender || ALL_CHART_TYPES).map((option, idx) => (
                                <option key={option} value={option}>{`${toLabel(option)}${idx === 0 ? ' (Recommended)' : ''}`}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Age Dist.</span>
                        <select value={chartTypes.age} onChange={(e) => setChartTypes(prev => ({ ...prev, age: e.target.value }))} className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}>
                            {(chartTypeRecommendations.age || ALL_CHART_TYPES).map((option, idx) => (
                                <option key={option} value={option}>{`${toLabel(option)}${idx === 0 ? ' (Recommended)' : ''}`}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Hiring Trend</span>
                        <select value={chartTypes.hiringTrend} onChange={(e) => setChartTypes(prev => ({ ...prev, hiringTrend: e.target.value }))} className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}>
                            {(chartTypeRecommendations.hiringTrend || ALL_CHART_TYPES).map((option, idx) => (
                                <option key={option} value={option}>{`${toLabel(option)}${idx === 0 ? ' (Recommended)' : ''}`}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Attrition Trend</span>
                        <select value={chartTypes.attritionTrend} onChange={(e) => setChartTypes(prev => ({ ...prev, attritionTrend: e.target.value }))} className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}>
                            {(chartTypeRecommendations.attritionTrend || ALL_CHART_TYPES).map((option, idx) => (
                                <option key={option} value={option}>{`${toLabel(option)}${idx === 0 ? ' (Recommended)' : ''}`}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Attrition by Dept.</span>
                        <select value={chartTypes.attritionByDepartment} onChange={(e) => setChartTypes(prev => ({ ...prev, attritionByDepartment: e.target.value }))} className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}>
                            {(chartTypeRecommendations.attritionByDepartment || ALL_CHART_TYPES).map((option, idx) => (
                                <option key={option} value={option}>{`${toLabel(option)}${idx === 0 ? ' (Recommended)' : ''}`}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Education Dist.</span>
                        <select value={chartTypes.education} onChange={(e) => setChartTypes(prev => ({ ...prev, education: e.target.value }))} className={`w-full px-3 py-2 rounded-xl text-sm border focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}>
                            {(chartTypeRecommendations.education || ALL_CHART_TYPES).map((option, idx) => (
                                <option key={option} value={option}>{`${toLabel(option)}${idx === 0 ? ' (Recommended)' : ''}`}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div data-hr-export-card="true" data-hr-export-title="HR KPI Overview">
                <HRKpiCards metrics={metrics} isDark={isDark} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div data-hr-export-card="true" data-hr-export-title="Employee Distribution by Department">
                    <HRChartCard
                        title="Employee Distribution by Department"
                        subtitle="Click a department bar to drill into that department"
                        option={departmentOption}
                        onEvents={handleDepartmentDrill}
                        isDark={isDark}
                    />
                </div>
                <div data-hr-export-card="true" data-hr-export-title="Gender Distribution">
                    <HRChartCard
                        title="Gender Distribution"
                        subtitle="Diversity split of filtered employees"
                        option={genderOption}
                        isDark={isDark}
                    />
                </div>
                <div data-hr-export-card="true" data-hr-export-title="Age Distribution">
                    <HRChartCard
                        title="Age Distribution"
                        subtitle="Histogram bucketed by age group"
                        option={ageOption}
                        isDark={isDark}
                    />
                </div>
                <div data-hr-export-card="true" data-hr-export-title="Hiring Trend Over Time">
                    <HRChartCard
                        title="Hiring Trend Over Time"
                        subtitle="Monthly joiner count"
                        option={hiringOption}
                        isDark={isDark}
                    />
                </div>
                <div data-hr-export-card="true" data-hr-export-title="Attrition Trend Over Time">
                    <HRChartCard
                        title="Attrition Trend Over Time"
                        subtitle="Monthly employee exits"
                        option={attritionTrendOption}
                        isDark={isDark}
                    />
                </div>
                <div data-hr-export-card="true" data-hr-export-title="Attrition by Department">
                    <HRChartCard
                        title="Attrition by Department"
                        subtitle="Attrition rate and exit volume by department"
                        option={attritionByDeptOption}
                        onEvents={handleDepartmentDrill}
                        isDark={isDark}
                    />
                </div>
                <div data-hr-export-card="true" data-hr-export-title="Salary vs Experience">
                    <HRChartCard
                        title="Salary vs Experience"
                        subtitle="Scatter view to spot salary outliers"
                        option={scatterOption}
                        isDark={isDark}
                        height={330}
                    />
                </div>
                <div data-hr-export-card="true" data-hr-export-title="Education Level Distribution">
                    <HRChartCard
                        title="Education Level Distribution"
                        subtitle="Highest qualification mix"
                        option={educationOption}
                        isDark={isDark}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div data-hr-export-card="true" data-hr-export-title="Attrition Insights" className={`rounded-2xl border p-5 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp size={16} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                        <h3 className={`text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Attrition Insights</h3>
                    </div>
                    {highAttritionDepartments.length === 0 ? (
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No high-risk department found under current filters.</p>
                    ) : (
                        <ul className="space-y-2">
                            {highAttritionDepartments.map(item => (
                                <li key={item.name} className={`rounded-xl p-3 border ${isDark ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
                                    <p className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>{item.name}</p>
                                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Attrition {item.rate.toFixed(1)}% ({item.exited}/{item.employees}) — above dashboard average of {metrics.attritionRate.toFixed(1)}%
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div data-hr-export-card="true" data-hr-export-title="Anomaly Highlights" className={`rounded-2xl border p-5 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle size={16} className={isDark ? 'text-amber-400' : 'text-amber-600'} />
                        <h3 className={`text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Anomaly Highlights</h3>
                    </div>
                    {anomalies.length === 0 ? (
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No anomalies detected for salary/experience under current filters.</p>
                    ) : (
                        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                            {anomalies.map(employee => (
                                <div key={employee.employeeId} className={`rounded-xl p-3 border ${isDark ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>{employee.fullName}</p>
                                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {employee.employeeId} • {employee.department} • {employee.designation || 'Role N/A'}
                                            </p>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                                            anomaly
                                        </span>
                                    </div>
                                    <p className={`text-xs mt-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                        Experience: {Number(employee.experienceYears || 0).toFixed(1)} yrs · Salary: {Number(employee.salary || 0).toLocaleString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div data-hr-export-card="true" data-hr-export-title="Filtered Employee Snapshot" className={`rounded-2xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}>
                <div className="flex items-center gap-2 mb-2">
                    <Users2 size={15} />
                    <span className="text-sm font-semibold">Filtered Employee Snapshot</span>
                </div>
                <p className="text-xs">
                    Showing {filteredEmployees.length.toLocaleString()} records from {processed.employees.length.toLocaleString()} employees.
                    Department drill filter is {filters.department === '__all__' ? 'off' : `set to ${filters.department}`}.
                </p>
            </div>
        </div>
    );
};

export default HRAnalyticsDashboard;
