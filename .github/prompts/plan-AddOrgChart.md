The system already supports multiple chart types with a role-based configuration system (fields assigned to roles like x, y, hierarchy, value, etc.).
Your task is to add a new visualization type: ORG_CHART, which displays hierarchical reporting relationships (employee → manager).

GOAL
Implement a fully functional Org Chart (Tree Visualization) that:
Shows reporting hierarchy (who reports to whom)
Supports expand/collapse interactions
Handles large datasets gracefully
Integrates with existing field-role system

 1. DEFINE NEW CHART TYPE
Add:
type ChartType =
  | ...
  | "ORG_CHART";


 2. FIELD ROLE REQUIREMENTS
Define roles for org chart:
"node" → Employee identifier (e.g., Employee Name or ID)
"parent" → Manager identifier (Manager ID or Manager Name)
"label" → Optional display field (Designation, Department)
"color" → Optional grouping (Department, Business Unit)
Example config:
{
  chartType: "ORG_CHART",
  assignments: [
    { field: "Employee ID", role: "node" },
    { field: "Manager ID", role: "parent" },
    { field: "Full Name", role: "label" },
    { field: "Department", role: "color" }
  ]
}


 3. BUILD TREE DATA FUNCTION (CRITICAL)
Implement:
function buildOrgTree(data, nodeField, parentField, labelField?)

Steps:
Create a map of all nodes
Link each node to its parent
Detect root nodes (parent = null or missing)
Handle missing parents gracefully
Prevent circular references
Output format:
{
  name: "CEO",
  children: [
    {
      name: "Manager A",
      children: [
        { name: "Employee 1" },
        { name: "Employee 2" }
      ]
    }
  ]
}


EDGE CASE HANDLING
Missing manager → attach to "Unknown"
Self-referencing loops → ignore or break cycle
Multiple roots → wrap under "Organization"

4. ECHARTS TREE CONFIG
Update echartsOptionBuilder:
option = {
  tooltip: {
    trigger: 'item',
    triggerOn: 'mousemove'
  },
  series: [
    {
      type: 'tree',
      data: [treeData],
      top: '5%',
      left: '15%',
      bottom: '5%',
      right: '15%',
      symbolSize: 10,
      orient: 'LR',
      expandAndCollapse: true,
      initialTreeDepth: 2,
      label: {
        position: 'left',
        verticalAlign: 'middle',
        align: 'right'
      },
      leaves: {
        label: {
          position: 'right',
          align: 'left'
        }
      },
      animationDurationUpdate: 750
    }
  ]
};


5. SEARCH FEATURE (IMPORTANT)
Implement:
function searchNode(tree, query)

Highlight matched node
Expand path to that node
Scroll into view (if possible)

6. INTERACTION FEATURES
Click node → expand/collapse
Hover → show tooltip:
Name
Designation
Department
Highlight path to root

7. OPTIONAL ENHANCEMENTS
Color nodes by department
Node size based on team size
Show number of direct reports


8. PERFORMANCE OPTIMIZATION
Limit initial depth (e.g., 2 levels)
Lazy load deeper nodes (if dataset is large)
Memoize tree generation

 9. TEST CASES
Ensure it works for:
Clean hierarchy (CEO → Manager → Employee)
Missing manager values
Multiple roots
Large dataset (1000+ rows)
Cyclic references (should not crash)

10. UI INTEGRATION
Update field panel:
Add roles:
Node
Parent
Label
	Show this roles in the field panel only when the org chart is selected for visualization
Use chip-based UI for assignment

FINAL EXPECTATION
After implementation:
Org chart renders correctly from HR data
Users can explore hierarchy interactively
System handles imperfect real-world data
UX is smooth and scalable
