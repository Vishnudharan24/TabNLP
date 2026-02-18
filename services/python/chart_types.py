"""
Chart Types (Python equivalent of types.js ChartType enum)
==========================================================

JS used a plain object (frozen dictionary):
    export const ChartType = { BAR_CLUSTERED: 'BAR_CLUSTERED', ... };

Python has a proper Enum class which is safer — you can't accidentally
use a string that doesn't exist.

Usage:
    from chart_types import ChartType
    print(ChartType.BAR_CLUSTERED)        # ChartType.BAR_CLUSTERED
    print(ChartType.BAR_CLUSTERED.value)  # 'BAR_CLUSTERED'
"""

from enum import Enum


class ChartType(str, Enum):
    """
    All supported chart types.

    Inheriting from (str, Enum) means each member IS a string,
    so you can do:  ChartType.PIE == 'PIE'  → True
    This mimics the JS behavior where ChartType.PIE === 'PIE'.
    """

    # ── Comparison - Bars ──────────────────────────────────────────
    BAR_CLUSTERED = "BAR_CLUSTERED"
    BAR_STACKED = "BAR_STACKED"
    BAR_PERCENT = "BAR_PERCENT"
    BAR_HORIZONTAL = "BAR_HORIZONTAL"
    BAR_HORIZONTAL_STACKED = "BAR_HORIZONTAL_STACKED"
    BAR_HORIZONTAL_PERCENT = "BAR_HORIZONTAL_PERCENT"
    BAR_WATERFALL = "BAR_WATERFALL"
    BAR_RANGE = "BAR_RANGE"

    # ── Trends - Lines ─────────────────────────────────────────────
    LINE_SMOOTH = "LINE_SMOOTH"
    LINE_STEP = "LINE_STEP"
    LINE_STRAIGHT = "LINE_STRAIGHT"
    LINE_DASHED = "LINE_DASHED"
    LINE_MULTI_AXIS = "LINE_MULTI_AXIS"
    LINE_AREA_MIX = "LINE_AREA_MIX"

    # ── Trends - Areas ─────────────────────────────────────────────
    AREA_SMOOTH = "AREA_SMOOTH"
    AREA_STEP = "AREA_STEP"
    AREA_STACKED = "AREA_STACKED"
    AREA_PERCENT = "AREA_PERCENT"
    AREA_GRADIENT = "AREA_GRADIENT"
    AREA_REVERSE = "AREA_REVERSE"

    # ── Part to Whole - Circular ───────────────────────────────────
    PIE = "PIE"
    DONUT = "DONUT"
    PIE_SEMI = "PIE_SEMI"
    DONUT_SEMI = "DONUT_SEMI"
    ROSE = "ROSE"
    SUNBURST = "SUNBURST"
    RADIAL_BAR = "RADIAL_BAR"
    RADAR = "RADAR"

    # ── Distribution & Correlation ─────────────────────────────────
    SCATTER = "SCATTER"
    BUBBLE = "BUBBLE"
    SCATTER_LINE = "SCATTER_LINE"
    TREEMAP = "TREEMAP"
    HEATMAP = "HEATMAP"

    # ── Combinations ───────────────────────────────────────────────
    COMBO_BAR_LINE = "COMBO_BAR_LINE"
    COMBO_STACKED_LINE = "COMBO_STACKED_LINE"
    COMBO_AREA_LINE = "COMBO_AREA_LINE"

    # ── Informational & Indicators ─────────────────────────────────
    KPI_SINGLE = "KPI_SINGLE"
    KPI_PROGRESS = "KPI_PROGRESS"
    KPI_BULLET = "KPI_BULLET"
    TABLE = "TABLE"
    CARD_LIST = "CARD_LIST"
    GAUGE = "GAUGE"
    SPARKLINE = "SPARKLINE"
