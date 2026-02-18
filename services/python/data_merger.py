"""
Data Merger Service (Python equivalent of dataMerger.js)
========================================================
Provides join and union (append) operations between two datasets.

This is the Python translation of the SQL-style join logic.
Each row is a dict (same as a JS plain object).

JS Concept → Python Concept reference:
  - export function         → def
  - const map = new Map()   → dict or defaultdict
  - array.forEach(fn)       → for loop
  - map.has(key)            → key in dict
  - map.get(key)            → dict[key] / dict.get(key)
  - map.set(key, val)       → dict[key] = val
  - new Set()               → set()
  - row[key] ?? null        → row.get(key)  (returns None if missing)
  - [...array1, ...array2]  → [*list1, *list2]  (spread → unpack)
  - array.map(fn)           → [fn(x) for x in array]  (list comprehension)
"""

from dataclasses import dataclass, field
from typing import Optional, Literal
from collections import defaultdict


# ─── Types ────────────────────────────────────────────────────────────────

@dataclass
class ColumnSchema:
    """One column's metadata. Mirrors JS ColumnSchema."""
    name: str
    type: str  # 'string' | 'number' | 'date' | 'boolean'


# Python 3.8+ Literal type is the equivalent of JS's union string type:
#   JoinType = 'inner' | 'left' | 'right' | 'full' | 'append'
JoinType = Literal["inner", "left", "right", "full", "append"]


@dataclass
class MergeResult:
    """Return type of merge_datasets."""
    data: list[dict]
    columns: list[ColumnSchema]


@dataclass
class JoinSuggestion:
    """One suggested join key pair."""
    left_key: str
    right_key: str
    confidence: int  # 0–100


# ─── Helper Functions ─────────────────────────────────────────────────────

def _normalize_key(value) -> str:
    """
    Convert any value to a consistent string for matching.

    JS version:
        function normalizeKey(val) {
            if (val === null || val === undefined) return '__NULL__';
            return String(val).trim().toLowerCase();
        }

    Python version uses the same logic:
        None  → '__NULL__'
        other → stripped lowercase string
    """
    if value is None:
        return "__NULL__"
    return str(value).strip().lower()


def _build_merged_row(
    left_row: Optional[dict],
    right_row: Optional[dict],
    left_cols: list[ColumnSchema],
    renamed_right_cols: list[dict],
) -> dict:
    """
    Combine one left row + one right row into a single merged row.

    JS version:
        function buildMergedRow(leftRow, rightRow, leftCols, renamedRightCols) {
            const row = {};
            leftCols.forEach(c => {
                row[c.name] = leftRow ? leftRow[c.name] ?? null : null;
            });
            renamedRightCols.forEach(c => {
                const sourceKey = c.originalName || c.name;
                row[c.name] = rightRow ? rightRow[sourceKey] ?? null : null;
            });
            return row;
        }

    Python equivalent:
        - dict.get(key) returns None if key is missing (like ?? null)
        - We iterate with for loops instead of .forEach()
    """
    row = {}

    # Fill left columns
    for col in left_cols:
        # JS: leftRow ? leftRow[c.name] ?? null : null
        # Py: left_row.get(col.name) if left_row else None
        row[col.name] = left_row.get(col.name) if left_row else None

    # Fill right columns (using original name to read, new name to write)
    for col_info in renamed_right_cols:
        source_key = col_info.get("original_name") or col_info["name"]
        row[col_info["name"]] = right_row.get(source_key) if right_row else None

    return row


def _append_datasets(
    left_data: list[dict],
    right_data: list[dict],
    left_columns: list[ColumnSchema],
    right_columns: list[ColumnSchema],
) -> MergeResult:
    """
    Union/append: stack all rows from both datasets vertically.
    Columns are the union of both column lists.

    JS used a Map to deduplicate columns by name.
    Python uses a dict (insertion-ordered since 3.7).
    """
    # Build unified column list (left columns first, then new ones from right)
    col_map: dict[str, ColumnSchema] = {}
    for c in left_columns:
        col_map[c.name] = c
    for c in right_columns:
        if c.name not in col_map:
            col_map[c.name] = c

    merged_columns = list(col_map.values())
    all_col_names = [c.name for c in merged_columns]

    def normalize_row(row: dict) -> dict:
        """Ensure every row has all columns (fill missing with None)."""
        return {name: row.get(name) for name in all_col_names}

    # JS:  [...leftData.map(normalize), ...rightData.map(normalize)]
    # Py:  [*[normalize(r) for r in left], *[normalize(r) for r in right]]
    merged_data = [
        *[normalize_row(r) for r in left_data],
        *[normalize_row(r) for r in right_data],
    ]

    return MergeResult(data=merged_data, columns=merged_columns)


