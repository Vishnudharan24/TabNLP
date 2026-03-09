## Plan: Extend Ingestion from API to SFTP

Add SFTP as a second source type by extending the source-config contract, introducing a fetch dispatcher, and adding an SFTP adapter while keeping parse/store logic unchanged. This minimizes risk, preserves current API ingestion behavior, and fits your async architecture by isolating blocking work or using async-native SFTP operations.

### Steps
1. Define source-type contract in [db/db_store.py](db/db_store.py) for `upsert_source_config()` and `get_source_config()`.
2. Refactor `fetch_data()` in [services/data_services/data_fetcher.py](services/data_services/data_fetcher.py) into source-type dispatcher (`api`/`sftp`).
3. Add SFTP adapter in [services/data_services/sftp_fetcher.py](services/data_services/sftp_fetcher.py) with host-key verification and file retrieval.
4. Update `run_ingestion()` in [services/data_services/ingestion_service.py](services/data_services/ingestion_service.py) to pass full source config to `fetch_data()`.
5. Extend metadata provenance in [services/data_services/metadata_generator.py](services/data_services/metadata_generator.py) to include redacted source details.
6. Expand test config and ingestion routes in [main.py](main.py) for SFTP source registration and trigger flow.

### Further Considerations
1. Authentication choice: Option A key-based only / Option B key+password / Option C password fallback with strict policy.
2. SFTP library choice: Option A async-native (`asyncssh`) / Option B `paramiko` wrapped in threadpool.
3. File selection behavior: Option A exact remote path / Option B latest matching pattern / Option C date-partitioned convention.

Reply with your preferred options (A/B/C for each), and I’ll refine this draft plan.

use 
1. A
2. B (paramiko)
3. A
