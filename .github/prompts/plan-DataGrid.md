You are working on a React + Javascript analytics dashboard (ChillView).

Your task is to implement a **Data Grid / Data Explorer feature** using AG Grid.

IMPORTANT:
👉 You MUST create a **separate reusable component** for the data grid instead of writing everything inline.

---

# 🧩 1. COMPONENT ARCHITECTURE (CRITICAL)

Create the following structure:

```text
/components/data-grid/
  ├── DataGrid.tsx        (main reusable grid component)
  ├── useDataGrid.ts      (logic hook for filtering/editing)
  ├── columnUtils.ts      (column generation + type handling)
```

---

# 🎯 2. MAIN USAGE

In parent component:

```tsx
<DataGrid
  data={data}
  columns={columns}
  onDataChange={setWorkingData}
/>
```

---

# ⚙️ 3. INSTALL AG GRID

```bash
npm install ag-grid-react ag-grid-community
```

---

# 🧠 4. IMPLEMENT DataGrid.tsx

* This component is responsible for:

  * Rendering AG Grid
  * Handling search
  * Handling editing
  * Emitting updated data

```tsx
import { AgGridReact } from 'ag-grid-react';

function DataGrid({ data, columns, onDataChange }) {
  const [workingData, setWorkingData] = useState(data);
  const [quickFilter, setQuickFilter] = useState("");

  const columnDefs = useMemo(() => generateColumnDefs(columns), [columns]);

  return (
    <div className="h-full flex flex-col">

      {/* Search Bar */}
      <input
        placeholder="Search..."
        value={quickFilter}
        onChange={(e) => setQuickFilter(e.target.value)}
        className="mb-2 px-3 py-2 bg-gray-800 text-white rounded"
      />

      {/* Grid */}
      <div className="ag-theme-alpine flex-1">
        <AgGridReact
          rowData={workingData}
          columnDefs={columnDefs}
          quickFilterText={quickFilter}
          defaultColDef={{
            sortable: true,
            filter: true,
            editable: true,
            resizable: true
          }}
          onCellValueChanged={(params) => {
            const updated = updateWorkingData(workingData, params);
            setWorkingData(updated);
            onDataChange(updated);
          }}
        />
      </div>

    </div>
  );
}
```

---

# 🧠 5. COLUMN UTILS (columnUtils.ts)

```ts
export function generateColumnDefs(columns) {
  return columns.map(col => ({
    field: col.name,
    filter: getFilterType(col.type),
    editable: true
  }));
}

function getFilterType(type) {
  if (type === "number") return "agNumberColumnFilter";
  if (type === "date") return "agDateColumnFilter";
  return "agTextColumnFilter";
}
```

---

# 🧠 6. DATA HOOK (useDataGrid.ts)

Encapsulate logic:

```ts
export function useDataGrid(initialData) {
  const [originalData] = useState(initialData);
  const [workingData, setWorkingData] = useState(initialData);

  function updateCell(params) {
    const updated = [...workingData];
    updated[params.rowIndex][params.colDef.field] = params.newValue;
    setWorkingData(updated);
    return updated;
  }

  return {
    originalData,
    workingData,
    setWorkingData,
    updateCell
  };
}
```

---

# 🔍 7. GLOBAL SEARCH

Bind search input to:

```tsx
<AgGridReact quickFilterText={quickFilter} />
```

---

# 🔄 8. CHART INTEGRATION (CRITICAL)

In parent component:

```ts
useEffect(() => {
  updateCharts(workingData);
}, [workingData]);
```

---

# ⚠️ 9. DATA RULES

* originalData = immutable
* workingData = filtered + edited

---

# 🎨 10. UI ENHANCEMENTS

* Add column type indicators:

  * categorical → blue
  * numeric → green
  * date → yellow
* Highlight edited cells
* Highlight filtered columns

---

# ⚡ 11. PERFORMANCE

* Use useMemo for columnDefs
* Avoid unnecessary re-renders
* Support 1000+ rows smoothly

---

# 🧪 12. TEST CASES

* Filtering works correctly
* Editing updates data
* Search filters instantly
* Charts update when data changes

---

# 🚀 FINAL EXPECTATION

* Clean reusable DataGrid component
* Proper separation of concerns
* Scalable architecture
* Smooth UX like Power BI table

---

DO NOT:

* Mix all logic in one file
* Directly mutate original dataset

Ensure modular, reusable, maintainable code.
