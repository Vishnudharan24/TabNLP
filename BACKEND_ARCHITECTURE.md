# Backend Architecture and API/Data Flow

## 1) High-level architecture

- **API layer (FastAPI)**: request routing and HTTP error mapping in [backend/main.py](main.py#L1).
- **Ingestion orchestration layer**: end-to-end pipeline in [backend/services/data_services/ingestion_service.py](services/data_services/ingestion_service.py#L9).
- **Source adapters**:
  - HTTP/API fetch in [backend/services/data_services/data_fetcher.py](services/data_services/data_fetcher.py#L7)
  - SFTP fetch in [backend/services/data_services/sftp_fetcher.py](services/data_services/sftp_fetcher.py#L50)
- **Parsing layer**: file format to DataFrame in [backend/services/data_services/format_parser.py](services/data_services/format_parser.py#L4)
- **Metadata layer**: ingestion metadata + secret redaction in [backend/services/data_services/metadata_generator.py](services/data_services/metadata_generator.py#L23)
- **Persistence layer (MongoDB via Motor)**: collections, indexes, versioning in [backend/db/db_store.py](db/db_store.py#L17)

Also:
- [backend/services/chart/chart_reommeder.py](services/chart/chart_reommeder.py) is currently empty.
- [backend/security](security), [backend/config](config), [backend/utils](utils) are empty placeholders right now.

---

## 2) Database model and versioning flow

Defined in [backend/db/db_store.py](db/db_store.py#L17):

- `datasets` collection ([line 17](db/db_store.py#L17))
- `source_config` collection ([line 18](db/db_store.py#L18))
- `dataset_version_counters` collection ([line 19](db/db_store.py#L19))

Startup index creation via `ensure_indexes()`:
- unique (`source_key`, `version`) ([line 29](db/db_store.py#L29))
- index (`source_key`, `is_latest`) ([line 34](db/db_store.py#L34))
- index (`source_key`, `ingested_at`) ([line 38](db/db_store.py#L38))
- unique `source_config.source_id` ([line 42](db/db_store.py#L42))

Versioning behavior:
1. Normalize logical source id with `_normalize_source_key()` ([line 51](db/db_store.py#L51)).
2. Atomically increment counter with `get_next_version()` ([line 62](db/db_store.py#L62)).
3. Mark previous versions `is_latest=false` and insert new doc in `store_dataset()` ([line 71](db/db_store.py#L71)).

So each source gets monotonic versions: `v1`, `v2`, `v3`, etc.

---

## 3) How each API works

### A) `POST /ingest`
Defined at [backend/main.py](main.py#L24)

Input query params:
- `source_id` (optional)
- `url` (optional)

Behavior:
- Calls `run_ingestion(source_id, url)` ([backend/main.py#L27](main.py#L27)).
- Errors:
  - `ValueError` → HTTP 400 ([line 29](main.py#L29))
  - any other exception → HTTP 500 ([line 31](main.py#L31))

Core rule in `run_ingestion()`:
- If `url` is present: treat as API source directly ([ingestion_service.py#L31-L32](services/data_services/ingestion_service.py#L31-L32)).
- If `url` absent: `source_id` is required ([line 15](services/data_services/ingestion_service.py#L15)), then load source config from Mongo ([line 18](services/data_services/ingestion_service.py#L18)).

---

### B) `GET /test/excel`
Defined at [backend/main.py](main.py#L39)

Behavior:
- Reads a fixed local test file path.
- If missing → 404 ([line 42](main.py#L42)).
- Else returns file as Excel response ([line 44](main.py#L44)).

Purpose: local testing endpoint that acts like a downloadable API file source.

---

### C) `POST /test/source-config/excel`
Defined at [backend/main.py](main.py#L51)

Input:
- `source_id` (default: `local_excel_test`)

Behavior:
- Builds `api_endpoint` pointing to `/test/excel` ([line 55](main.py#L55)).
- Upserts into `source_config` using `upsert_source_config()` ([line 56](main.py#L56)).
- Stores as `source_type="api"`.

Use case: one-call bootstrap for test API source config in MongoDB.

---

### D) `POST /test/source-config/sftp`
Defined at [backend/main.py](main.py#L72)

Inputs (all query params):
- `source_id`, `host`, `port`, `username`, `private_key_path`, `passphrase`, `remote_path`, `known_hosts_path`

Behavior:
- Builds nested `sftp_config` object ([line 84](main.py#L84)).
- Upserts source config with `source_type="sftp"` ([line 95](main.py#L95)).

Use case: one-call bootstrap for SFTP source config in MongoDB.

---

### E) `POST /test/ingest/excel`
Defined at [backend/main.py](main.py#L114)

Behavior:
- Calls `run_ingestion(source_id="local_excel_test")` by default ([line 117](main.py#L117)).
- Same 400/500 mapping as `/ingest`.

---

### F) `POST /test/ingest/sftp`
Defined at [backend/main.py](main.py#L124)

Behavior:
- Calls `run_ingestion(source_id="local_sftp_test")` by default ([line 127](main.py#L127)).
- Same 400/500 mapping as `/ingest`.

---

## 4) End-to-end data flow

### Flow 1: API URL source
1. `POST /ingest?url=...` ([backend/main.py#L24](main.py#L24))
2. `run_ingestion()` ([ingestion_service.py#L9](services/data_services/ingestion_service.py#L9))
3. `fetch_data()` chooses API path ([data_fetcher.py#L19](services/data_services/data_fetcher.py#L19))
4. `_fetch_api_data()` does HTTP GET ([data_fetcher.py#L7](services/data_services/data_fetcher.py#L7))
5. `parse_data()` converts bytes → DataFrame by content-type ([format_parser.py#L4](services/data_services/format_parser.py#L4))
6. `generate_metadata()` adds row/column/source info ([metadata_generator.py#L23](services/data_services/metadata_generator.py#L23))
7. `store_dataset()` versions + saves in Mongo ([db_store.py#L71](db/db_store.py#L71))
8. API returns `status`, `source_id`, `version`, `document_id`, `ingested_at` ([ingestion_service.py#L45-L50](services/data_services/ingestion_service.py#L45-L50))

### Flow 2: Configured source (`source_id`)
1. `POST /ingest?source_id=...`
2. `get_source_config()` fetches config ([db_store.py#L102](db/db_store.py#L102))
3. `fetch_data()` branches on `source_type` ([data_fetcher.py#L17](services/data_services/data_fetcher.py#L17)):
   - `api`: HTTP fetch
   - `sftp`: `fetch_sftp_data()` ([data_fetcher.py#L27](services/data_services/data_fetcher.py#L27))
4. SFTP path does:
   - config validation ([sftp_fetcher.py#L43](services/data_services/sftp_fetcher.py#L43))
   - key loading ([sftp_fetcher.py#L8](services/data_services/sftp_fetcher.py#L8))
   - strict host-key policy with `RejectPolicy` ([sftp_fetcher.py#L68](services/data_services/sftp_fetcher.py#L68))
   - remote file read ([sftp_fetcher.py#L99-L100](services/data_services/sftp_fetcher.py#L99-L100))
5. Then same parse → metadata → store path as above.

---

## 5) Important behavior notes

- Supported formats by content-type: JSON, CSV, Excel, TSV ([format_parser.py#L4-L24](services/data_services/format_parser.py#L4-L24)).
- If content-type is unknown, ingestion fails with `Unsupported format` ([format_parser.py#L24](services/data_services/format_parser.py#L24)).
- Secret-like keys in source config are redacted in metadata (`password`, `passphrase`, `private_key_path`, etc.) ([metadata_generator.py#L4](services/data_services/metadata_generator.py#L4)).
- Current implementation stores full row payload as JSON array inside Mongo `datasets.data` (can become large over time).
