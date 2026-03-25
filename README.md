# PowerAnalytics Desktop

PowerAnalytics Desktop is a React + FastAPI analytics workspace for ingesting data (API/SFTP), profiling datasets, and building interactive dashboards with ECharts.

## What is included

- React frontend (Vite)
- FastAPI backend for ingestion + auth
- MongoDB-backed dataset and source-config storage
- Smart chart recommendation + configurable ECharts visuals
- HR analytics dashboard modules

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6 |
| Visualization | Apache ECharts, echarts-for-react |
| Data grid/export | AG Grid, html2canvas, jsPDF, PptxGenJS |
| Backend | FastAPI, Uvicorn |
| Data processing | pandas, openpyxl, httpx, paramiko |
| Database | MongoDB (motor/pymongo) |

## Quick start

### 1) Frontend setup

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Default frontend URL: http://localhost:3000

> In development, `/api` is proxied to `http://localhost:8000` by Vite.

### 2) Backend setup

From the `backend` folder, install Python dependencies and run the API:

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Environment variables

### Frontend

- `VITE_BACKEND_BASE_URL` (optional): API base URL used by the client (default `/api`)
- `VITE_BACKEND_PROXY_TARGET` (optional): Vite proxy target (default `http://localhost:8000`)

### Backend

- `AUTH_SECRET` (**required**): token signing secret
- `AUTH_TOKEN_DAYS` (optional, default `7`): auth token expiry in days
- `FRONTEND_ORIGINS` (optional): comma-separated allowed CORS origins
- `MONGODB_URI` (optional, default `mongodb://localhost:27017`)
- `MONGODB_DB_NAME` (optional, default `ingestion_db`)

## Available frontend scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run preview` — preview production build locally
- `npm run deploy` — publish `dist` to GitHub Pages

## Backend API overview

- Auth: `/auth/signup`, `/auth/login`, `/auth/me`
- Ingestion: `/ingest`, `/ingest/source/{source_id}`
- Source configs: `/source-config` (+ `GET`, `POST`, `PATCH`)
- Dataset retrieval: `/datasets`, `/datasets/latest`, `/datasets/{document_id}`
- Test helpers: `/test/*` endpoints for local Excel/SFTP flows

## Project references

- Backend architecture notes: [backend/BACKEND_ARCHITECTURE.md](./backend/BACKEND_ARCHITECTURE.md)
- Product benchmark vs Power BI: [POWERBI_COMPARISON.md](./POWERBI_COMPARISON.md)

## Live demo

[https://Vishnudharan24.github.io/TabNLP](https://Vishnudharan24.github.io/TabNLP)

## License

Private project.
