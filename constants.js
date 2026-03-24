
import { ChartType } from './types';

export const MOCK_EMPLOYEES = [
    { id: '1', name: 'Alice Chen', department: 'Engineering', salary: 125000, rating: 4.8, tenure: 5.2, satisfaction: 92, gender: 'F' },
    { id: '2', name: 'Bob Smith', department: 'Sales', salary: 85000, rating: 3.9, tenure: 2.1, satisfaction: 78, gender: 'M' },
    { id: '3', name: 'Charlie Davis', department: 'Marketing', salary: 92000, rating: 4.2, tenure: 3.5, satisfaction: 85, gender: 'NB' },
    { id: '4', name: 'Diana Prince', department: 'Engineering', salary: 140000, rating: 4.9, tenure: 6.8, satisfaction: 95, gender: 'F' },
    { id: '5', name: 'Evan Wright', department: 'Operations', salary: 78000, rating: 4.5, tenure: 4.1, satisfaction: 88, gender: 'M' },
    { id: '6', name: 'Fiona G', department: 'Engineering', salary: 110000, rating: 3.5, tenure: 1.2, satisfaction: 72, gender: 'F' },
    { id: '7', name: 'George K', department: 'Sales', salary: 95000, rating: 4.1, tenure: 4.8, satisfaction: 81, gender: 'M' },
    { id: '8', name: 'Hannah L', department: 'Marketing', salary: 88000, rating: 3.8, tenure: 2.5, satisfaction: 76, gender: 'F' },
    { id: '9', name: 'Ian M', department: 'Engineering', salary: 132000, rating: 4.6, tenure: 5.5, satisfaction: 90, gender: 'M' },
    { id: '10', name: 'Jane O', department: 'Sales', salary: 82000, rating: 4.0, tenure: 3.2, satisfaction: 84, gender: 'F' },
];

export const INITIAL_CHARTS = [
    {
        id: 'viz-1',
        pageId: 'page-1',
        title: 'Comp & Tenure by Dept',
        type: ChartType.BAR,
        datasetId: 'sample-employee-data',
        dimension: 'department',
        measures: ['salary', 'tenure'],
        aggregation: 'AVG',
        layout: { x: 0, y: 0, w: 6, h: 8 },
        filters: []
    },
    {
        id: 'viz-2',
        pageId: 'page-1',
        title: 'Demographics',
        type: ChartType.PIE,
        datasetId: 'sample-employee-data',
        dimension: 'gender',
        measures: ['salary'],
        aggregation: 'COUNT',
        layout: { x: 6, y: 0, w: 6, h: 8 },
        filters: []
    }
];

export const CHART_COLORS = [
    '#2563EB', '#1D4ED8', '#3B82F6', '#60A5FA', '#1E293B',
    '#334155', '#475569', '#22C55E', '#16A34A', '#86EFAC',
];

export const CHART_COLORS_DARK = [
    '#60A5FA', '#34D399', '#F87171', '#FBBF24', '#A78BFA',
    '#22D3EE', '#F472B6', '#2DD4BF', '#FB923C', '#818CF8',
];

export const CHART_COLORS_NEUTRAL = [
    '#334155', '#475569', '#64748b', '#94a3b8', '#0f766e',
    '#0369a1', '#52525b', '#0f172a', '#4b5563', '#1f2937',
];

export const CHART_COLORS_DARK_NEUTRAL = [
    '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#99f6e4',
    '#bae6fd', '#d4d4d8', '#e2e8f0', '#c7d2fe', '#f1f5f9',
];
