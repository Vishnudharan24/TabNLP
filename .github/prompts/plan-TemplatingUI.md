Create a React (JavaScript, not TypeScript) component for a Data Visualization application called "Chillview".

I need a complete Template System with the following features:

1. Template Selection Page:
- Display multiple analytics templates as cards (HR, Sales, Finance, Payroll, Lead Generation)
- Each card should show:
  - Template name
  - Short description
  - "Use Template" button
- Use a clean modern UI (cards, grid layout)
- Use Tailwind CSS or simple CSS

2. Template Mapping Page:
- After selecting a template, navigate to a mapping screen
- Left side: Template required fields (e.g., Employee_ID, Salary, Department)
- Right side: Uploaded dataset columns (passed as props)
- Provide dropdown/select input to map dataset columns to template fields
- Show validation:
  - Missing fields warning
  - Type mismatch warning
- Add "Generate Dashboard" button

3. Template JSON Structure:
- Define templates in a separate JS file like:
  {
    id: "hr",
    name: "HR Analytics",
    requiredFields: [
      { name: "Employee_ID", type: "string" },
      { name: "Salary", type: "number" }
    ],
    charts: [
      { type: "bar", x: "Department", y: "Salary" }
    ]
  }

4. Auto Mapping Logic:
- Try to auto-match dataset columns with template fields
- Use simple string matching (case insensitive, partial match)
- Pre-fill dropdowns with suggested matches

5. Navigation:
- Use React Router
- Routes:
  - /templates → Template list
  - /templates/:id/map → Mapping page

6. Code Requirements:
- Use functional components with hooks
- Keep code modular (TemplateList, TemplateCard, TemplateMapping)
- No TypeScript
- Clean and readable structure

7. Extra:
- Add basic styling (cards, buttons, spacing)
- Show loading or empty state if no data is available

Output:
- Full working React components
- Sample template data
- Basic routing setup