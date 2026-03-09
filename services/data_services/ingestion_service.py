import asyncio

from services.data_services.data_fetcher import fetch_data
from services.data_services.format_parser import parse_data
from services.data_services.metadata_generator import generate_metadata
from db.db_store import store_dataset, get_source_config


async def run_ingestion(source_id=None, url=None):

    if not url:
        if not source_id:
            raise ValueError("Either source_id or url is required")

        source_config = await get_source_config(source_id)

        if not source_config:
            raise ValueError(f"Source config not found for: {source_id}")

        url = source_config.get("api_endpoint") or source_config.get("url")

        if not url:
            raise ValueError("Source config is missing api_endpoint/url")

    raw_data, headers = await fetch_data(url)

    df = await asyncio.to_thread(parse_data, raw_data, headers.get("content-type", ""))

    metadata = generate_metadata(url, df)
    if source_id:
        metadata["source_id"] = source_id

    storage_result = await store_dataset(metadata, df, source_id=source_id)

    return {
        "status": "success",
        "source_id": storage_result["source_id"],
        "version": storage_result["version"],
        "document_id": storage_result["document_id"],
        "ingested_at": storage_result["ingested_at"],
    }