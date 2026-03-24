## Plan: Enable Multi-Dimension Visualization Selection

Current behavior is constrained by a single `dimension` model across UI state, data transforms, chart builders, and interaction payloads. This likely started as a simplification for grouped charts and filtering, but it breaks hierarchical charts like sunburst. The plan is to introduce `dimensions` (array) with backward compatibility, enforce per-chart capability rules, and roll out multi-dimension support in chart families that benefit most first.

### Steps
1. Document single-dimension assumptions in [components/DataPanel.jsx](components/DataPanel.jsx) and [services/echartsOptionBuilder.js](services/echartsOptionBuilder.js) around `dimension` and `measures`.
2. Add chart capability metadata in [constants.js](constants.js) for `minDims`, `maxDims`, and measure requirements.
3. Evolve config shape in [components/Visualization.jsx](components/Visualization.jsx) to support `dimensions` plus legacy `dimension`.
4. Split transform logic in [services/dataMerger.js](services/dataMerger.js) into flat multi-key grouping and hierarchy builders.
5. Update hierarchical charts in [services/echartsOptionBuilder.js](services/echartsOptionBuilder.js) to map `dimensions` to sunburst/treemap paths.
6. Preserve interaction compatibility in [components/Visualization.jsx](components/Visualization.jsx) by emitting both `dimensionPath` and legacy `dimension`.

### do this
1. Why one dimension today: simpler `group by` model, single-axis chart assumptions, and single-column cross-filter payloads.
2. Rollout choice:full all-chart rollout.
3. Measure policy for hierarchy leaves:explicit “value measure” selector.
