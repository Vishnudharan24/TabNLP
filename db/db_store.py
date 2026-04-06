import os
import asyncio
import time
from collections import OrderedDict
from pathlib import Path
from datetime import datetime, timezone
from bson import ObjectId

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
users_collection = db["users"]
relationships_collection = db["relationships"]
reports_collection = db["reports"]
report_shares_collection = db["report_shares"]

_indexes_initialized = False

_DATASET_QUERY_CACHE_TTL_SECONDS = max(1, int(os.getenv("DATASET_QUERY_CACHE_TTL_SECONDS", "60")))
_DATASET_QUERY_CACHE_MAX_ENTRIES = max(1, int(os.getenv("DATASET_QUERY_CACHE_MAX_ENTRIES", "128")))
_DATASET_VERSIONED_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_DATASET_ALIAS_TO_VERSIONED_KEY: dict[str, str] = {}


def _now_seconds() -> float:
    return time.time()


def _make_dataset_alias_key(owner_user_id: str, dataset_id: str) -> str:
    return f"{str(owner_user_id)}::{str(dataset_id)}"


def _make_dataset_versioned_key(owner_user_id: str, document: dict) -> str:
    document_id = str(document.get("_id") or document.get("document_id") or "")
    version = str(document.get("version") or document.get("ingested_at") or "latest")
    return f"{str(owner_user_id)}::{document_id}::v::{version}"


def _dataset_cache_prune_expired(now_seconds: float | None = None):
    now_ts = _now_seconds() if now_seconds is None else now_seconds
    expired_keys = []
    for key, item in _DATASET_VERSIONED_CACHE.items():
        if (now_ts - float(item.get("created_at") or 0.0)) > _DATASET_QUERY_CACHE_TTL_SECONDS:
            expired_keys.append(key)

    if not expired_keys:
        return

    for key in expired_keys:
        _DATASET_VERSIONED_CACHE.pop(key, None)

    expired_set = set(expired_keys)
    stale_aliases = [alias for alias, versioned_key in _DATASET_ALIAS_TO_VERSIONED_KEY.items() if versioned_key in expired_set]
    for alias in stale_aliases:
        _DATASET_ALIAS_TO_VERSIONED_KEY.pop(alias, None)


def _dataset_cache_get_by_alias(owner_user_id: str, dataset_id: str):
    _dataset_cache_prune_expired()
    alias_key = _make_dataset_alias_key(owner_user_id, dataset_id)
    versioned_key = _DATASET_ALIAS_TO_VERSIONED_KEY.get(alias_key)
    if not versioned_key:
        return None

    item = _DATASET_VERSIONED_CACHE.get(versioned_key)
    if not item:
        _DATASET_ALIAS_TO_VERSIONED_KEY.pop(alias_key, None)
        return None

    _DATASET_VERSIONED_CACHE.move_to_end(versioned_key)
    return item.get("document")


def _dataset_cache_set(owner_user_id: str, dataset_id: str, document: dict | None):
    if not document:
        return

    _dataset_cache_prune_expired()
    alias_key = _make_dataset_alias_key(owner_user_id, dataset_id)
    versioned_key = _make_dataset_versioned_key(owner_user_id, document)

    _DATASET_VERSIONED_CACHE[versioned_key] = {
        "created_at": _now_seconds(),
        "document": document,
    }
    _DATASET_VERSIONED_CACHE.move_to_end(versioned_key)
    _DATASET_ALIAS_TO_VERSIONED_KEY[alias_key] = versioned_key

    while len(_DATASET_VERSIONED_CACHE) > _DATASET_QUERY_CACHE_MAX_ENTRIES:
        evicted_key, _ = _DATASET_VERSIONED_CACHE.popitem(last=False)
        stale_aliases = [alias for alias, mapped_key in _DATASET_ALIAS_TO_VERSIONED_KEY.items() if mapped_key == evicted_key]
        for alias in stale_aliases:
            _DATASET_ALIAS_TO_VERSIONED_KEY.pop(alias, None)


