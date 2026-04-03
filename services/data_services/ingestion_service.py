import asyncio

from services.data_services.data_fetcher import fetch_data
from services.data_services.format_parser import parse_data
from services.data_services.metadata_generator import generate_metadata
from db.db_store import store_dataset, get_source_config


async def run_ingestion(source_id=None, url=None, owner_user_id: str | None = None):
    if not owner_user_id:
        raise ValueError("owner_user_id is required")

    source_config = None
    source_type = "api"
    source_descriptor = url

    if not url:
        if not source_id:
            raise ValueError("Either source_id or url is required")

        source_config = await get_source_config(source_id, owner_user_id=owner_user_id)

        if not source_config:
            raise ValueError(f"Source config not found for: {source_id}")

        source_type = source_config.get("source_type", "api")
        source_descriptor = source_config.get("api_endpoint") or source_config.get("url")
        if source_type == "sftp":
            sftp_config = source_config.get("sftp") or source_config
            source_descriptor = sftp_config.get("remote_path")

        raw_data, headers = await fetch_data(source_config=source_config)

    else:
        raw_data, headers = await fetch_data(url=url, source_config={"source_type": "api"})

    if not raw_data:
        raise ValueError("No data fetched from source")

    df = await asyncio.to_thread(
        parse_data,
        raw_data,
        headers.get("content-type", ""),
        source_descriptor or "",
    )

    metadata = generate_metadata(
        source_descriptor,
        df,
        source_type=source_type,
        source_details=source_config,
        response_headers=headers,
    )
    if source_id:
        metadata["source_id"] = source_id

    storage_result = await store_dataset(metadata, df, source_id=source_id, owner_user_id=owner_user_id)

    return {
        "status": "success",
        "source_id": storage_result["source_id"],
        "version": storage_result["version"],
        "document_id": storage_result["document_id"],
        "ingested_at": storage_result["ingested_at"],
    }


async def run_uploaded_file_ingestion(
    *,
    file_bytes: bytes,
    file_name: str,
    content_type: str,
    source_id: str,
    owner_user_id: str,
    source_details: dict | None = None,
):
    if not file_bytes:
        raise ValueError("Uploaded file is empty")

    source_descriptor = file_name or "uploaded_file"

    df = await asyncio.to_thread(
        parse_data,
        file_bytes,
        content_type or "",
        source_descriptor,
    )

    metadata = generate_metadata(
        source_descriptor,
        df,
        source_type="upload",
        source_details=source_details or {"source_type": "upload"},
        response_headers={"content-type": content_type or ""},
    )
    metadata["source_id"] = source_id

    storage_result = await store_dataset(metadata, df, source_id=source_id, owner_user_id=owner_user_id)

    return {
        "status": "success",
        "source_id": storage_result["source_id"],
        "version": storage_result["version"],
        "document_id": storage_result["document_id"],
        "ingested_at": storage_result["ingested_at"],
    }