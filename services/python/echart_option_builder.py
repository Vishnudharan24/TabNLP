"""
ECharts Option Builder (Python equivalent of echartsOptionBuilder.js)
=====================================================================
Builds Apache ECharts option dicts based on chart type, data, and theme.

This is the largest service — it's essentially a giant switch statement
(Python: if/elif chain) that maps each ChartType to an ECharts config dict.

JS Concept → Python Concept reference:
  - switch/case         → if/elif chain (Python has match/case in 3.10+ too)
  - { ...base, key: v } → {**base, "key": v}   (spread → dict unpacking)
  - array.map(fn)       → [fn(x) for x in array]
  - (val) => expr       → lambda val: expr
  - Math.max(...arr)    → max(arr)
  - Math.min(...arr)    → min(arr)
  - arr.reduce()        → sum() or functools.reduce()
  - template literals   → f-strings: f"hello {name}"
  - || (fallback)       → or
  - ?? (nullish)        → if x is not None else ...
"""

from chart_types import ChartType

# ─── Color Constants (from constants.js) ──────────────────────────────────

CHART_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
    "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
]

CHART_COLORS_DARK = [
    "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa",
    "#22d3ee", "#f472b6", "#2dd4bf", "#fb923c", "#818cf8",
]


# ─── Main Builder Function ────────────────────────────────────────────────

