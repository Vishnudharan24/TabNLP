# API Outputs — Inputs and Outputs

This document explains what each endpoint in `backend/main.py` does, along with its input and output.

## Core pattern
Most endpoints return:
- `status`: `"success"` on success
- data payload (`item`, `items`, `source_config`, `analytics`, etc.)
- On failure: HTTP error with `detail`

---

## 1) `POST /ingest`
### Input
Query params:
- `source_id` (optional)
- `url` (optional)

### Output
- Returns ingestion result from `run_ingestion(...)` (typically metadata about fetched/parsed/stored dataset).
- Error:
  - `400` for validation issues
  - `500` for server issues

---

## 2) `POST /ingest/source/{source_id}`
### Input
- Path param: `source_id` (required)

### Output
- Same ingestion result as above, but forced by source config.
- Same error pattern (`400` / `500`).

---

## 3) `POST /source-config`
### Input
JSON body (`SourceConfigUpsertRequest`):
- `source_id` (required)
- `name` (required)
- `source_type`: `"api"` or `"sftp"` (required)
- `api_endpoint` / `url` (for API source)
- `sftp` object (for SFTP source):
  - `host`, `port`, `username`, `private_key_path`, `remote_path`, optional `passphrase`, `known_hosts_path`

### Output
```json
{
  "status": "success",
  "source_config": { "...": "serialized config" },
  "db_result": { "...": "db write result" }
}
```

---

## 4) `GET /source-config`
### Input
- Query param: `limit` (default `200`)

### Output
```json
{
  "status": "success",
  "count": 0,
  "items": []
}
```

---

## 5) `GET /source-config/{source_id}`
### Input
- Path param: `source_id`

### Output
```json
{
  "status": "success",
  "source_config": { "...": "config" }
}
```
- `404` if not found.

---

## 6) `PATCH /source-config/{source_id}`
### Input
- Path param: `source_id`
- JSON body (`SourceConfigPatchRequest`) with any subset of:
  - `name`, `source_type`, `api_endpoint`, `url`, `sftp`

### Output
```json
{
  "status": "success",
  "source_config": { "...": "updated config" },
  "db_result": { "...": "db write result" }
}
```

---

## 7) `GET /datasets/latest`
### Input
- Query param: `limit` (default `100`)

### Output
```json
{
  "status": "success",
  "count": 0,
  "items": []
}
```

---

## 8) `GET /datasets`
### Input
- Query param: `limit` (default `1000`)

### Output
```json
{
  "status": "success",
  "count": 0,
  "items": []
}
```

---

## 9) `GET /datasets/latest/{source_id}`
### Input
- Path param: `source_id`

### Output
```json
{
  "status": "success",
  "item": { "...": "latest dataset for source" }
}
```
- `404` if none.

---

## 10) `GET /datasets/{document_id}`
### Input
- Path param: `document_id`

### Output
```json
{
  "status": "success",
  "item": { "...": "dataset document" }
}
```
- `404` if not found.

---

## Test endpoints

## 12) `GET /test/excel`
### Input
- None

### Output
- Returns Excel file as download (`.xlsx`).
- `404` if local file missing.

---

## 13) `POST /test/source-config/excel`
### Input
- Query param: `source_id` (default `"local_excel_test"`)

### Output
```json
{
  "status": "success",
  "source_id": "...",
  "api_endpoint": ".../test/excel",
  "db_result": { "...": "db write result" }
}
```

---

## 14) `POST /test/source-config/sftp`
### Input
Query params (all optional with defaults):
- `source_id`, `host`, `port`, `username`, `private_key_path`, `passphrase`, `remote_path`, `known_hosts_path`

### Output
```json
{
  "status": "success",
  "source_id": "...",
  "source_type": "sftp",
  "remote_path": "...",
  "db_result": { "...": "db write result" }
}
```

---

## 15) `POST /test/ingest/excel`
### Input
- Query param: `source_id` (default `"local_excel_test"`)

### Output
- Returns ingestion result from `run_ingestion(...)`.

---

## 16) `POST /test/ingest/sftp`
### Input
- Query param: `source_id` (default `"local_sftp_test"`)

### Output
- Returns ingestion result from `run_ingestion(...)`.
