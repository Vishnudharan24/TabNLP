
Now I need to implement a complete HR Analytics Engine with API + frontend integration.

----------------------------------------
🔷 BACKEND REQUIREMENTS (  / fastapi)
----------------------------------------

Create REST APIs for HR analytics based on mapped dataset fields.

Input:
- Dataset (array of objects)
- Field mapping (template field → dataset column)

Example:
{
  "Employee_ID": "EmpID",
  "Department": "Dept",
  "Date_of_Joining": "DOJ",
  "Date_of_Resignation": "DOR"
}

----------------------------------------
🔹 Implement APIs for the following 14 analytics modules:

1. Workforce Overview
- totalEmployees
- active vs inactive
- headcount by department, business unit, location
- gender ratio
- marital status distribution

2. Employee Demographics
- age distribution (from DOB)
- gender diversity by department
- nationality distribution
- location distribution

3. Hiring Trends
- monthly hiring trend
- yearly hiring trend
- hiring by department/location

4. Attrition Analysis
- attrition rate
- voluntary vs involuntary exits
- exits by department
- exits by manager
- top exit reasons
- attrition by experience

5. Experience Analysis
- avg experience
- experience distribution
- senior vs junior ratio

6. Organizational Structure
- manager-wise team size
- span of control
- hierarchy structure (tree format)

7. Payroll Analysis
- payment mode distribution
- bank distribution

8. Education Analysis
- qualification distribution
- specialization distribution

9. Location & Mobility
- transfers
- location distribution

10. Department Analysis
- headcount per department
- attrition per department

11. Lifecycle Analysis
- probation success rate
- early attrition
- lifecycle duration

12. Compliance Tracking
- missing PAN, Aadhar, PF, etc.

13. Contact Analysis
- missing emergency contact
- relationship distribution

14. Data Quality Analysis
- null counts per column
- duplicate employees
- completeness %

----------------------------------------
🔹 API Design:

Create endpoints:

POST /api/hr/analytics/summary
POST /api/hr/analytics/demographics
POST /api/hr/analytics/hiring
POST /api/hr/analytics/attrition
POST /api/hr/analytics/experience
POST /api/hr/analytics/org
POST /api/hr/analytics/payroll
POST /api/hr/analytics/education
POST /api/hr/analytics/location
POST /api/hr/analytics/department
POST /api/hr/analytics/lifecycle
POST /api/hr/analytics/compliance
POST /api/hr/analytics/contact
POST /api/hr/analytics/data-quality

Each API:
- Accept dataset + mapping
- Return aggregated JSON ready for charts

----------------------------------------
🔷 FRONTEND REQUIREMENTS (React JS)
----------------------------------------

1. Update Template Mapping System:
- After mapping fields, store mapping in state
- Pass mapping + dataset to API

2. use hr analytics in templates:
- Call all APIs
- Store results in state
- Render using ECharts

3. Dashboard Layout:

KPI Cards:
- Total Employees
- Active Employees
- Attrition Rate
- Avg Experience

Charts:
- Bar → Department Distribution
- Pie → Gender Distribution
- Histogram → Age Distribution
- Line → Hiring Trend
- Bar → Attrition by Department
- Tree → Org Chart

4. API Integration:

Example:
const res = await fetch("/api/hr/analytics/summary", {
  method: "POST",
  body: JSON.stringify({ data, mapping })
});

5. Routing:

/templates → select template  
/templates/hr/map → field mapping  
/templates/hr/dashboard → HR dashboard  

----------------------------------------
🔷 CODE REQUIREMENTS
----------------------------------------

- Use JavaScript (no TypeScript)
- Use the existing fastapi for backend
- Use React functional components
- Modular code (backend/services folder for analytics)
- Clean and scalable structure

----------------------------------------
🔷 EXTRA (IMPORTANT)
----------------------------------------

- Add validation:
  - Missing fields warning
  - Incorrect data type warning

- Add loading states in UI
- Optimize API (avoid recomputation if possible)

----------------------------------------
OUTPUT:
----------------------------------------

- Backend fastapi API code
- Analytics functions
- React components for dashboard
- API integration code
- Routing setup