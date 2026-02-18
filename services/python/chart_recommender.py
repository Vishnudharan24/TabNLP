"""
Chart Recommender Service (Python equivalent of chartRecommender.js)
===================================================================
Analyzes dataset columns and recommends the most suitable chart types.

This is a standalone Python version of the JS service for learning,
scripting, or plugging into a future FastAPI/Flask backend.

JS Concept → Python Concept reference:
  - export function   → def (regular function)
  - const / let       → plain variables (Python has no const)
  - arrow function    → lambda or def
  - .filter()         → list comprehension
  - .push()           → list.append()
  - !!variable        → bool(variable)
  - || (fallback)     → or / if-else
  - object {}         → dict {}
  - Object.values()   → dict.values()
  - .sort((a,b)=>...) → sorted(key=...)
"""

from chart_types import ChartType  # sibling file in same folder


# ─── Type Hints (Python equivalent of JSDoc @typedef) ─────────────────────
# In JS we used JSDoc comments. In Python we use dataclasses or TypedDict.
from dataclasses import dataclass
from typing import Optional


@dataclass
class ColumnSchema:
    """Mirrors the JS ColumnSchema typedef."""
    name: str
    type: str   # 'string' | 'number' | 'date' | 'boolean'


@dataclass
class ChartScore:
    """One recommended chart with its score and reasoning."""
    type: str       # A ChartType value like 'BAR_CLUSTERED'
    score: int      # 0–100 ranking score
    reason: str     # Human-readable explanation


# ─── Main Function ────────────────────────────────────────────────────────

