
// Chart Types - converted from TypeScript enum to plain object
export const ChartType = {
  // Comparison - Bars
  BAR_CLUSTERED: 'BAR_CLUSTERED',
  BAR_STACKED: 'BAR_STACKED',
  BAR_PERCENT: 'BAR_PERCENT',
  BAR_HORIZONTAL: 'BAR_HORIZONTAL',
  BAR_HORIZONTAL_STACKED: 'BAR_HORIZONTAL_STACKED',
  BAR_HORIZONTAL_PERCENT: 'BAR_HORIZONTAL_PERCENT',
  BAR_WATERFALL: 'BAR_WATERFALL',
  BAR_RANGE: 'BAR_RANGE',

  // Trends - Lines
  LINE_SMOOTH: 'LINE_SMOOTH',
  LINE_STEP: 'LINE_STEP',
  LINE_STRAIGHT: 'LINE_STRAIGHT',
  LINE_DASHED: 'LINE_DASHED',
  LINE_MULTI_AXIS: 'LINE_MULTI_AXIS',
  LINE_AREA_MIX: 'LINE_AREA_MIX',

  // Trends - Areas
  AREA_SMOOTH: 'AREA_SMOOTH',
  AREA_STEP: 'AREA_STEP',
  AREA_STACKED: 'AREA_STACKED',
  AREA_PERCENT: 'AREA_PERCENT',
  AREA_GRADIENT: 'AREA_GRADIENT',
  AREA_REVERSE: 'AREA_REVERSE',

  // Part to Whole - Circular
  PIE: 'PIE',
  DONUT: 'DONUT',
  PIE_SEMI: 'PIE_SEMI',
  DONUT_SEMI: 'DONUT_SEMI',
  ROSE: 'ROSE',
  SUNBURST: 'SUNBURST',
  RADIAL_BAR: 'RADIAL_BAR',
  RADAR: 'RADAR',

  // Distribution & Correlation
  SCATTER: 'SCATTER',
  BUBBLE: 'BUBBLE',
  SCATTER_LINE: 'SCATTER_LINE',
  TREEMAP: 'TREEMAP',
  HEATMAP: 'HEATMAP',

  // Combinations
  COMBO_BAR_LINE: 'COMBO_BAR_LINE',
  COMBO_STACKED_LINE: 'COMBO_STACKED_LINE',
  COMBO_AREA_LINE: 'COMBO_AREA_LINE',

  // Informational & Indicators
  KPI_SINGLE: 'KPI_SINGLE',
  KPI_PROGRESS: 'KPI_PROGRESS',
  KPI_BULLET: 'KPI_BULLET',
  TABLE: 'TABLE',
  CARD_LIST: 'CARD_LIST',
  GAUGE: 'GAUGE',
  SPARKLINE: 'SPARKLINE'
};

/**
 * @typedef {'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX'} AggregationType
 */

/**
 * @typedef {Object} FilterConfig
 * @property {string} id
 * @property {string} column
 * @property {string} operator
 * @property {*} value
 * @property {*} [valueSecondary]
 */

/**
 * @typedef {Object} ColumnSchema
 * @property {string} name
 * @property {'string' | 'number' | 'date' | 'boolean'} type
 */

/**
 * @typedef {Object} Dataset
 * @property {string} id
 * @property {string} name
 * @property {ColumnSchema[]} columns
 * @property {Array<*>} data
 */

/**
 * @typedef {Object} LayoutConfig
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {Object} ReportPage
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {Object} DynamicChartConfig
 * @property {string} id
 * @property {string} pageId
 * @property {string} title
 * @property {string} type
 * @property {string} datasetId
 * @property {string} dimension
 * @property {string[]} measures
 * @property {AggregationType} aggregation
 * @property {LayoutConfig} layout
 * @property {FilterConfig[]} filters
 */

/**
 * @typedef {Object} Employee
 * @property {string} id
 * @property {string} name
 * @property {string} department
 * @property {number} salary
 * @property {number} rating
 * @property {number} tenure
 * @property {number} satisfaction
 * @property {string} gender
 */