def build_chart_option(
    visual_type: str,
    processed_data: list[dict],
    config: dict,
    theme: str = "light",
) -> dict:
    """
    Build an Apache ECharts option dict for the given chart type.

    Parameters
    ----------
    visual_type : str
        A ChartType value like 'BAR_CLUSTERED', 'PIE', etc.
    processed_data : list[dict]
        Array of row dicts: [{"name": "Eng", "salary": 120000, "tenure": 5}, ...]
        "name" is always the dimension (category axis label).
    config : dict
        {"dimension": "department", "measures": ["salary", "tenure"], "title": "My Chart"}
    theme : 'light' | 'dark'

    Returns
    -------
    dict
        A complete ECharts option object, ready to pass to echarts.setOption().

    JS equivalent
    -------------
    export function buildChartOption(visualType, processedData, config, theme) { ... }

    The JS version uses a giant switch statement. Python doesn't have switch,
    so we use if/elif. Python 3.10+ has match/case but if/elif works everywhere.
    """

    # ── Theme-aware styling ───────────────────────────────────────────
    is_dark = theme == "dark"
    colors = CHART_COLORS_DARK if is_dark else CHART_COLORS
    text_color = "#e2e8f0" if is_dark else "#334155"
    sub_text_color = "#94a3b8"
    border_color = "#334155" if is_dark else "#e2e8f0"
    grid_border_color = "#1e293b" if is_dark else "#f1f5f9"

    # ── Extract config fields ─────────────────────────────────────────
    # JS:  const { measures = [], dimension = '' } = config;
    # Py:  dict.get() with default values
    measures = config.get("measures", [])
    dimension = config.get("dimension", "")

    # JS:  const categories = processedData.map(d => d.name);
    # Py:  list comprehension
    categories = [d["name"] for d in processed_data]

    # ── Reusable style blocks ─────────────────────────────────────────
    # In JS these were local `const` variables.
    # In Python they're plain dicts.

    font_family = "Plus Jakarta Sans, sans-serif"

    base_text_style = {"color": text_color, "fontFamily": font_family}

    tooltip_style = {
        "trigger": "axis",
        "backgroundColor": "#1e293b" if is_dark else "#ffffff",
        "borderColor": "#334155" if is_dark else "#e2e8f0",
        "textStyle": {"color": text_color, "fontSize": 11, "fontFamily": font_family},
        "borderWidth": 1,
        "padding": [12, 16],
        "extraCssText": "border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);",
    }

    legend_style = {
        "textStyle": {"color": sub_text_color, "fontSize": 11, "fontFamily": font_family},
        "bottom": 0,
        "itemGap": 16,
        "icon": "roundRect",
        "itemWidth": 12,
        "itemHeight": 8,
    }

    grid_style = {"left": 48, "right": 24, "top": 24, "bottom": 48, "containLabel": False}

    axis_label_style = {"color": sub_text_color, "fontSize": 10, "fontFamily": font_family}
    axis_line_style = {"lineStyle": {"color": grid_border_color}}
    split_line_style = {"lineStyle": {"color": grid_border_color, "type": "dashed"}}

    x_axis_category = {
        "type": "category",
        "data": categories,
        "axisLabel": axis_label_style,
        "axisLine": axis_line_style,
        "axisTick": {"show": False},
        "splitLine": {"show": False},
    }

    y_axis_value = {
        "type": "value",
        "axisLabel": axis_label_style,
        "axisLine": {"show": False},
        "axisTick": {"show": False},
        "splitLine": split_line_style,
    }

    # ── Base option (shared by every chart) ───────────────────────────
    # JS:  const base = { ...stuff };
    # Py:  plain dict
    base = {
        "backgroundColor": "transparent",
        "textStyle": base_text_style,
        "color": colors,
        "animation": True,
        "animationDuration": 600,
        "animationEasing": "cubicOut",
    }

    # ══════════════════════════════════════════════════════════════════
    #  CHART TYPE SWITCH  (JS: switch(visualType) { case ...: })
    # ══════════════════════════════════════════════════════════════════

    # ═══════════════════ BAR CHARTS ═══════════════════

    if visual_type == ChartType.BAR_CLUSTERED:
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style if len(measures) > 1 else None,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": y_axis_value,
            "series": [
                {
                    "name": m,
                    "type": "bar",
                    "data": [d.get(m) for d in processed_data],
                    "itemStyle": {"borderRadius": [4, 4, 0, 0]},
                    "barMaxWidth": 32,
                    "emphasis": {"itemStyle": {"shadowBlur": 10, "shadowColor": "rgba(0,0,0,0.15)"}},
                }
                for m in measures
            ],
        }

    elif visual_type == ChartType.BAR_STACKED:
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": y_axis_value,
            "series": [
                {
                    "name": m,
                    "type": "bar",
                    "stack": "total",
                    "data": [d.get(m) for d in processed_data],
                    "itemStyle": {
                        "borderRadius": [4, 4, 0, 0] if i == len(measures) - 1 else [0, 0, 0, 0]
                    },
                    "barMaxWidth": 32,
                }
                for i, m in enumerate(measures)
            ],
        }

    elif visual_type == ChartType.BAR_PERCENT:
        # Calculate row totals for percentage computation
        # JS:  const totals = processedData.map((d, idx) =>
        #          measures.reduce((sum, m) => sum + (d[m] || 0), 0));
        # Py:  list comprehension with sum()
        totals = [
            sum(d.get(m, 0) or 0 for m in measures)
            for d in processed_data
        ]
        return {
            **base,
            "tooltip": {**tooltip_style},  # Note: JS had a custom formatter here
            "legend": legend_style,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": {**y_axis_value, "max": 100},
            "series": [
                {
                    "name": m,
                    "type": "bar",
                    "stack": "total",
                    "data": [
                        ((d.get(m, 0) or 0) / totals[idx] * 100) if totals[idx] else 0
                        for idx, d in enumerate(processed_data)
                    ],
                    "itemStyle": {
                        "borderRadius": [4, 4, 0, 0] if i == len(measures) - 1 else [0, 0, 0, 0]
                    },
                    "barMaxWidth": 32,
                }
                for i, m in enumerate(measures)
            ],
        }

    elif visual_type == ChartType.BAR_HORIZONTAL:
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style if len(measures) > 1 else None,
            "grid": {**grid_style, "left": 80},
            "yAxis": {**x_axis_category, "type": "category"},
            "xAxis": {**y_axis_value, "type": "value"},
            "series": [
                {
                    "name": m,
                    "type": "bar",
                    "data": [d.get(m) for d in processed_data],
                    "itemStyle": {"borderRadius": [0, 4, 4, 0]},
                    "barMaxWidth": 24,
                }
                for m in measures
            ],
        }

    # ═══════════════════ LINE CHARTS ═══════════════════

    elif visual_type == ChartType.LINE_SMOOTH:
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style if len(measures) > 1 else None,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": y_axis_value,
            "series": [
                {
                    "name": m,
                    "type": "line",
                    "smooth": True,
                    "data": [d.get(m) for d in processed_data],
                    "symbol": "circle",
                    "symbolSize": 6,
                    "lineStyle": {"width": 3},
                }
                for m in measures
            ],
        }

    elif visual_type == ChartType.LINE_STRAIGHT:
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style if len(measures) > 1 else None,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": y_axis_value,
            "series": [
                {
                    "name": m,
                    "type": "line",
                    "smooth": False,
                    "data": [d.get(m) for d in processed_data],
                    "symbol": "circle",
                    "symbolSize": 6,
                    "lineStyle": {"width": 2},
                }
                for m in measures
            ],
        }

    elif visual_type == ChartType.LINE_STEP:
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style if len(measures) > 1 else None,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": y_axis_value,
            "series": [
                {
                    "name": m,
                    "type": "line",
                    "step": "middle",
                    "data": [d.get(m) for d in processed_data],
                    "symbol": "circle",
                    "symbolSize": 5,
                }
                for m in measures
            ],
        }

    # ═══════════════════ AREA CHARTS ═══════════════════

    elif visual_type == ChartType.AREA_SMOOTH:
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style if len(measures) > 1 else None,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": y_axis_value,
            "series": [
                {
                    "name": m,
                    "type": "line",
                    "smooth": True,
                    "areaStyle": {"opacity": 0.25},
                    "data": [d.get(m) for d in processed_data],
                    "symbol": "none",
                    "lineStyle": {"width": 2},
                }
                for m in measures
            ],
        }

    elif visual_type == ChartType.AREA_STACKED:
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": y_axis_value,
            "series": [
                {
                    "name": m,
                    "type": "line",
                    "stack": "total",
                    "smooth": True,
                    "areaStyle": {"opacity": 0.35},
                    "data": [d.get(m) for d in processed_data],
                    "symbol": "none",
                }
                for m in measures
            ],
        }

    elif visual_type == ChartType.AREA_PERCENT:
        totals = [
            sum(d.get(m, 0) or 0 for m in measures)
            for d in processed_data
        ]
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": {**y_axis_value, "max": 100},
            "series": [
                {
                    "name": m,
                    "type": "line",
                    "stack": "total",
                    "smooth": True,
                    "areaStyle": {"opacity": 0.5},
                    "data": [
                        ((d.get(m, 0) or 0) / totals[idx] * 100) if totals[idx] else 0
                        for idx, d in enumerate(processed_data)
                    ],
                    "symbol": "none",
                }
                for m in measures
            ],
        }

    # ═══════════════════ CIRCULAR CHARTS ═══════════════════

    elif visual_type == ChartType.PIE:
        return {
            **base,
            "tooltip": {**tooltip_style, "trigger": "item"},
            "legend": legend_style,
            "series": [
                {
                    "type": "pie",
                    "radius": ["0%", "75%"],
                    "data": [
                        {"name": d["name"], "value": d.get(measures[0], 0) or 0}
                        for d in processed_data
                    ],
                    "label": {"color": sub_text_color, "fontSize": 10},
                    "itemStyle": {
                        "borderRadius": 4,
                        "borderColor": "#1e293b" if is_dark else "#fff",
                        "borderWidth": 2,
                    },
                    "emphasis": {"itemStyle": {"shadowBlur": 10, "shadowColor": "rgba(0,0,0,0.15)"}},
                }
            ],
        }

    elif visual_type == ChartType.DONUT:
        return {
            **base,
            "tooltip": {**tooltip_style, "trigger": "item"},
            "legend": legend_style,
            "series": [
                {
                    "type": "pie",
                    "radius": ["50%", "78%"],
                    "data": [
                        {"name": d["name"], "value": d.get(measures[0], 0) or 0}
                        for d in processed_data
                    ],
                    "label": {"show": False},
                    "itemStyle": {
                        "borderRadius": 6,
                        "borderColor": "#1e293b" if is_dark else "#fff",
                        "borderWidth": 3,
                    },
                    "emphasis": {
                        "label": {"show": True, "fontSize": 13, "fontWeight": "bold", "color": text_color},
                        "itemStyle": {"shadowBlur": 10, "shadowColor": "rgba(0,0,0,0.15)"},
                    },
                }
            ],
        }

    elif visual_type == ChartType.ROSE:
        return {
            **base,
            "tooltip": {**tooltip_style, "trigger": "item"},
            "legend": legend_style,
            "series": [
                {
                    "type": "pie",
                    "roseType": "area",
                    "radius": ["20%", "75%"],
                    "data": [
                        {"name": d["name"], "value": d.get(measures[0], 0) or 0}
                        for d in processed_data
                    ],
                    "label": {"color": sub_text_color, "fontSize": 10},
                    "itemStyle": {
                        "borderRadius": 6,
                        "borderColor": "#1e293b" if is_dark else "#fff",
                        "borderWidth": 2,
                    },
                }
            ],
        }

    elif visual_type == ChartType.SUNBURST:
        return {
            **base,
            "tooltip": {**tooltip_style, "trigger": "item"},
            "series": [
                {
                    "type": "sunburst",
                    "data": [
                        {
                            "name": d["name"],
                            "value": d.get(measures[0], 0) or 0,
                            "children": (
                                [{"name": m, "value": d.get(m, 0) or 0} for m in measures[1:]]
                                if len(measures) > 1 else None
                            ),
                        }
                        for d in processed_data
                    ],
                    "radius": ["15%", "80%"],
                    "label": {"fontSize": 9, "color": text_color},
                    "itemStyle": {
                        "borderRadius": 4,
                        "borderColor": "#1e293b" if is_dark else "#fff",
                        "borderWidth": 2,
                    },
                }
            ],
        }

    # ═══════════════════ DISTRIBUTION ═══════════════════

    elif visual_type == ChartType.SCATTER:
        return {
            **base,
            "tooltip": {**tooltip_style, "trigger": "item"},
            "grid": grid_style,
            "xAxis": {
                **y_axis_value,
                "name": measures[0] if measures else "",
                "nameLocation": "center",
                "nameGap": 30,
                "nameTextStyle": axis_label_style,
            },
            "yAxis": {
                **y_axis_value,
                "name": measures[1] if len(measures) > 1 else (measures[0] if measures else ""),
                "nameTextStyle": axis_label_style,
            },
            "series": [
                {
                    "type": "scatter",
                    "data": [
                        [
                            d.get(measures[0], 0) or 0,
                            d.get(measures[1], d.get(measures[0], 0)) if len(measures) > 1 else d.get(measures[0], 0) or 0,
                        ]
                        for d in processed_data
                    ],
                    "symbolSize": 12,
                    "itemStyle": {"opacity": 0.75},
                    "emphasis": {"itemStyle": {"shadowBlur": 10, "shadowColor": "rgba(0,0,0,0.2)"}},
                }
            ],
        }

    elif visual_type == ChartType.BUBBLE:
        return {
            **base,
            "tooltip": {**tooltip_style, "trigger": "item"},
            "grid": grid_style,
            "xAxis": {
                **y_axis_value,
                "name": measures[0] if measures else "",
                "nameLocation": "center",
                "nameGap": 30,
                "nameTextStyle": axis_label_style,
            },
            "yAxis": {
                **y_axis_value,
                "name": measures[1] if len(measures) > 1 else "",
                "nameTextStyle": axis_label_style,
            },
            "series": [
                {
                    "type": "scatter",
                    "data": [
                        [
                            d.get(measures[0], 0) or 0,
                            d.get(measures[1], 0) or 0 if len(measures) > 1 else 0,
                            d.get(measures[2], d.get(measures[0], 10)) if len(measures) > 2 else 10,
                        ]
                        for d in processed_data
                    ],
                    # Note: JS used a callback function for symbolSize:
                    #   symbolSize: (val) => Math.max(8, Math.min(40, val[2] / 5))
                    # Python dicts can't hold callable functions for ECharts.
                    # In a backend, you'd compute sizes ahead of time.
                    "symbolSize": 20,
                    "itemStyle": {"opacity": 0.65},
                }
            ],
        }

    elif visual_type == ChartType.HEATMAP:
        # Build a 2D matrix: y-axis = categories, x-axis = measures
        # JS used nested .forEach() loops → Python uses nested for-loops
        y_names = list(dict.fromkeys(d["name"] for d in processed_data))  # preserve order, dedupe
        x_names = measures
        heat_data = []
        for yi, y_name in enumerate(y_names):
            row = next((d for d in processed_data if d["name"] == y_name), None)
            for xi, x_name in enumerate(x_names):
                heat_data.append([xi, yi, row.get(x_name, 0) if row else 0])

        all_values = [point[2] for point in heat_data]
        min_val = min(all_values) if all_values else 0
        max_val = max(all_values) if all_values else 100

        return {
            **base,
            "tooltip": {**tooltip_style, "trigger": "item"},
            "grid": {**grid_style, "left": 80, "bottom": 60},
            "xAxis": {"type": "category", "data": x_names, "axisLabel": axis_label_style, "splitArea": {"show": True}},
            "yAxis": {"type": "category", "data": y_names, "axisLabel": axis_label_style, "splitArea": {"show": True}},
            "visualMap": {
                "min": min_val,
                "max": max_val,
                "calculable": True,
                "orient": "horizontal",
                "left": "center",
                "bottom": 0,
                "inRange": {
                    "color": ["#1e293b", "#3b82f6", "#ef4444"] if is_dark
                    else ["#f0f9ff", "#3b82f6", "#ef4444"],
                },
                "textStyle": {"color": sub_text_color, "fontSize": 10},
            },
            "series": [
                {
                    "type": "heatmap",
                    "data": heat_data,
                    "label": {"show": True, "fontSize": 10, "color": text_color},
                    "itemStyle": {
                        "borderRadius": 2,
                        "borderColor": "#1e293b" if is_dark else "#fff",
                        "borderWidth": 2,
                    },
                }
            ],
        }

    elif visual_type == ChartType.TREEMAP:
        return {
            **base,
            "tooltip": {**tooltip_style, "trigger": "item"},
            "series": [
                {
                    "type": "treemap",
                    "data": [
                        {"name": d["name"], "value": d.get(measures[0], 0) or 0}
                        for d in processed_data
                    ],
                    "label": {"fontSize": 11, "fontWeight": "bold", "color": "#fff"},
                    "breadcrumb": {"show": False},
                    "itemStyle": {
                        "borderColor": "#1e293b" if is_dark else "#fff",
                        "borderWidth": 2,
                        "borderRadius": 4,
                    },
                    "levels": [
                        {"itemStyle": {"borderColor": "#0f172a" if is_dark else "#fff", "borderWidth": 3}},
                    ],
                }
            ],
        }

    # ═══════════════════ COMBOS ═══════════════════

    elif visual_type == ChartType.COMBO_BAR_LINE:
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": y_axis_value,
            "series": [
                {
                    "name": m,
                    "type": "bar" if i == 0 else "line",
                    "data": [d.get(m) for d in processed_data],
                    **(
                        {"itemStyle": {"borderRadius": [4, 4, 0, 0]}, "barMaxWidth": 28}
                        if i == 0
                        else {"smooth": True, "symbol": "circle", "symbolSize": 6, "lineStyle": {"width": 3}}
                    ),
                }
                for i, m in enumerate(measures)
            ],
        }

    elif visual_type == ChartType.COMBO_AREA_LINE:
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": y_axis_value,
            "series": [
                {
                    "name": m,
                    "type": "line",
                    "smooth": True,
                    "data": [d.get(m) for d in processed_data],
                    **({"areaStyle": {"opacity": 0.2}} if i == 0 else {}),
                    "symbol": "circle",
                    "symbolSize": 5,
                    "lineStyle": {"width": 2 if i == 0 else 3},
                }
                for i, m in enumerate(measures)
            ],
        }

    # ═══════════════════ INDICATORS ═══════════════════

    elif visual_type == ChartType.GAUGE:
        # JS:  const total = processedData.reduce((acc, d) => acc + (d[measures[0]] || 0), 0);
        # Py:  sum() with generator
        total = sum(d.get(measures[0], 0) or 0 for d in processed_data)
        avg = total / len(processed_data) if processed_data else 0

        return {
            **base,
            "series": [
                {
                    "type": "gauge",
                    "startAngle": 210,
                    "endAngle": -30,
                    "min": 0,
                    "max": max(avg * 2, 100),
                    "pointer": {"width": 5, "length": "60%", "itemStyle": {"color": colors[0]}},
                    "axisLine": {
                        "lineStyle": {
                            "width": 20,
                            "color": [
                                [0.3, "#334155" if is_dark else "#e2e8f0"],
                                [0.7, colors[1] if len(colors) > 1 else colors[0]],
                                [1, colors[0]],
                            ],
                        },
                    },
                    "axisTick": {"show": False},
                    "splitLine": {
                        "length": 12,
                        "lineStyle": {"color": "#475569" if is_dark else "#94a3b8", "width": 2},
                    },
                    "axisLabel": {"distance": 28, "color": sub_text_color, "fontSize": 10},
                    "detail": {
                        "valueAnimation": True,
                        "fontSize": 24,
                        "fontWeight": "bold",
                        "color": text_color,
                        # Note: JS used a callback formatter. In Python we pre-format.
                        "offsetCenter": [0, "70%"],
                    },
                    "data": [{"value": round(avg, 1), "name": measures[0] if measures else ""}],
                    "title": {"color": sub_text_color, "fontSize": 11, "offsetCenter": [0, "90%"]},
                }
            ],
        }

    elif visual_type == ChartType.SPARKLINE:
        return {
            **base,
            "grid": {"left": 4, "right": 4, "top": 4, "bottom": 4},
            "xAxis": {"type": "category", "show": False, "data": categories},
            "yAxis": {"type": "value", "show": False},
            "series": [
                {
                    "type": "line",
                    "smooth": True,
                    "data": [d.get(measures[0], 0) or 0 for d in processed_data],
                    "symbol": "none",
                    "lineStyle": {"width": 2, "color": colors[0]},
                    "areaStyle": {"opacity": 0.1, "color": colors[0]},
                }
            ],
        }

    elif visual_type == ChartType.RADAR:
        # JS: Math.max(...processedData.map(dd => Math.max(...measures.map(m => dd[m] || 0))))
        # Py: nested max() with generator expressions
        all_vals = [
            d.get(m, 0) or 0
            for d in processed_data
            for m in measures
        ]
        max_indicator = max(all_vals) * 1.2 if all_vals else 100

        indicators = [
            {"name": d["name"], "max": max_indicator}
            for d in processed_data
        ]

        return {
            **base,
            "tooltip": {**tooltip_style, "trigger": "item"},
            "legend": legend_style if len(measures) > 1 else None,
            "radar": {
                "indicator": indicators,
                "axisName": {"color": sub_text_color, "fontSize": 10},
                "splitArea": {
                    "areaStyle": {
                        "color": ["#1e293b", "#0f172a"] if is_dark else ["#f8fafc", "#ffffff"],
                    },
                },
                "splitLine": {"lineStyle": {"color": grid_border_color}},
                "axisLine": {"lineStyle": {"color": grid_border_color}},
            },
            "series": [
                {
                    "type": "radar",
                    "data": [
                        {
                            "value": [d.get(m, 0) or 0 for d in processed_data],
                            "name": m,
                            "areaStyle": {"opacity": 0.15},
                        }
                    ],
                    "lineStyle": {"width": 2},
                    "symbol": "circle",
                    "symbolSize": 5,
                }
                for m in measures
            ],
        }

    elif visual_type == ChartType.RADIAL_BAR:
        all_vals = [d.get(measures[0], 0) or 0 for d in processed_data]
        max_val = max(all_vals) if all_vals else 100

        return {
            **base,
            "tooltip": {**tooltip_style, "trigger": "item"},
            "polar": {"radius": ["15%", "80%"]},
            "angleAxis": {"max": max_val * 1.1, "show": False},
            "radiusAxis": {
                "type": "category",
                "data": categories,
                "axisLabel": axis_label_style,
                "axisLine": {"show": False},
                "axisTick": {"show": False},
            },
            "series": [
                {
                    "type": "bar",
                    "data": [
                        {
                            "value": d.get(measures[0], 0) or 0,
                            "itemStyle": {"color": colors[i % len(colors)]},
                        }
                        for i, d in enumerate(processed_data)
                    ],
                    "coordinateSystem": "polar",
                    "barMaxWidth": 16,
                    "itemStyle": {"borderRadius": 4},
                }
            ],
        }

    # ═══════════════════ FALLBACK (DEFAULT) ═══════════════════
    else:
        # JS: default: return { ... bar chart ... }
        return {
            **base,
            "tooltip": tooltip_style,
            "legend": legend_style if len(measures) > 1 else None,
            "grid": grid_style,
            "xAxis": x_axis_category,
            "yAxis": y_axis_value,
            "series": [
                {
                    "name": m,
                    "type": "bar",
                    "data": [d.get(m) for d in processed_data],
                    "itemStyle": {"borderRadius": [4, 4, 0, 0]},
                    "barMaxWidth": 32,
                }
                for m in measures
            ],
        }


