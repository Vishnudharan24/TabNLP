## Plan: Scalable Backend Query Optimization

Improve backend query throughput and latency incrementally without breaking the current `columns` + `rows` API contract. The plan focuses first on low-risk wins (bounded caching, filter/sort efficiencies, relationship planning cache), then on structural improvements (row projection + join/aggregation data structures), and finally optional vectorized execution for very large datasets.

### Steps
1. Baseline hotspots and add stage timers in [backend/services/query_engine/query_parser.py](backend/services/query_engine/query_parser.py), [backend/services/query_pipeline/aggregation_executor.py](backend/services/query_pipeline/aggregation_executor.py), and [backend/main.py](backend/main.py) around `run_query()`, `execute_aggregation()`, and `/query`.
2. Replace unbounded query cache in [backend/services/query_engine/query_parser.py](backend/services/query_engine/query_parser.py) with bounded LRU+TTL, in-flight dedupe per cache key, and metrics for `cacheHit`/evictions.
3. Optimize filter and sort paths in [backend/services/query_pipeline/aggregation_executor.py](backend/services/query_pipeline/aggregation_executor.py) using precompiled filter operands and top-k selection (`limit`) before full sort where possible.
4. Introduce scalable join/aggregation data structures in [backend/services/query_pipeline/aggregation_executor.py](backend/services/query_pipeline/aggregation_executor.py): hash maps for join keys, row references (not dict copies), and fixed accumulator structs for grouped measures.
5. Reduce repeated planning/DB overhead in [backend/services/query_pipeline/relationship_resolver.py](backend/services/query_pipeline/relationship_resolver.py) and [backend/db/db_store.py](backend/db/db_store.py) by caching relationship adjacency maps and batching shared-dataset resolution calls.
6. Add guarded parallel execution for large workloads: process-pool partial aggregation merge (feature flag) in query pipeline modules, while avoiding thread-per-row CPU work due GIL; keep async parallelism for independent I/O only.

### Further Considerations
1. Rollout strategy: direct cutover for Phase 1 only.
2. Concurrency threshold question: use process pool only above row-count/complexity threshold to avoid overhead on small datasets? yes