# ─── Main Merge Function ─────────────────────────────────────────────────

def merge_datasets(
    left_data: list[dict],
    right_data: list[dict],
    left_columns: list[ColumnSchema],
    right_columns: list[ColumnSchema],
    left_key: str,
    right_key: str,
    join_type: JoinType,
) -> MergeResult:
    """
    Merge two datasets using the specified join strategy.

    Parameters
    ----------
    left_data : list[dict]
        Row array from the left dataset. Each row is a dict.
    right_data : list[dict]
        Row array from the right dataset.
    left_columns, right_columns : list[ColumnSchema]
        Column metadata for each dataset.
    left_key, right_key : str
        Column names used as join keys.
    join_type : 'inner' | 'left' | 'right' | 'full' | 'append'

    Returns
    -------
    MergeResult
        Contains .data (list of merged row dicts) and .columns.

    JS equivalent
    -------------
    export function mergeDatasets({ leftData, rightData, ... }) { ... }

    Key differences from JS:
      - JS used `new Map()` for the lookup → Python uses `defaultdict(list)`
      - JS used `new Set()` for tracking used keys → Python uses `set()`
      - JS used `.forEach()` → Python uses `for` loops
    """

    # Handle append (union) separately
    if join_type == "append":
        return _append_datasets(left_data, right_data, left_columns, right_columns)

    # ── Build a lookup map for the right dataset ──────────────────────
    # JS:
    #   const rightMap = new Map();
    #   rightData.forEach(row => {
    #       const key = normalizeKey(row[rightKey]);
    #       if (!rightMap.has(key)) rightMap.set(key, []);
    #       rightMap.get(key).push(row);
    #   });
    #
    # Python: defaultdict(list) auto-creates empty lists for new keys
    right_map: dict[str, list[dict]] = defaultdict(list)
    for row in right_data:
        key = _normalize_key(row.get(right_key))
        right_map[key].append(row)

    # ── Disambiguate overlapping column names ─────────────────────────
    # Filter out the join key from right columns (avoid duplicate)
    right_cols_filtered = [c for c in right_columns if c.name != right_key]

    left_col_names = {c.name for c in left_columns}  # set for O(1) lookup

    # Rename collisions: e.g. if both have "salary", right becomes "salary_right"
    renamed_right_cols = []
    for c in right_cols_filtered:
        if c.name in left_col_names:
            renamed_right_cols.append({
                "name": f"{c.name}_right",
                "original_name": c.name,
                "type": c.type,
            })
        else:
            renamed_right_cols.append({
                "name": c.name,
                "original_name": c.name,
                "type": c.type,
            })

    merged_columns = [
        *left_columns,
        *[ColumnSchema(name=rc["name"], type=rc["type"]) for rc in renamed_right_cols],
    ]

    merged_data: list[dict] = []
    used_right_keys: set[str] = set()

    # ── Walk left rows ────────────────────────────────────────────────
    for left_row in left_data:
        key = _normalize_key(left_row.get(left_key))
        matches = right_map.get(key)

        if matches:
            used_right_keys.add(key)
            for right_row in matches:
                merged_data.append(
                    _build_merged_row(left_row, right_row, left_columns, renamed_right_cols)
                )
        elif join_type in ("left", "full"):
            # Left/full join: keep unmatched left rows with None for right cols
            merged_data.append(
                _build_merged_row(left_row, None, left_columns, renamed_right_cols)
            )
        # inner join: skip unmatched lefts (do nothing)

    # ── Handle right/full: add unmatched right rows ───────────────────
    if join_type in ("right", "full"):
        for right_row in right_data:
            key = _normalize_key(right_row.get(right_key))
            if key not in used_right_keys:
                merged_data.append(
                    _build_merged_row(None, right_row, left_columns, renamed_right_cols)
                )

    return MergeResult(data=merged_data, columns=merged_columns)


