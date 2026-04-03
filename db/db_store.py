import os
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
    cursor = collection.find({"owner_user_id": owner_user_id, "is_latest": True}).sort("ingested_at", -1).limit(limit)
    return await cursor.to_list(length=limit)


async def list_datasets(owner_user_id: str, limit: int = 1000):
    cursor = collection.find({"owner_user_id": owner_user_id}).sort([("ingested_at", -1)]).limit(limit)
    return await cursor.to_list(length=limit)


async def get_latest_dataset_by_source(source_id: str, owner_user_id: str):
    return await collection.find_one(
        {"owner_user_id": owner_user_id, "source_key": source_id, "is_latest": True},
        sort=[("ingested_at", -1)],
    )


async def get_dataset_by_id(document_id: str, owner_user_id: str):
    if not ObjectId.is_valid(document_id):
        return None

    return await collection.find_one({"_id": ObjectId(document_id), "owner_user_id": owner_user_id})


async def get_dataset_for_query(dataset_id: str, owner_user_id: str):
    """
    Resolve dataset by document id first, then by source_key/source_id latest snapshot.
    """
    if not dataset_id:
        return None

    if ObjectId.is_valid(dataset_id):
        by_id = await collection.find_one({"_id": ObjectId(dataset_id), "owner_user_id": owner_user_id})
        if by_id:
            return by_id

    by_source_key_latest = await collection.find_one(
        {"owner_user_id": owner_user_id, "source_key": dataset_id, "is_latest": True},
        sort=[("ingested_at", -1)],
    )
    if by_source_key_latest:
        return by_source_key_latest

    by_source_id_latest = await collection.find_one(
        {"owner_user_id": owner_user_id, "source_id": dataset_id, "is_latest": True},
        sort=[("ingested_at", -1)],
    )
    if by_source_id_latest:
        return by_source_id_latest

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
        "created_ip": created_ip,
        "created_at": now,
        "accessed_at": None,
        "accessed_ip": None,
    }
    result = await report_shares_collection.insert_one(document)
    document["_id"] = result.inserted_id
    return document


async def get_active_report_share(report_id: str, token_hash: str):
    now = datetime.now(timezone.utc)
    return await report_shares_collection.find_one(
        {
            "report_id": report_id,
            "token_hash": token_hash,
            "revoked": {"$ne": True},
            "$or": [
                {"expires_at": None},
                {"expires_at": {"$gt": now}},
            ],
        }
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