# ─── Example Usage ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json

    sample_data = [
        {"name": "Engineering", "salary": 125000, "tenure": 5.2, "rating": 4.5},
        {"name": "Sales", "salary": 88000, "tenure": 3.1, "rating": 4.0},
        {"name": "Marketing", "salary": 92000, "tenure": 3.5, "rating": 4.2},
        {"name": "HR", "salary": 78000, "tenure": 4.1, "rating": 4.5},
    ]

    config = {
        "dimension": "department",
        "measures": ["salary", "tenure"],
        "title": "Comp & Tenure by Dept",
    }

    # Test a few chart types
    for chart_type in [ChartType.BAR_CLUSTERED, ChartType.PIE, ChartType.SCATTER, ChartType.RADAR]:
        option = build_chart_option(chart_type, sample_data, config, "light")
        print(f"\n{'═' * 60}")
        print(f"  {chart_type.value}")
        print(f"{'═' * 60}")
        # Pretty-print just the series count and type
        series = option.get("series", [])
        print(f"  Series count: {len(series)}")
        for s in series:
            s_type = s.get("type", "unknown")
            s_name = s.get("name", "(unnamed)")
            print(f"    → {s_type}: {s_name}")
        # Show full JSON for the first one only
        if chart_type == ChartType.BAR_CLUSTERED:
            print(f"\n  Full option (truncated):")
            print(f"  {json.dumps(option, indent=2)[:500]}...")