# ─── Join Key Suggestion ──────────────────────────────────────────────────

def suggest_join_keys(
    left_cols: list[ColumnSchema],
    right_cols: list[ColumnSchema],
) -> list[JoinSuggestion]:
    """
    Auto-suggest possible join keys between two datasets by matching column names.

    JS version used nested .forEach() loops + regex .replace().
    Python version uses nested for-loops + str.replace() chains.

    Returns
    -------
    list[JoinSuggestion]
        Sorted by confidence (highest first).
    """
    suggestions: list[JoinSuggestion] = []

    for lc in left_cols:
        for rc in right_cols:
            # Normalize names for comparison
            # JS:  const ln = lc.name.toLowerCase().replace(/[_\\s-]/g, '');
            # Py:  str.lower() + chained .replace() calls
            ln = lc.name.lower().replace("_", "").replace(" ", "").replace("-", "")
            rn = rc.name.lower().replace("_", "").replace(" ", "").replace("-", "")

            if ln == rn:
                # Exact name match (after normalization)
                suggestions.append(JoinSuggestion(lc.name, rc.name, confidence=100))

            elif ln in rn or rn in ln:
                # One contains the other (e.g. "customer_id" vs "id")
                suggestions.append(JoinSuggestion(lc.name, rc.name, confidence=60))

            elif lc.type == rc.type and ln[:3] == rn[:3] and len(ln) > 3:
                # Same type + similar prefix (Levenshtein-light)
                suggestions.append(JoinSuggestion(lc.name, rc.name, confidence=30))

    # JS:  return suggestions.sort((a, b) => b.confidence - a.confidence);
    # Py:  sorted with reverse=True
    return sorted(suggestions, key=lambda s: s.confidence, reverse=True)


# ─── Example Usage ────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Two small datasets
    employees = [
        {"id": "1", "name": "Alice", "dept": "Engineering", "salary": 120000},
        {"id": "2", "name": "Bob", "dept": "Sales", "salary": 85000},
        {"id": "3", "name": "Charlie", "dept": "Marketing", "salary": 92000},
    ]
    emp_cols = [
        ColumnSchema("id", "string"),
        ColumnSchema("name", "string"),
        ColumnSchema("dept", "string"),
        ColumnSchema("salary", "number"),
    ]

    reviews = [
        {"employee_id": "1", "rating": 4.8, "year": 2025},
        {"employee_id": "2", "rating": 3.9, "year": 2025},
        {"employee_id": "4", "rating": 4.5, "year": 2025},  # no match in left
    ]
    rev_cols = [
        ColumnSchema("employee_id", "string"),
        ColumnSchema("rating", "number"),
        ColumnSchema("year", "number"),
    ]

    # Test inner join
    result = merge_datasets(
        left_data=employees,
        right_data=reviews,
        left_columns=emp_cols,
        right_columns=rev_cols,
        left_key="id",
        right_key="employee_id",
        join_type="inner",
    )

    print("═" * 60)
    print("  INNER JOIN: employees × reviews (on id = employee_id)")
    print("═" * 60)
    for row in result.data:
        print(f"  {row}")
    print(f"\n  Columns: {[c.name for c in result.columns]}")

    # Test left join
    result2 = merge_datasets(
        left_data=employees,
        right_data=reviews,
        left_columns=emp_cols,
        right_columns=rev_cols,
        left_key="id",
        right_key="employee_id",
        join_type="left",
    )

    print()
    print("═" * 60)
    print("  LEFT JOIN: employees × reviews")
    print("═" * 60)
    for row in result2.data:
        print(f"  {row}")

    # Test key suggestion
    print()
    print("═" * 60)
    print("  JOIN KEY SUGGESTIONS")
    print("═" * 60)
    suggestions = suggest_join_keys(emp_cols, rev_cols)
    for s in suggestions:
        print(f"  {s.left_key} ↔ {s.right_key}  (confidence: {s.confidence})")