def _dataset_cache_invalidate_owner(owner_user_id: str):
    owner_prefix = f"{str(owner_user_id)}::"

    versioned_to_remove = [key for key in _DATASET_VERSIONED_CACHE.keys() if key.startswith(owner_prefix)]
    for key in versioned_to_remove:
        _DATASET_VERSIONED_CACHE.pop(key, None)

    alias_to_remove = [key for key in _DATASET_ALIAS_TO_VERSIONED_KEY.keys() if key.startswith(owner_prefix)]
    for key in alias_to_remove:
        _DATASET_ALIAS_TO_VERSIONED_KEY.pop(key, None)


def _extract_dataset_rows(document: dict | None):
    if not isinstance(document, dict):
        return []

    primary_rows = document.get("data")
    if isinstance(primary_rows, list):
        return primary_rows

    legacy_rows = document.get("rows")
    if isinstance(legacy_rows, list):
        return legacy_rows

    legacy_records = document.get("records")
    if isinstance(legacy_records, list):
        return legacy_records

    metadata = document.get("metadata") if isinstance(document.get("metadata"), dict) else {}
    metadata_rows = metadata.get("rows")
    if isinstance(metadata_rows, list):
        return metadata_rows

    return []


def _normalize_dataset_document(document: dict | None):
    if not isinstance(document, dict):
        return document

    normalized = dict(document)
    rows = _extract_dataset_rows(normalized)
    normalized["data"] = rows

    metadata = normalized.get("metadata")
    if isinstance(metadata, dict):
        normalized_metadata = dict(metadata)
        normalized_metadata["row_count"] = len(rows)
        normalized["metadata"] = normalized_metadata

    return normalized


async def ensure_indexes():
    global _indexes_initialized
    if _indexes_initialized:
        return

    # Drop legacy global indexes that break tenant scoping.
    try:
        await collection.drop_index("source_key_version_unique")
    except Exception:
        pass
    try:
        await source_config_collection.drop_index("source_config_source_id_unique")
    except Exception:
        pass

    await collection.create_index(
        [("owner_user_id", 1), ("source_key", 1), ("version", 1)],
        unique=True,
        partialFilterExpression={"owner_user_id": {"$exists": True}},
        name="datasets_owner_source_key_version_unique",
    )
    await collection.create_index(
        [("owner_user_id", 1), ("source_key", 1), ("is_latest", 1)],
        name="datasets_owner_source_key_is_latest_idx",
    )
    await collection.create_index(
        [("owner_user_id", 1), ("source_key", 1), ("ingested_at", -1)],
        name="datasets_owner_source_key_ingested_at_idx",
    )
    await collection.create_index(
        [("owner_user_id", 1), ("ingested_at", -1)],
        name="datasets_owner_ingested_at_idx",
    )
    await source_config_collection.create_index(
        [("owner_user_id", 1), ("source_id", 1)],
        unique=True,
        partialFilterExpression={"owner_user_id": {"$exists": True}},
        name="source_config_owner_source_id_unique",
    )
    await source_config_collection.create_index(
        [("owner_user_id", 1), ("name", 1)],
        name="source_config_owner_name_idx",
    )
    await users_collection.create_index(
        [("email", 1)],
        unique=True,
        name="users_email_unique",
    )
    await relationships_collection.create_index(
        [("from_table", 1), ("from_column", 1), ("to_table", 1), ("to_column", 1)],
        unique=True,
        name="relationships_unique",
    )
    await relationships_collection.create_index(
        [("from_table", 1)],
        name="relationships_from_table_idx",
    )
    await reports_collection.create_index(
        [("owner_user_id", 1), ("updated_at", -1)],
        name="reports_owner_updated_idx",
    )
    await report_shares_collection.create_index(
        [("report_id", 1), ("token_hash", 1)],
        unique=True,
        name="report_shares_report_token_unique",
    )
    await report_shares_collection.create_index(
        [("expires_at", 1)],
        expireAfterSeconds=0,
        name="report_shares_expires_ttl",
    )
    await report_shares_collection.create_index(
        [("recipient_user_ids", 1), ("report_id", 1), ("expires_at", -1)],
        name="report_shares_recipient_report_idx",
    )

    _indexes_initialized = True