def recommend_charts(
    columns: list[ColumnSchema],
    dimension: Optional[str] = None,
    measures: Optional[list[str]] = None,
) -> list[ChartScore]:
    """
    Analyze dataset columns and recommend the best chart types.

    Parameters
    ----------
    columns : list[ColumnSchema]
        All columns in the dataset.
    dimension : str, optional
        Currently assigned dimension (category axis).
    measures : list[str], optional
        Currently assigned measure column names.

    Returns
    -------
    list[ChartScore]
        Sorted list of chart recommendations (highest score first).

    JS equivalent
    -------------
    export function recommendCharts(columns, dimension, measures) { ... }

    The JS version uses array.filter() and arrow functions:
        const numericCols = columns.filter(c => c.type === 'number');
    In Python we use list comprehensions:
        numeric_cols = [c for c in columns if c.type == 'number']
    """

    # ── Step 1: Classify columns by type ──────────────────────────────
    # JS:  const numericCols = columns.filter(c => c.type === 'number');
    # Py:  list comprehension — same idea, different syntax
    numeric_cols = [c for c in columns if c.type == "number"]
    categorical_cols = [c for c in columns if c.type == "string"]
    date_cols = [c for c in columns if c.type == "date"]

    # ── Step 2: Determine effective counts ────────────────────────────
    # JS:  const hasDimension = !!dimension;
    #      !! converts any value to true/false.
    # Py:  bool(dimension) does the same — empty string / None → False
    has_dimension = bool(dimension)
    measure_count = len(measures) if measures else 0

    # JS:  const effectiveNumeric = measureCount > 0 ? measureCount : numericCols.length;
    #      This is the "ternary operator" → Python uses: x if condition else y
    effective_numeric = measure_count if measure_count > 0 else len(numeric_cols)
    effective_categorical = 1 if has_dimension else len(categorical_cols)
    effective_date = len(date_cols)

    # ── Step 3: Build a scores list ───────────────────────────────────
    # JS used:  const scores = [];
    #           const add = (type, score, reason) => scores.push({type, score, reason});
    # Python:   We use a plain list + a helper function
    scores: list[ChartScore] = []

    def add(chart_type: str, score: int, reason: str):
        """Shorthand to append a recommendation."""
        scores.append(ChartScore(type=chart_type, score=score, reason=reason))

    # ── Step 4: Scoring rules ─────────────────────────────────────────
    # Each block checks column profiles and adds matching chart types.
    # The logic is identical to the JS version.

    # 1 categorical + 1+ numeric → Bar charts
    if effective_categorical >= 1 and effective_numeric >= 1:
        add(ChartType.BAR_CLUSTERED, 90, "Compare values across categories")
        add(ChartType.BAR_HORIZONTAL, 82, "Horizontal comparison for readability")
        if effective_numeric >= 2:
            add(ChartType.BAR_STACKED, 85, "Show composition across categories")
            add(ChartType.BAR_PERCENT, 78, "Show proportional breakdown")

    # Time series → Line / Area
    if effective_date >= 1 and effective_numeric >= 1:
        add(ChartType.LINE_SMOOTH, 95, "Best for time-series trends")
        add(ChartType.LINE_STRAIGHT, 88, "Precise trend tracking")
        add(ChartType.AREA_SMOOTH, 84, "Time trend with volume emphasis")
        add(ChartType.AREA_STACKED, 80, "Stacked area for cumulative trends")

    # Categorical + numeric → Lines also work
    if effective_categorical >= 1 and effective_numeric >= 1:
        add(ChartType.LINE_SMOOTH, 70, "Trend across categories")
        add(ChartType.AREA_SMOOTH, 65, "Area trend across categories")

    # Part-to-whole
    if effective_categorical >= 1 and effective_numeric >= 1:
        add(ChartType.PIE, 75, "Show proportions of a whole")
        add(ChartType.DONUT, 74, "Proportions with a clean center")
        add(ChartType.TREEMAP, 68, "Hierarchical proportions")
        add(ChartType.ROSE, 60, "Polar proportional chart")
        add(ChartType.SUNBURST, 55, "Nested category breakdown")

    # 2+ numeric → Scatter / Bubble
    if effective_numeric >= 2:
        add(ChartType.SCATTER, 85, "Correlation between two measures")
        if effective_numeric >= 3:
            add(ChartType.BUBBLE, 80, "Three-variable relationship")

    # Radar – multiple measures, 1 dimension
    if effective_categorical >= 1 and effective_numeric >= 3:
        add(ChartType.RADAR, 72, "Multi-metric profile comparison")
        add(ChartType.RADIAL_BAR, 60, "Radial metric comparison")

    # Combos
    if effective_categorical >= 1 and effective_numeric >= 2:
        add(ChartType.COMBO_BAR_LINE, 82, "Compare bar + trend line")
        add(ChartType.COMBO_AREA_LINE, 70, "Area + line overlay")

    # KPI / Gauge – single numeric, no dimension needed
    if effective_numeric >= 1:
        add(ChartType.KPI_SINGLE, 60, "Display a single key metric")
        add(ChartType.GAUGE, 55, "Gauge indicator for a metric")
        add(ChartType.SPARKLINE, 50, "Compact inline trend")

    # Heatmap – 2 categoricals + 1 numeric
    if effective_categorical >= 2 and effective_numeric >= 1:
        add(ChartType.HEATMAP, 75, "Density of values in a matrix")

    # Table always available
    add(ChartType.TABLE, 40, "Raw data table view")

    # ── Step 5: Deduplicate (keep highest score per type) ─────────────
    # JS:
    #   const deduped = {};
    #   for (const s of scores) {
    #       if (!deduped[s.type] || deduped[s.type].score < s.score) {
    #           deduped[s.type] = s;
    #       }
    #   }
    #
    # Python: same logic using a dict
    deduped: dict[str, ChartScore] = {}
    for s in scores:
        if s.type not in deduped or deduped[s.type].score < s.score:
            deduped[s.type] = s

    # ── Step 6: Sort descending by score and return ───────────────────
    # JS:  return Object.values(deduped).sort((a, b) => b.score - a.score);
    # Py:  sorted() with key= and reverse=True
    return sorted(deduped.values(), key=lambda s: s.score, reverse=True)


# ─── Example Usage (run this file directly to test) ──────────────────────

if __name__ == "__main__":
    # Simulate a dataset with mixed columns
    sample_columns = [
        ColumnSchema(name="department", type="string"),
        ColumnSchema(name="gender", type="string"),
        ColumnSchema(name="salary", type="number"),
        ColumnSchema(name="tenure", type="number"),
        ColumnSchema(name="rating", type="number"),
    ]

    results = recommend_charts(sample_columns)

    print("═" * 60)
    print("  Chart Recommendations (no dimension/measures assigned)")
    print("═" * 60)
    for r in results:
        print(f"  {r.score:3d}  │  {r.type:<20s}  │  {r.reason}")

    print()

    # With explicit assignments
    results2 = recommend_charts(
        sample_columns,
        dimension="department",
        measures=["salary"],
    )

    print("═" * 60)
    print("  Chart Recommendations (dimension=department, measures=[salary])")
    print("═" * 60)
    for r in results2:
        print(f"  {r.score:3d}  │  {r.type:<20s}  │  {r.reason}")
