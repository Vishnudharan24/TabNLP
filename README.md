# PowerAnalytics Desktop

A desktop-style analytics dashboard built with React, featuring interactive visualizations with ECharts and a customizable grid layout.

## Features

- **Interactive Charts** – Built with ECharts for rich, responsive visualizations
- **Draggable Grid Layout** – Customizable dashboard panels via React Grid Layout
- **Modern UI** – Clean interface with Lucide React icons

## Tech Stack

| Category       | Technology              |
| -------------- | ----------------------- |
| Framework      | React 19                |
| Build Tool     | Vite 6                  |
| Charts         | ECharts 6               |
| Layout         | React Grid Layout       |
| Icons          | Lucide React            |
| Deployment     | GitHub Pages             |

## Supported Chart Types

The application ships with **28+ chart types** across 7 categories, all rendered using Apache ECharts.

| Category | Charts |
|---|---|
| **Bar Charts** | Clustered Bar · Stacked Bar · 100% Stacked Bar · Horizontal Bar · Horizontal Stacked · Horizontal 100% · Waterfall · Range Bar |
| **Line Charts** | Smooth Line · Straight Line · Step Line · Dashed Line · Multi-Axis Line · Area-Line Mix |
| **Area Charts** | Smooth Area · Step Area · Stacked Area · 100% Stacked Area · Gradient Area · Reverse Area |
| **Circular / Part-to-Whole** | Pie · Donut · Semi Pie · Semi Donut · Rose (Nightingale) · Sunburst · Radial Bar · Radar |
| **Distribution & Correlation** | Scatter · Bubble · Scatter + Line · Treemap · Heatmap |
| **Combo Charts** | Bar + Line · Stacked Bar + Line · Area + Line |
| **Indicators** | KPI Single · KPI Progress · KPI Bullet · Table · Card List · Gauge · Sparkline |

## Dynamic Chart Recommendation Logic

Instead of manually picking a chart, the app **automatically recommends the best chart type** based on the shape of your data. The recommendation engine lives in `services/chartRecommender.js`.

### How It Works

1. **Column profiling** — Every column in the dataset is classified as `number`, `string` (categorical), or `date`.
2. **Scoring** — A set of heuristic rules generates a score (0–100) for each chart type based on how many numeric, categorical, and date columns are present, along with the currently assigned dimension and measures.
3. **De-duplication** — If a chart type is matched by multiple rules only the highest score is kept.
4. **Ranking** — Results are sorted by score descending; the top result is auto-selected.

### Recommendation Rules (summary)

| Data Shape | Recommended Charts | Top Score |
|---|---|---|
| 1 categorical + 1+ numeric | Clustered Bar, Horizontal Bar, Stacked Bar, 100% Bar | 90 |
| 1+ date + 1+ numeric | Smooth Line, Straight Line, Smooth Area, Stacked Area | 95 |
| 2+ numeric | Scatter, Bubble (3+ numeric) | 85 |
| 1 categorical + 2+ numeric | Combo Bar+Line, Combo Area+Line | 82 |
| 1 categorical + 3+ numeric | Radar, Radial Bar | 72 |
| 1 categorical + 1 numeric | Pie, Donut, Treemap, Rose, Sunburst | 75 |
| 2+ categorical + 1 numeric | Heatmap | 75 |
| Any numeric | KPI Single, Gauge, Sparkline | 60 |
| Always | Table | 40 |

### Example Flow

```
User loads CSV ──▶ Column profiling detects:
                     • "Department" → string (categorical)
                     • "Revenue"    → number
                     • "Profit"     → number

Recommender scores:
  Clustered Bar     90
  Stacked Bar       85
  Scatter           85
  Combo Bar+Line    82
  Horizontal Bar    82
  …

Top pick → Clustered Bar (auto-rendered)
User can override with any other chart from the ranked list.
```

### Chart Option Builder

Once a chart type is selected, `services/echartsOptionBuilder.js` converts the visual type, processed data, config (dimension + measures), and theme (`light` / `dark`) into a ready-to-use ECharts option object. Each chart type has a dedicated branch in a `switch` statement that produces fully themed, responsive chart options — including tooltips, legends, axis styles, animations, and dark-mode support.

## Getting Started

### Prerequisites

- Node.js (v18 or later recommended)
- npm

### Installation

```bash
git clone https://github.com/Vishnudharan24/TabNLP.git
cd TabNLP/poweranalytics-desktop
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Deploy to GitHub Pages

```bash
npm run deploy
```

This builds the project and publishes the `dist` folder to GitHub Pages.

## Live Demo

[https://Vishnudharan24.github.io/TabNLP](https://Vishnudharan24.github.io/TabNLP)

## License

This project is private.