def _normalize_source_key(source_id, metadata):
    if source_id:
        return source_id

    source_url = (metadata or {}).get("source")
    if source_url:
        return f"url::{source_url}"

    return "unknown_source"


def _version_counter_key(source_key: str, owner_user_id: str):
    return f"{owner_user_id}::{source_key}"


async def get_next_version(source_key: str, owner_user_id: str):
    counter_doc = await version_counters_collection.find_one_and_update(
        {"_id": _version_counter_key(source_key, owner_user_id)},
        {"$inc": {"current_version": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return counter_doc["current_version"]

async def store_dataset(metadata, df, source_id=None, owner_user_id: str | None = None):
    if not owner_user_id:
        raise ValueError("owner_user_id is required")

    source_key = _normalize_source_key(source_id, metadata)
    version = await get_next_version(source_key, owner_user_id=owner_user_id)
    ingested_at = datetime.now(timezone.utc)

    document = {
        "source_id": source_id,
        "owner_user_id": owner_user_id,
        "source_key": source_key,
        "version": version,
        "is_latest": True,
        "ingested_at": ingested_at,
        "metadata": metadata,
        "data": df.to_dict("records")
    }

    await collection.update_many(
        {"owner_user_id": owner_user_id, "source_key": source_key, "is_latest": True},
        {"$set": {"is_latest": False}},
    )

    insert_result = await collection.insert_one(document)
    _dataset_cache_invalidate_owner(owner_user_id)

    return {
        "document_id": str(insert_result.inserted_id),
        "source_key": source_key,
        "source_id": source_id,
        "owner_user_id": owner_user_id,
        "version": version,
        "ingested_at": ingested_at,
    }


async def get_source_config(source_key: str, owner_user_id: str):
    query_options = [
        {"source_id": source_key},
        {"name": source_key},
    ]

    return await source_config_collection.find_one(
        {"owner_user_id": owner_user_id, "$or": query_options}
    )


async def list_source_configs(owner_user_id: str, limit: int = 200):
    cursor = source_config_collection.find({"owner_user_id": owner_user_id}).sort("source_id", 1).limit(limit)
    return await cursor.to_list(length=limit)


async def unset_source_config_fields(source_id: str, owner_user_id: str, fields: list[str]):
    if not fields:
        return {"matched_count": 0, "modified_count": 0}

    result = await source_config_collection.update_one(
        {"source_id": source_id, "owner_user_id": owner_user_id},
        {"$unset": {field: "" for field in fields}},
    )

    return {
        "matched_count": result.matched_count,
        "modified_count": result.modified_count,
    }


async def list_latest_datasets(owner_user_id: str, limit: int = 100):
    own_cursor = collection.find({"owner_user_id": owner_user_id, "is_latest": True}).sort("ingested_at", -1).limit(limit)
    own_docs = [_normalize_dataset_document(doc) for doc in await own_cursor.to_list(length=limit)]
    shared_docs = await _list_shared_datasets_for_recipient(owner_user_id, latest_only=True)
    return _merge_and_sort_datasets(own_docs, shared_docs, limit=limit)


async def list_datasets(owner_user_id: str, limit: int = 1000):
    own_cursor = collection.find({"owner_user_id": owner_user_id}).sort([("ingested_at", -1)]).limit(limit)
    own_docs = [_normalize_dataset_document(doc) for doc in await own_cursor.to_list(length=limit)]
    shared_docs = await _list_shared_datasets_for_recipient(owner_user_id, latest_only=False)
    return _merge_and_sort_datasets(own_docs, shared_docs, limit=limit)


async def get_latest_dataset_by_source(source_id: str, owner_user_id: str):
    own_doc = await collection.find_one(
        {"owner_user_id": owner_user_id, "source_key": source_id, "is_latest": True},
        sort=[("ingested_at", -1)],
    )
    if own_doc:
        return _normalize_dataset_document(own_doc)

    shared_docs = await _list_shared_datasets_for_recipient(owner_user_id, latest_only=True)
    matching = [doc for doc in shared_docs if str(doc.get("source_key") or "") == str(source_id or "")]
    if not matching:
        return None
    matching.sort(key=lambda item: item.get("ingested_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return _normalize_dataset_document(matching[0])


async def get_dataset_by_id(document_id: str, owner_user_id: str):
    if ObjectId.is_valid(document_id):
        own_doc = await collection.find_one({"_id": ObjectId(document_id), "owner_user_id": owner_user_id})
        if own_doc:
            return _normalize_dataset_document(own_doc)

    shared_doc = await _resolve_shared_dataset_for_recipient(owner_user_id, document_id)
    return _normalize_dataset_document(shared_doc)


async def delete_dataset_by_id(document_id: str, owner_user_id: str):
    if not ObjectId.is_valid(document_id):
        return {
            "deleted_count": 0,
            "source_key": None,
            "promoted_latest_document_id": None,
        }

    target = await collection.find_one({"_id": ObjectId(document_id), "owner_user_id": owner_user_id})
    if not target:
        return {
            "deleted_count": 0,
            "source_key": None,
            "promoted_latest_document_id": None,
        }

    source_key = str(target.get("source_key") or "")
    was_latest = bool(target.get("is_latest"))

    delete_result = await collection.delete_one({"_id": target.get("_id"), "owner_user_id": owner_user_id})
    if delete_result.deleted_count > 0:
        _dataset_cache_invalidate_owner(owner_user_id)

    promoted_latest_document_id = None
    if delete_result.deleted_count > 0 and was_latest and source_key:
        candidate = await collection.find_one(
            {"owner_user_id": owner_user_id, "source_key": source_key},
            sort=[("ingested_at", -1)],
        )
        if candidate:
            await collection.update_one(
                {"_id": candidate.get("_id"), "owner_user_id": owner_user_id},
                {"$set": {"is_latest": True}},
            )
            promoted_latest_document_id = str(candidate.get("_id"))

    return {
        "deleted_count": int(delete_result.deleted_count),
        "source_key": source_key or None,
        "promoted_latest_document_id": promoted_latest_document_id,
    }


async def get_dataset_for_query(dataset_id: str, owner_user_id: str):
    """
    Resolve dataset by document id first, then by source_key/source_id latest snapshot.
    """
    if not dataset_id:
        return None

    cached = _dataset_cache_get_by_alias(owner_user_id, dataset_id)
    if cached:
        return cached

    if ObjectId.is_valid(dataset_id):
        by_id = await collection.find_one({"_id": ObjectId(dataset_id), "owner_user_id": owner_user_id})
        if by_id:
            normalized = _normalize_dataset_document(by_id)
            _dataset_cache_set(owner_user_id, dataset_id, normalized)
            return normalized

    by_source_key_latest = await collection.find_one(
        {"owner_user_id": owner_user_id, "source_key": dataset_id, "is_latest": True},
        sort=[("ingested_at", -1)],
    )
    if by_source_key_latest:
        normalized = _normalize_dataset_document(by_source_key_latest)
        _dataset_cache_set(owner_user_id, dataset_id, normalized)
        return normalized

    by_source_id_latest = await collection.find_one(
        {"owner_user_id": owner_user_id, "source_id": dataset_id, "is_latest": True},
        sort=[("ingested_at", -1)],
    )
    if by_source_id_latest:
        normalized = _normalize_dataset_document(by_source_id_latest)
        _dataset_cache_set(owner_user_id, dataset_id, normalized)
        return normalized

    shared_doc = await _resolve_shared_dataset_for_recipient(owner_user_id, dataset_id)
    if shared_doc:
        normalized = _normalize_dataset_document(shared_doc)
        _dataset_cache_set(owner_user_id, dataset_id, normalized)
        return normalized

    return None


def _extract_report_dataset_ids(report_doc: dict | None):
    if not isinstance(report_doc, dict):
        return set()

    dataset_ids = set()
    selected = str(report_doc.get("selected_dataset_id") or "").strip()
    if selected:
        dataset_ids.add(selected)

    charts = report_doc.get("charts") or []
    if isinstance(charts, list):
        for chart in charts:
            if not isinstance(chart, dict):
                continue
            chart_dataset = str(chart.get("datasetId") or chart.get("dataset_id") or "").strip()
            if chart_dataset:
                dataset_ids.add(chart_dataset)

    return dataset_ids


def _merge_and_sort_datasets(primary_docs: list[dict], secondary_docs: list[dict], limit: int):
    merged = {}
    for doc in (primary_docs or []):
        if not doc:
            continue
        merged[str(doc.get("_id"))] = doc
    for doc in (secondary_docs or []):
        if not doc:
            continue
        merged.setdefault(str(doc.get("_id")), doc)

    items = list(merged.values())
    items.sort(key=lambda item: item.get("ingested_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return items[: max(0, int(limit or 0))]


async def _list_shared_datasets_for_recipient(recipient_user_id: str, latest_only: bool):
    now = datetime.now(timezone.utc)
    share_cursor = report_shares_collection.find(
        {
            "recipient_user_ids": str(recipient_user_id),
            "revoked": {"$ne": True},
            "$or": [
                {"expires_at": None},
                {"expires_at": {"$gt": now}},
            ],
        },
        {"report_id": 1},
    )
    shares = await share_cursor.to_list(length=5000)
    report_id_strings = sorted({str(item.get("report_id") or "").strip() for item in shares if str(item.get("report_id") or "").strip()})
    report_object_ids = [ObjectId(report_id) for report_id in report_id_strings if ObjectId.is_valid(report_id)]
    if not report_object_ids:
        return []

    reports = await reports_collection.find({"_id": {"$in": report_object_ids}}).to_list(length=5000)

    owner_to_dataset_ids: dict[str, set[str]] = {}
    for report in reports:
        owner = str(report.get("owner_user_id") or "").strip()
        if not owner:
            continue
        ids = _extract_report_dataset_ids(report)
        if not ids:
            continue
        owner_to_dataset_ids.setdefault(owner, set()).update(ids)

    resolved_docs = []
    seen_ids = set()

    semaphore = asyncio.Semaphore(24)

    async def _resolve_single(owner_user_id: str, dataset_id: str):
        async with semaphore:
            return await _resolve_dataset_for_owner(dataset_id, owner_user_id, latest_only=latest_only)

    tasks = []
    for owner_user_id, dataset_ids in owner_to_dataset_ids.items():
        for dataset_id in dataset_ids:
            tasks.append(_resolve_single(owner_user_id, dataset_id))

    if tasks:
        resolved_items = await asyncio.gather(*tasks, return_exceptions=True)
        for doc in resolved_items:
            if not doc or isinstance(doc, Exception):
                continue
            key = str(doc.get("_id"))
            if key in seen_ids:
                continue
            seen_ids.add(key)
            resolved_docs.append(_normalize_dataset_document(doc))

    return resolved_docs


async def _resolve_dataset_for_owner(dataset_id: str, owner_user_id: str, latest_only: bool = False):
    dataset_key = str(dataset_id or "").strip()
    if not dataset_key:
        return None

    if ObjectId.is_valid(dataset_key):
        query = {"_id": ObjectId(dataset_key), "owner_user_id": owner_user_id}
        if latest_only:
            query["is_latest"] = True
        by_id = await collection.find_one(query)
        if by_id:
            return _normalize_dataset_document(by_id)

    source_query_base = {"owner_user_id": owner_user_id, "source_key": dataset_key}
    source_id_query_base = {"owner_user_id": owner_user_id, "source_id": dataset_key}
    if latest_only:
        source_query_base["is_latest"] = True
        source_id_query_base["is_latest"] = True

    by_source_key = await collection.find_one(source_query_base, sort=[("ingested_at", -1)])
    if by_source_key:
        return _normalize_dataset_document(by_source_key)

    by_source_id = await collection.find_one(source_id_query_base, sort=[("ingested_at", -1)])
    if by_source_id:
        return _normalize_dataset_document(by_source_id)

    return None


async def _resolve_shared_dataset_for_recipient(recipient_user_id: str, dataset_id: str):
    now = datetime.now(timezone.utc)
    share_cursor = report_shares_collection.find(
        {
            "recipient_user_ids": str(recipient_user_id),
            "revoked": {"$ne": True},
            "$or": [
                {"expires_at": None},
                {"expires_at": {"$gt": now}},
            ],
        },
        {"report_id": 1},
    )
    shares = await share_cursor.to_list(length=5000)
    report_ids = [ObjectId(str(item.get("report_id"))) for item in shares if ObjectId.is_valid(str(item.get("report_id") or ""))]
    if not report_ids:
        return None

    reports = await reports_collection.find({"_id": {"$in": report_ids}}).to_list(length=5000)
    dataset_key = str(dataset_id or "").strip()
    if not dataset_key:
        return None

    for report in reports:
        dataset_ids = _extract_report_dataset_ids(report)
        if dataset_key not in dataset_ids:
            continue
        owner = str(report.get("owner_user_id") or "").strip()
        if not owner:
            continue
        doc = await _resolve_dataset_for_owner(dataset_key, owner, latest_only=False)
        if doc:
            return doc

    return None


async def list_relationships(limit: int = 1000):
    cursor = relationships_collection.find({}).limit(limit)
    return await cursor.to_list(length=limit)


async def upsert_relationship(from_table: str, from_column: str, to_table: str, to_column: str):
    result = await relationships_collection.update_one(
        {
            "from_table": from_table,
            "from_column": from_column,
            "to_table": to_table,
            "to_column": to_column,
        },
        {
            "$set": {
                "from_table": from_table,
                "from_column": from_column,
                "to_table": to_table,
                "to_column": to_column,
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {
                "created_at": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )

    return {
        "matched_count": result.matched_count,
        "modified_count": result.modified_count,
        "upserted_id": str(result.upserted_id) if result.upserted_id else None,
    }


async def upsert_source_config(
    source_id: str,
    owner_user_id: str,
    name: str,
    api_endpoint: str = None,
    source_type: str = "api",
    sftp: dict = None,
    url: str = None,
):
    set_document = {
        "owner_user_id": owner_user_id,
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
        {"source_id": source_id, "owner_user_id": owner_user_id},
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


def _extract_user_id_from_compound_source_id(source_id: str | None):
    text = (source_id or "").strip()
    if not text:
        return None

    # merged::<user_id>::name or upload::<user_id>::filename
    parts = text.split("::")
    if len(parts) >= 2 and ObjectId.is_valid(parts[1]):
        return parts[1]

    return None


async def backfill_owner_user_ids(dry_run: bool = True, sample_size: int = 20):
    users = await users_collection.find({}, {"email": 1, "name": 1}).to_list(length=100000)
    users_by_id = {str(user.get("_id")): user for user in users}
    users_by_email = {
        (user.get("email") or "").strip().lower(): str(user.get("_id"))
        for user in users
        if user.get("email")
    }

    source_configs = await source_config_collection.find({"owner_user_id": {"$exists": False}}).to_list(length=100000)
    source_updates: list[tuple[ObjectId, str]] = []
    unresolved_source_config_ids: list[str] = []

    for cfg in source_configs:
        candidate_user_id = None
        source_id = (cfg.get("source_id") or "").strip()
        name = (cfg.get("name") or "").strip().lower()

        if source_id in users_by_id:
            candidate_user_id = source_id
        elif source_id.lower() in users_by_email:
            candidate_user_id = users_by_email[source_id.lower()]
        elif name in users_by_email:
            candidate_user_id = users_by_email[name]

        if candidate_user_id:
            source_updates.append((cfg.get("_id"), candidate_user_id))
        else:
            unresolved_source_config_ids.append(str(cfg.get("_id")))

    source_owner_by_source_id: dict[str, str] = {}
    owned_configs_cursor = source_config_collection.find(
        {"owner_user_id": {"$exists": True}},
        {"source_id": 1, "owner_user_id": 1},
    )
    async for cfg in owned_configs_cursor:
        sid = cfg.get("source_id")
        owner = cfg.get("owner_user_id")
        if sid and owner and sid not in source_owner_by_source_id:
            source_owner_by_source_id[sid] = owner

    datasets = await collection.find({"owner_user_id": {"$exists": False}}).to_list(length=200000)
    dataset_updates: list[tuple[ObjectId, str]] = []
    unresolved_dataset_ids: list[str] = []

    for ds in datasets:
        metadata = ds.get("metadata") or {}
        source_details = metadata.get("source_details") or {}

        candidate_user_id = None

        uploader = source_details.get("uploader") or {}
        created_by = source_details.get("created_by") or {}

        for user_id_candidate in [
            uploader.get("id"),
            created_by.get("id"),
            _extract_user_id_from_compound_source_id(ds.get("source_id")),
        ]:
            normalized_user_id = str(user_id_candidate) if user_id_candidate is not None else ""
            if normalized_user_id and normalized_user_id in users_by_id:
                candidate_user_id = normalized_user_id
                break

        if not candidate_user_id:
            for email_candidate in [uploader.get("email"), created_by.get("email")]:
                normalized = (email_candidate or "").strip().lower()
                if normalized and normalized in users_by_email:
                    candidate_user_id = users_by_email[normalized]
                    break

        if not candidate_user_id:
            sid = ds.get("source_id")
            if sid and sid in source_owner_by_source_id:
                candidate_user_id = source_owner_by_source_id[sid]

        if candidate_user_id:
            dataset_updates.append((ds.get("_id"), candidate_user_id))
        else:
            unresolved_dataset_ids.append(str(ds.get("_id")))

    if not dry_run:
        for doc_id, owner_user_id in source_updates:
            await source_config_collection.update_one(
                {"_id": doc_id, "owner_user_id": {"$exists": False}},
                {"$set": {"owner_user_id": owner_user_id}},
            )

        # Refresh source owner map after updates.
        source_owner_by_source_id = {}
        owned_configs_cursor = source_config_collection.find(
            {"owner_user_id": {"$exists": True}},
            {"source_id": 1, "owner_user_id": 1},
        )
        async for cfg in owned_configs_cursor:
            sid = cfg.get("source_id")
            owner = cfg.get("owner_user_id")
            if sid and owner and sid not in source_owner_by_source_id:
                source_owner_by_source_id[sid] = owner

        for doc_id, owner_user_id in dataset_updates:
            await collection.update_one(
                {"_id": doc_id, "owner_user_id": {"$exists": False}},
                {"$set": {"owner_user_id": owner_user_id}},
            )

        # Safety net: assign unresolved rows to quarantine owner if configured.
        quarantine_owner = os.getenv("MIGRATION_QUARANTINE_OWNER_USER_ID", "").strip()
        if quarantine_owner and quarantine_owner in users_by_id:
            await source_config_collection.update_many(
                {"owner_user_id": {"$exists": False}},
                {"$set": {"owner_user_id": quarantine_owner}},
            )
            await collection.update_many(
                {"owner_user_id": {"$exists": False}},
                {"$set": {"owner_user_id": quarantine_owner}},
            )

    return {
        "status": "success",
        "dry_run": dry_run,
        "users_count": len(users),
        "source_configs": {
            "missing_owner": len(source_configs),
            "resolved": len(source_updates),
            "unresolved": len(unresolved_source_config_ids),
            "unresolved_sample_ids": unresolved_source_config_ids[: max(0, sample_size)],
        },
        "datasets": {
            "missing_owner": len(datasets),
            "resolved": len(dataset_updates),
            "unresolved": len(unresolved_dataset_ids),
            "unresolved_sample_ids": unresolved_dataset_ids[: max(0, sample_size)],
        },
        "quarantine_owner_user_id": os.getenv("MIGRATION_QUARANTINE_OWNER_USER_ID", "").strip() or None,
    }


async def create_user(name: str, email: str, password_hash: str):
    document = {
        "name": name,
        "email": email,
        "password_hash": password_hash,
        "created_at": datetime.now(timezone.utc),
        "last_login_at": None,
    }
    result = await users_collection.insert_one(document)
    document["_id"] = result.inserted_id
    return document


async def get_user_by_email(email: str):
    return await users_collection.find_one({"email": email})


async def get_users_by_emails(emails: list[str]):
    normalized = [str(email or "").strip().lower() for email in (emails or []) if str(email or "").strip()]
    if not normalized:
        return []

    cursor = users_collection.find({"email": {"$in": normalized}})
    return await cursor.to_list(length=len(normalized))


async def get_user_by_id(user_id: str):
    if not ObjectId.is_valid(user_id):
        return None
    return await users_collection.find_one({"_id": ObjectId(user_id)})


async def update_user_last_login(user_id: str):
    if not ObjectId.is_valid(user_id):
        return {"matched_count": 0, "modified_count": 0}

    result = await users_collection.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"last_login_at": datetime.now(timezone.utc)}},
    )
    return {
        "matched_count": result.matched_count,
        "modified_count": result.modified_count,
    }


async def create_report(
    owner_user_id: str,
    name: str,
    pages: list[dict],
    charts: list[dict],
    global_filters: list[dict],
    selected_dataset_id: str | None,
    active_page_id: str | None,
):
    now = datetime.now(timezone.utc)
    document = {
        "owner_user_id": owner_user_id,
        "name": name,
        "pages": pages,
        "charts": charts,
        "global_filters": global_filters,
        "selected_dataset_id": selected_dataset_id,
        "active_page_id": active_page_id,
        "created_at": now,
        "updated_at": now,
    }
    result = await reports_collection.insert_one(document)
    document["_id"] = result.inserted_id
    return document


async def get_report_by_id(report_id: str):
    if not ObjectId.is_valid(report_id):
        return None
    return await reports_collection.find_one({"_id": ObjectId(report_id)})


async def update_report(
    report_id: str,
    owner_user_id: str,
    updates: dict,
):
    if not ObjectId.is_valid(report_id):
        return None

    safe_updates = {k: v for k, v in (updates or {}).items() if k in {
        "name",
        "pages",
        "charts",
        "global_filters",
        "selected_dataset_id",
        "active_page_id",
    }}
    if not safe_updates:
        safe_updates = {}
    safe_updates["updated_at"] = datetime.now(timezone.utc)

    return await reports_collection.find_one_and_update(
        {
            "_id": ObjectId(report_id),
            "owner_user_id": owner_user_id,
        },
        {"$set": safe_updates},
        return_document=ReturnDocument.AFTER,
    )


async def create_report_share(
    report_id: str,
    token_hash: str,
    role: str,
    expires_at,
    created_by: str,
    recipient_user_ids: list[str] | None = None,
    recipient_emails: list[str] | None = None,
    created_ip: str | None = None,
):
    if not ObjectId.is_valid(report_id):
        return None

    now = datetime.now(timezone.utc)
    document = {
        "report_id": report_id,
        "token_hash": token_hash,
        "role": role,
        "expires_at": expires_at,
        "revoked": False,
        "created_by": created_by,
        "recipient_user_ids": [str(user_id) for user_id in (recipient_user_ids or []) if str(user_id).strip()],
        "recipient_emails": [str(email).strip().lower() for email in (recipient_emails or []) if str(email).strip()],
        "created_ip": created_ip,
        "created_at": now,
        "accessed_at": None,
        "accessed_ip": None,
    }
    result = await report_shares_collection.insert_one(document)
    document["_id"] = result.inserted_id
    return document


async def get_active_report_share(report_id: str, token_hash: str, recipient_user_id: str | None = None):
    now = datetime.now(timezone.utc)
    query = {
        "report_id": report_id,
        "token_hash": token_hash,
        "revoked": {"$ne": True},
        "$or": [
            {"expires_at": None},
            {"expires_at": {"$gt": now}},
        ],
    }

    if recipient_user_id:
        query["recipient_user_ids"] = str(recipient_user_id)

    return await report_shares_collection.find_one(
        query
    )


async def mark_report_share_accessed(share_id: str, accessed_ip: str | None = None):
    if not ObjectId.is_valid(share_id):
        return {"matched_count": 0, "modified_count": 0}

    result = await report_shares_collection.update_one(
        {"_id": ObjectId(share_id)},
        {"$set": {"accessed_at": datetime.now(timezone.utc), "accessed_ip": accessed_ip}},
    )
    return {
        "matched_count": result.matched_count,
        "modified_count": result.modified_count,
    }