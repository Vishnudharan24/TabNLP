## Plan: FastAPI ingestion + UI integration

Create a stable ingestion contract in the backend, expose dataset retrieval APIs, and wire a new ingestion pipeline UI into the existing Data Hub flow so ingested datasets appear like current local uploads. This keeps current behavior intact while adding endpoint and SFTP ingestion, with consistent error handling, environment-driven API configuration, and a clean service boundary between UI and backend.

### Steps
1. Audit and formalize ingestion routes in [backend/main.py](backend/main.py) using explicit request/response models around `ingest_data()`.
2. Replace test-style source endpoints with stable APIs in [backend/main.py](backend/main.py), backed by [backend/services/data_services/ingestion_service.py](backend/services/data_services/ingestion_service.py).
3. Add dataset read APIs via [backend/db/db_store.py](backend/db/db_store.py) so frontend can fetch stored `data` + metadata after ingestion.
4. Add frontend API layer in [services](services) for `ingestBySourceId()`, `ingestBySourceConfig()`, and dataset fetch with unified error parsing.
5. Integrate async ingestion flow in [App.jsx](App.jsx) and extend [components/DataSourceView.jsx](components/DataSourceView.jsx) with a new ingestion pipeline panel/component.
6. Configure browser connectivity and safety: CORS in [backend/main.py](backend/main.py), base URL env usage in [vite.config.js](vite.config.js), and optional auth hooks in [backend/security](backend/security).
7. Document all the changes, techinical detail, architecture and data flow.

### Further Considerations
1. Ingestion UX scope: Option A inline in [components/DataSourceView.jsx](components/DataSourceView.jsx), Option B modal, Option C dedicated sidebar view.
2. Dataset payload strategy: return full dataset in ingest response, or return `document_id` then fetch via read endpoint.
3. Security level now: keep open for local dev, or immediately enforce token checks via [backend/security](backend/security).
