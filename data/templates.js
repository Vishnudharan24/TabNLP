export const ANALYTICS_TEMPLATES = [
    {
        id: 'hr',
        name: 'HR Analytics',
        description: 'Track employee performance, compensation, and department-level insights.',
        requiredFields: [
            { name: 'Employee_ID', type: 'string' },
            { name: 'Employee_Name', type: 'string' },
            { name: 'Department', type: 'string' },
            { name: 'Salary', type: 'number' },
            { name: 'Hire_Date', type: 'date' },
        ],
        charts: [
            { type: 'bar', x: 'Department', y: 'Salary' },
            { type: 'line', x: 'Hire_Date', y: 'Employee_ID' },
        ],
    },
    {
        id: 'sales',
        name: 'Sales Analytics',
        description: 'Analyze revenue trends, product sales, and region-wise performance.',
        requiredFields: [
            { name: 'Order_ID', type: 'string' },
            { name: 'Order_Date', type: 'date' },
            { name: 'Region', type: 'string' },
            { name: 'Revenue', type: 'number' },
            { name: 'Product', type: 'string' },
        ],
        charts: [
            { type: 'line', x: 'Order_Date', y: 'Revenue' },
            { type: 'bar', x: 'Region', y: 'Revenue' },
        ],
    },
    {
        id: 'finance',
        name: 'Finance Dashboard',
        description: 'Monitor budgets, spend categories, and month-over-month financial KPIs.',
        requiredFields: [
            { name: 'Transaction_ID', type: 'string' },
            { name: 'Transaction_Date', type: 'date' },
            { name: 'Category', type: 'string' },
            { name: 'Amount', type: 'number' },
            { name: 'Cost_Center', type: 'string' },
        ],
        charts: [
            { type: 'bar', x: 'Category', y: 'Amount' },
            { type: 'line', x: 'Transaction_Date', y: 'Amount' },
        ],
    },
    {
        id: 'payroll',
        name: 'Payroll Insights',
        description: 'Review payroll runs, deductions, and payout distribution across teams.',
        requiredFields: [
            { name: 'Employee_ID', type: 'string' },
            { name: 'Pay_Period', type: 'date' },
            { name: 'Gross_Pay', type: 'number' },
            { name: 'Deductions', type: 'number' },
            { name: 'Net_Pay', type: 'number' },
        ],
        charts: [
            { type: 'line', x: 'Pay_Period', y: 'Net_Pay' },
            { type: 'bar', x: 'Employee_ID', y: 'Gross_Pay' },
        ],
    },
    {
        id: 'lead-generation',
        name: 'Lead Generation',
        description: 'Track lead funnel conversion, source quality, and campaign pipeline.',
        requiredFields: [
            { name: 'Lead_ID', type: 'string' },
            { name: 'Created_Date', type: 'date' },
            { name: 'Source', type: 'string' },
            { name: 'Stage', type: 'string' },
            { name: 'Expected_Value', type: 'number' },
        ],
        charts: [
            { type: 'bar', x: 'Source', y: 'Lead_ID' },
            { type: 'line', x: 'Created_Date', y: 'Expected_Value' },
        ],
    },
];
