import os
from pathlib import Path
from datetime import datetime, timezone

from pymongo import ReturnDocument
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "ingestion_db")

client = AsyncIOMotorClient(MONGODB_URI)
db = client[MONGODB_DB_NAME]
collection = db["datasets"]
source_config_collection = db["source_config"]
version_counters_collection = db["dataset_version_counters"]

_indexes_initialized = False


async def ensure_indexes():
    global _indexes_initialized
    if _indexes_initialized:
        return

    await collection.create_index(
        [("source_key", 1), ("version", 1)],
        unique=True,
        name="source_key_version_unique",
    )
    await collection.create_index(
        [("source_key", 1), ("is_latest", 1)],
        name="source_key_is_latest_idx",
    )
    await collection.create_index(
        [("source_key", 1), ("ingested_at", -1)],
        name="source_key_ingested_at_idx",
    )
    await source_config_collection.create_index(
        [("source_id", 1)],
        unique=True,
        name="source_config_source_id_unique",
    )

    _indexes_initialized = True


def _normalize_source_key(source_id, metadata):
    if source_id:
        return source_id

    source_url = (metadata or {}).get("source")
    if source_url:
        return f"url::{source_url}"

    return "unknown_source"


async def get_next_version(source_key: str):
    counter_doc = await version_counters_collection.find_one_and_update(
        {"_id": source_key},
        {"$inc": {"current_version": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return counter_doc["current_version"]

async def store_dataset(metadata, df, source_id=None):
    source_key = _normalize_source_key(source_id, metadata)
    version = await get_next_version(source_key)
    ingested_at = datetime.now(timezone.utc)

    document = {
        "source_id": source_id,
        "source_key": source_key,
        "version": version,
        "is_latest": True,
        "ingested_at": ingested_at,
        "metadata": metadata,
        "data": df.to_dict("records")
    }

    await collection.update_many(
        {"source_key": source_key, "is_latest": True},
        {"$set": {"is_latest": False}},
    )

    insert_result = await collection.insert_one(document)

    return {
        "document_id": str(insert_result.inserted_id),
        "source_key": source_key,
        "source_id": source_id,
        "version": version,
        "ingested_at": ingested_at,
    }


async def get_source_config(source_key: str):
    query_options = [
        {"source_id": source_key},
        {"name": source_key},
    ]

    return await source_config_collection.find_one({"$or": query_options})


async def list_source_configs(limit: int = 200):
    cursor = source_config_collection.find({}).sort("source_id", 1).limit(limit)
    return await cursor.to_list(length=limit)


async def unset_source_config_fields(source_id: str, fields: list[str]):
    if not fields:
        return {"matched_count": 0, "modified_count": 0}

    result = await source_config_collection.update_one(
        {"source_id": source_id},
        {"$unset": {field: "" for field in fields}},
    )

    return {
        "matched_count": result.matched_count,
        "modified_count": result.modified_count,
    }


async def upsert_source_config(
    source_id: str,
    name: str,
    api_endpoint: str = None,
    source_type: str = "api",
    sftp: dict = None,
    url: str = None,
):
    set_document = {
        "source_id": source_id,
        "name": name,
        "source_type": source_type,
    }

    if api_endpoint:
        set_document["api_endpoint"] = api_endpoint
    if url:
        set_document["url"] = url
    if sftp:
        set_document["sftp"] = sftp

    result = await source_config_collection.update_one(
        {"source_id": source_id},
        {
            "$set": set_document
        },
        upsert=True,
    )

    return {
        "matched_count": result.matched_count,
        "modified_count": result.modified_count,
        "upserted_id": str(result.upserted_id) if result.upserted_id else None,
    }