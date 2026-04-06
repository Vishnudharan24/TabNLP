import asyncio
import os
import math
import time
import mimetypes
import logging
import base64
import hashlib
import hmac
import json
import tempfile
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Request
from fastapi import Header
from fastapi import Depends
from fastapi import UploadFile
from fastapi import File
from fastapi import BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Literal, Any, Annotated
from pathlib import Path
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
import pandas as pd
from services.data_services.ingestion_service import run_ingestion, run_uploaded_file_ingestion
from services.hr.hr_analytics_service import compute_module
from services.chart.visualization_engine import (
    recommend_chart,
    generate_chart_config,
)
from services.query_engine import run_query
from services.query_engine import get_query_runtime_stats
from services.query_pipeline import QueryEngineError
from services.semantic_layer import (
    set_measure,
    list_measures,
    delete_measure,
    clear_dataset_cache,
)
from db.db_store import (
    upsert_source_config,
    ensure_indexes,
    backfill_owner_user_ids,
    get_source_config,
    list_source_configs,
    unset_source_config_fields,
    list_datasets,
    list_latest_datasets,
    get_latest_dataset_by_source,
    get_dataset_by_id,
    delete_dataset_by_id,
    get_dataset_for_query,
    store_dataset,
    create_user,
    get_user_by_email,
    get_users_by_emails,
    get_user_by_id,
    update_user_last_login,
    create_report,
    get_report_by_id,
    update_report,
    create_report_share,
    get_active_report_share,
    mark_report_share_accessed,
    list_relationships,
    upsert_relationship,
)

app = FastAPI()
logger = logging.getLogger(__name__)

_LOCAL_DEV_ORIGIN_SCHEMES = ("http", "https")
_LOCAL_DEV_ORIGIN_HOSTS = ("localhost", "127.0.0.1")
_LOCAL_DEV_ORIGIN_PORTS = (3000, 5173)
DEFAULT_FRONTEND_ORIGINS = ",".join(
    f"{scheme}://{host}:{port}"
    for scheme in _LOCAL_DEV_ORIGIN_SCHEMES
    for host in _LOCAL_DEV_ORIGIN_HOSTS
    for port in _LOCAL_DEV_ORIGIN_PORTS
)

FRONTEND_ORIGINS = os.getenv(
    "FRONTEND_ORIGINS",
    DEFAULT_FRONTEND_ORIGINS,
)
ALLOWED_ORIGINS = [origin.strip() for origin in FRONTEND_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
TEST_EXCEL_FILE = Path("/home/vishnudharan/odyssey/TabNLP/poweranalytics-desktop/data/sales_data.csv")
DEFAULT_SFTP_USERNAME = "sftp_user"
DEFAULT_SFTP_PRIVATE_KEY_PATH = str(Path.home() / ".ssh" / "id_rsa")
DEFAULT_SFTP_REMOTE_PATH = str(Path.home() / "odyssey" / "TabNLP" / "data" / "Employee_Master_Data_260220261036.xlsx")
AUTH_SECRET = os.getenv("AUTH_SECRET")
if not AUTH_SECRET:
    raise RuntimeError("AUTH_SECRET environment variable is required")
AUTH_TOKEN_DAYS = int(os.getenv("AUTH_TOKEN_DAYS", "7"))


class SFTPConfig(BaseModel):
    host: str
    port: int = 22
    username: str
    private_key_path: str
    remote_path: str
    passphrase: Optional[str] = None
    known_hosts_path: Optional[str] = None


class SourceConfigUpsertRequest(BaseModel):
    source_id: str
    name: str
    source_type: Literal["api", "sftp"]
    api_endpoint: Optional[str] = None
    url: Optional[str] = None
    sftp: Optional[SFTPConfig] = None


class SourceConfigPatchRequest(BaseModel):
    name: Optional[str] = None
    source_type: Optional[Literal["api", "sftp"]] = None
    api_endpoint: Optional[str] = None
    url: Optional[str] = None
    sftp: Optional[SFTPConfig] = None


class SignUpRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class HrAnalyticsRequest(BaseModel):
    data: list[dict[str, Any]]
    mapping: dict[str, str]


class ChartEngineRequest(BaseModel):
    columns: list[dict[str, Any]]
    data: list[dict[str, Any]]


class ChartConfigRequest(ChartEngineRequest):
    chart_type: str
    selected_fields: Optional[dict[str, Any]] = None


class QueryMeasure(BaseModel):
    field: Optional[str] = None
    table: Optional[str] = None
    name: Optional[str] = None
    expression: Optional[str] = None
    aggregation: Optional[Literal["SUM", "AVG", "COUNT", "MIN", "MAX", "GROUP_BY"]] = "COUNT"
    alias: Optional[str] = None


class QueryFilter(BaseModel):
    field: str
    table: Optional[str] = None
    operator: Optional[str] = "EQUALS"
    value: Optional[Any] = None
    type: Optional[str] = None
    values: Optional[list[Any]] = None
    min: Optional[float] = None
    max: Optional[float] = None
    columnType: Optional[str] = None


class QueryJoin(BaseModel):
    from_table: str
    from_column: str
    to_table: str
    to_column: str


class QueryRequest(BaseModel):
    datasetId: str
    chartType: Optional[str] = None
    dimensions: Optional[list[Any]] = None
    measures: Optional[list[Any]] = None
    filters: Optional[list[Any]] = None

    class QuerySort(BaseModel):
        field: str
        order: Literal["asc", "desc"] = "desc"

    sort: Optional[QuerySort] = None
    limit: Optional[int] = None
    joins: Optional[list[QueryJoin]] = None
    mode: Optional[str] = None
    hierarchy: Optional[list[str]] = None
    valueField: Optional[str] = None
    valueAggregation: Optional[str] = None
    nodeField: Optional[str] = None
    parentField: Optional[str] = None
    labelField: Optional[str] = None
    colorField: Optional[str] = None
    sortBy: Optional[str] = None
    sortOrder: Optional[str] = None
    fields: Optional[list[str]] = None
    meta: Optional[dict[str, Any]] = None


class SemanticMeasureCreateRequest(BaseModel):
    datasetId: str
    name: str
    expression: str


class SemanticMeasureUpdateRequest(BaseModel):
    datasetId: str
    expression: str


class ReportCreateRequest(BaseModel):
    name: Optional[str] = "Untitled Report"
    pages: list[dict[str, Any]] = []
    charts: list[dict[str, Any]] = []
    global_filters: list[dict[str, Any]] = []
    selected_dataset_id: Optional[str] = None
    active_page_id: Optional[str] = None


class ReportUpdateRequest(BaseModel):
    name: Optional[str] = None
    pages: Optional[list[dict[str, Any]]] = None
    charts: Optional[list[dict[str, Any]]] = None
    global_filters: Optional[list[dict[str, Any]]] = None
    selected_dataset_id: Optional[str] = None
    active_page_id: Optional[str] = None


class ReportShareCreateRequest(BaseModel):
    role: Literal["viewer"] = "viewer"
    expires_in_hours: Optional[int] = 24
    recipient_emails: list[str] = []


class DatasetMergeRequest(BaseModel):
    left_dataset_id: str
    right_dataset_id: str
    join_type: Literal["inner", "left", "right", "full", "append"]
    left_key: Optional[str] = None
    right_key: Optional[str] = None
    merged_name: Optional[str] = None


class OwnerBackfillRequest(BaseModel):
    dry_run: bool = True
    sample_size: int = 20


def _serialize_source_config(source_config: dict):
    if not source_config:
        return None

    serialized = {key: value for key, value in source_config.items() if key != "_id"}
    return _to_json_safe(serialized)


def _to_json_safe(value):
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value

    if isinstance(value, ObjectId):
        return str(value)

    if isinstance(value, dict):
        return {k: _to_json_safe(v) for k, v in value.items()}

    if isinstance(value, list):
        return [_to_json_safe(item) for item in value]

    if isinstance(value, tuple):
        return tuple(_to_json_safe(item) for item in value)

    return value


def _serialize_dataset(document: dict):
    if not document:
        return None

    rows = []
    if isinstance(document.get("data"), list):
        rows = document.get("data")
    elif isinstance(document.get("rows"), list):
        rows = document.get("rows")
    elif isinstance(document.get("records"), list):
        rows = document.get("records")

    metadata = document.get("metadata") if isinstance(document.get("metadata"), dict) else {}
    normalized_metadata = dict(metadata)
    normalized_metadata["row_count"] = len(rows)

    serialized = {
        key: value
        for key, value in document.items()
        if key != "_id"
    }
    serialized["data"] = rows
    serialized["metadata"] = normalized_metadata
    serialized["document_id"] = str(document.get("_id"))
    return _to_json_safe(serialized)


def _validate_source_config(payload: dict):
    source_type = payload.get("source_type")

    if source_type == "api":
        if not (payload.get("api_endpoint") or payload.get("url")):
            raise ValueError("API source requires either api_endpoint or url")

    elif source_type == "sftp":
        if not payload.get("sftp"):
            raise ValueError("SFTP source requires sftp config")

    else:
        raise ValueError("source_type must be either 'api' or 'sftp'")


def _normalize_email(email: str):
    return (email or "").strip().lower()


def _normalize_email_list(emails: list[str] | None):
    unique = []
    seen = set()
    for item in (emails or []):
        value = _normalize_email(str(item or ""))
        if not value or value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def _hash_password(password: str, salt: Optional[str] = None):
    if not salt:
        salt = base64.urlsafe_b64encode(os.urandom(16)).decode().rstrip("=")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"{salt}${base64.urlsafe_b64encode(digest).decode().rstrip('=')}"


def _verify_password(password: str, stored_hash: str):
    try:
        salt = stored_hash.split("$", 1)[0]
    except Exception:
        return False

    expected = _hash_password(password, salt=salt)
    return hmac.compare_digest(expected, stored_hash)


def _base64url_encode(data: bytes):
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _base64url_decode(data: str):
    padded = data + "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(padded.encode())


def _create_access_token(user_id: str, email: str):
    now = datetime.now(timezone.utc)
    header = {
        "alg": "HS256",
        "typ": "JWT",
    }
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=AUTH_TOKEN_DAYS)).timestamp()),
    }
    header_b64 = _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}"
    signature = hmac.new(AUTH_SECRET.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    signature_b64 = _base64url_encode(signature)
    return f"{header_b64}.{payload_b64}.{signature_b64}"


def _create_share_token() -> str:
    return _base64url_encode(os.urandom(32))


def _hash_share_token(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def _decode_access_token(token: str):
    parts = token.split(".")
    payload = None

    if len(parts) == 3:
        header_b64, payload_b64, signature_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}"
        expected_sig = hmac.new(AUTH_SECRET.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
        expected_sig_b64 = _base64url_encode(expected_sig)
        if not hmac.compare_digest(expected_sig_b64, signature_b64):
            raise HTTPException(status_code=401, detail="Invalid authentication token")

        try:
            payload = json.loads(_base64url_decode(payload_b64).decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid authentication token")

    elif len(parts) == 2:
        # Backward compatibility with previous non-JWT token format.
        payload_b64, signature_b64 = parts
        expected_sig = hmac.new(AUTH_SECRET.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
        expected_sig_b64 = _base64url_encode(expected_sig)
        if not hmac.compare_digest(expected_sig_b64, signature_b64):
            raise HTTPException(status_code=401, detail="Invalid authentication token")

        try:
            payload = json.loads(_base64url_decode(payload_b64).decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
    else:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    exp = payload.get("exp")
    if not exp or int(exp) < int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(status_code=401, detail="Authentication token expired")

    return payload


def _user_public(user_doc: dict):
    if not user_doc:
        return None
    return {
        "id": str(user_doc.get("_id")),
        "name": user_doc.get("name"),
        "email": user_doc.get("email"),
        "created_at": user_doc.get("created_at"),
        "last_login_at": user_doc.get("last_login_at"),
    }


async def _require_current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token")

    token = authorization.split(" ", 1)[1].strip()
    payload = _decode_access_token(token)
    user_id = payload.get("sub")
    user_doc = await get_user_by_id(user_id)
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    return user_doc


def _is_admin_user(user_doc: dict) -> bool:
    email = (user_doc.get("email") or "").strip().lower()
    configured = {
        item.strip().lower()
        for item in os.getenv("ADMIN_EMAILS", "").split(",")
        if item.strip()
    }
    return bool(email and email in configured)


async def _require_admin_user(current_user: Annotated[dict, Depends(_require_current_user)]):
    if not _is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def _require_dataset_access(dataset_id: str, current_user: dict):
    owner_user_id = str(current_user.get("_id"))
    doc = await get_dataset_for_query(dataset_id, owner_user_id=owner_user_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}")
    return doc


def _raise_internal_error(public_message: str, exc: Exception):
    _ = exc
    logger.exception(public_message)
    raise HTTPException(status_code=500, detail=public_message)


def _serialize_report(report_doc: dict[str, Any]):
    if not report_doc:
        return None
    return _to_json_safe({
        "id": str(report_doc.get("_id")),
        "owner_user_id": report_doc.get("owner_user_id"),
        "name": report_doc.get("name") or "Untitled Report",
        "pages": report_doc.get("pages") or [],
        "charts": report_doc.get("charts") or [],
        "global_filters": report_doc.get("global_filters") or [],
        "selected_dataset_id": report_doc.get("selected_dataset_id"),
        "active_page_id": report_doc.get("active_page_id"),
        "created_at": report_doc.get("created_at"),
        "updated_at": report_doc.get("updated_at"),
    })


def _extract_report_dataset_ids(report_doc: dict[str, Any]):
    if not report_doc:
        return set()

    dataset_ids = set()
    selected_dataset_id = str(report_doc.get("selected_dataset_id") or "").strip()
    if selected_dataset_id:
        dataset_ids.add(selected_dataset_id)

    charts = report_doc.get("charts") or []
    for chart in charts:
        if not isinstance(chart, dict):
            continue
        chart_dataset_id = str(chart.get("datasetId") or chart.get("dataset_id") or "").strip()
        if chart_dataset_id:
            dataset_ids.add(chart_dataset_id)

    return dataset_ids


def _build_frontend_share_url(request: Request, report_id: str, share_token: str):
    origin = ""
    if request:
        origin = str(request.headers.get("origin") or "").strip().rstrip("/")
    if not origin:
        origin = str(request.base_url).strip().rstrip("/")
    return f"{origin}/report/{report_id}?shareToken={share_token}"


async def _resolve_shared_access(report_id: str, share_token: str, current_user: dict, request: Request):
    token_hash = _hash_share_token(share_token)
    share_doc = await get_active_report_share(report_id=report_id, token_hash=token_hash)
    if not share_doc:
        raise HTTPException(status_code=404, detail="Shared report not found or link expired")

    recipient_user_ids = [str(item) for item in (share_doc.get("recipient_user_ids") or []) if str(item).strip()]
    current_user_id = str(current_user.get("_id"))
    if recipient_user_ids and current_user_id not in recipient_user_ids:
        raise HTTPException(status_code=403, detail="You are not authorized to access this shared report")

    if (share_doc.get("role") or "viewer") != "viewer":
        raise HTTPException(status_code=403, detail="Only viewer role is supported for shared reports")

    report_doc = await get_report_by_id(report_id)
    if not report_doc:
        raise HTTPException(status_code=404, detail="Report not found")

    await mark_report_share_accessed(
        str(share_doc.get("_id")),
        accessed_ip=(request.client.host if request and request.client else None),
    )

    return share_doc, report_doc


def _slugify(text: str) -> str:
    safe = ''.join(ch.lower() if ch.isalnum() else '-' for ch in (text or ''))
    while '--' in safe:
        safe = safe.replace('--', '-')
    return safe.strip('-') or 'merged-dataset'


def _classify_declared_type(series: pd.Series) -> str:
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    return "string"


def _infer_semantic_type(column_name: str, series: pd.Series) -> str:
    sample = [v for v in series.dropna().tolist() if str(v).strip() != ""]
    sample = sample[:500]
    if not sample:
        return "categorical"

    lowered = str(column_name or "").strip().lower()
    if (
        lowered == "id"
        or "_id" in lowered
        or "identifier" in lowered
        or "uuid" in lowered
        or "code" in lowered
        or "sku" in lowered
    ):
        return "id"

    unique_ratio = len({str(v) for v in sample}) / max(1, len(sample))
    if unique_ratio >= 0.98:
        return "id"

    declared = _classify_declared_type(series)
    if declared == "number":
        return "numeric"
    if declared == "date":
        return "date"
    return "categorical"


@app.post("/datasets/merge")
async def merge_datasets(payload: DatasetMergeRequest, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        left_id = (payload.left_dataset_id or "").strip()
        right_id = (payload.right_dataset_id or "").strip()
        if not left_id or not right_id:
            raise HTTPException(status_code=400, detail="Both left_dataset_id and right_dataset_id are required")
        if left_id == right_id:
            raise HTTPException(status_code=400, detail="Select two different datasets to merge")

        owner_user_id = str(current_user.get("_id"))
        left_doc = await get_dataset_for_query(left_id, owner_user_id=owner_user_id)
        right_doc = await get_dataset_for_query(right_id, owner_user_id=owner_user_id)
        if not left_doc:
            raise HTTPException(status_code=404, detail=f"Left dataset not found: {left_id}")
        if not right_doc:
            raise HTTPException(status_code=404, detail=f"Right dataset not found: {right_id}")

        left_rows = left_doc.get("data") if isinstance(left_doc.get("data"), list) else []
        right_rows = right_doc.get("data") if isinstance(right_doc.get("data"), list) else []
        left_df = pd.DataFrame(left_rows)
        right_df = pd.DataFrame(right_rows)

        join_type = payload.join_type
        left_key = (payload.left_key or "").strip()
        right_key = (payload.right_key or "").strip()

        if join_type != "append":
            if not left_key or not right_key:
                raise HTTPException(status_code=400, detail="left_key and right_key are required for join merge")
            if left_key not in left_df.columns:
                raise HTTPException(status_code=400, detail=f"Left key not found in dataset: {left_key}")
            if right_key not in right_df.columns:
                raise HTTPException(status_code=400, detail=f"Right key not found in dataset: {right_key}")

        if join_type == "append":
            merged_df = pd.concat([left_df, right_df], ignore_index=True, sort=False)
        else:
            join_map = {
                "inner": "inner",
                "left": "left",
                "right": "right",
                "full": "outer",
            }
            merged_df = pd.merge(
                left_df,
                right_df,
                how=join_map[join_type],
                left_on=left_key,
                right_on=right_key,
                suffixes=("", "_right"),
            )
            if right_key != left_key and right_key in merged_df.columns:
                merged_df = merged_df.drop(columns=[right_key])

        merged_df = merged_df.where(pd.notnull(merged_df), None)

        raw_name = (payload.merged_name or "").strip()
        default_name = f"{left_doc.get('source_key', 'left')} + {right_doc.get('source_key', 'right')}"
        merged_name = raw_name or default_name

        metadata = {
            "source": f"merge://{left_id}+{right_id}",
            "source_type": "merge",
            "timestamp": datetime.now(timezone.utc),
            "row_count": int(len(merged_df.index)),
            "columns": list(merged_df.columns),
            "column_types": {column: _classify_declared_type(merged_df[column]) for column in merged_df.columns},
            "column_semantic_types": {column: _infer_semantic_type(column, merged_df[column]) for column in merged_df.columns},
            "relationships": [],
            "file_name": merged_name,
            "source_details": {
                "source_type": "merge",
                "left_dataset_id": left_id,
                "right_dataset_id": right_id,
                "left_source_key": left_doc.get("source_key"),
                "right_source_key": right_doc.get("source_key"),
                "join_type": join_type,
                "left_key": left_key or None,
                "right_key": right_key or None,
                "created_by": {
                    "id": str(current_user.get("_id")),
                    "name": current_user.get("name"),
                    "email": current_user.get("email"),
                },
            },
        }

        source_id = f"merged::{str(current_user.get('_id'))}::{_slugify(merged_name)}"
        storage_result = await store_dataset(
            metadata,
            merged_df,
            source_id=source_id,
            owner_user_id=owner_user_id,
        )
        stored_doc = await get_dataset_by_id(storage_result["document_id"], owner_user_id=owner_user_id)

        return {
            "status": "success",
            "message": "Datasets merged and stored successfully",
            "item": _serialize_dataset(stored_doc),
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to merge and store dataset", e)


@app.post("/auth/signup")
async def auth_signup(payload: SignUpRequest):
    try:
        name = (payload.name or "").strip()
        email = _normalize_email(payload.email)
        password = payload.password or ""

        if len(name) < 2:
            raise HTTPException(status_code=400, detail="Name must be at least 2 characters")
        if "@" not in email:
            raise HTTPException(status_code=400, detail="A valid email is required")
        if len(password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

        password_hash = _hash_password(password)
        user_doc = await create_user(name=name, email=email, password_hash=password_hash)
        token = _create_access_token(str(user_doc.get("_id")), email)

        return {
            "status": "success",
            "token": token,
            "user": _to_json_safe(_user_public(user_doc)),
        }
    except HTTPException:
        raise
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    except Exception as e:
        _raise_internal_error("Signup failed", e)


@app.post("/auth/login")
async def auth_login(payload: LoginRequest):
    try:
        email = _normalize_email(payload.email)
        password = payload.password or ""

        user_doc = await get_user_by_email(email)
        if not user_doc or not _verify_password(password, user_doc.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        await update_user_last_login(str(user_doc.get("_id")))
        refreshed_user = await get_user_by_id(str(user_doc.get("_id")))
        token = _create_access_token(str(user_doc.get("_id")), email)

        return {
            "status": "success",
            "token": token,
            "user": _to_json_safe(_user_public(refreshed_user or user_doc)),
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Login failed", e)


@app.get("/auth/me")
async def auth_me(current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        return {
            "status": "success",
            "user": _to_json_safe(_user_public(current_user)),
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Authentication check failed", e)


@app.post("/reports")
async def create_report_endpoint(payload: ReportCreateRequest, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        owner_user_id = str(current_user.get("_id"))
        report_doc = await create_report(
            owner_user_id=owner_user_id,
            name=(payload.name or "Untitled Report").strip() or "Untitled Report",
            pages=payload.pages or [],
            charts=payload.charts or [],
            global_filters=payload.global_filters or [],
            selected_dataset_id=payload.selected_dataset_id,
            active_page_id=payload.active_page_id,
        )

        return {
            "status": "success",
            "report": _serialize_report(report_doc),
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to create report", e)


@app.put("/reports/{report_id}")
async def update_report_endpoint(report_id: str, payload: ReportUpdateRequest, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        owner_user_id = str(current_user.get("_id"))
        updates = {
            key: value
            for key, value in {
                "name": payload.name,
                "pages": payload.pages,
                "charts": payload.charts,
                "global_filters": payload.global_filters,
                "selected_dataset_id": payload.selected_dataset_id,
                "active_page_id": payload.active_page_id,
            }.items()
            if value is not None
        }

        updated = await update_report(report_id=report_id, owner_user_id=owner_user_id, updates=updates)
        if not updated:
            raise HTTPException(status_code=404, detail="Report not found or access denied")

        return {
            "status": "success",
            "report": _serialize_report(updated),
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to update report", e)


@app.get("/reports/{report_id}")
async def get_report_endpoint(report_id: str, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        report_doc = await get_report_by_id(report_id)
        if not report_doc:
            raise HTTPException(status_code=404, detail="Report not found")

        owner_user_id = str(current_user.get("_id"))
        if report_doc.get("owner_user_id") != owner_user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        return {
            "status": "success",
            "report": _serialize_report(report_doc),
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to fetch report", e)


@app.post("/reports/{report_id}/shares")
async def create_report_share_endpoint(
    report_id: str,
    payload: ReportShareCreateRequest,
    request: Request,
    current_user: Annotated[dict, Depends(_require_current_user)],
):
    try:
        report_doc = await get_report_by_id(report_id)
        if not report_doc:
            raise HTTPException(status_code=404, detail="Report not found")

        owner_user_id = str(current_user.get("_id"))
        owner_email = _normalize_email(str(current_user.get("email") or ""))
        if report_doc.get("owner_user_id") != owner_user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        recipient_emails = _normalize_email_list(payload.recipient_emails)
        if not recipient_emails:
            raise HTTPException(status_code=400, detail="At least one recipient email is required")

        recipient_emails = [email for email in recipient_emails if email != owner_email]
        if not recipient_emails:
            raise HTTPException(status_code=400, detail="Recipient list cannot contain only the owner email")

        recipient_users = await get_users_by_emails(recipient_emails)
        matched_users_by_email = {
            _normalize_email(str(user.get("email") or "")): user
            for user in recipient_users
            if user and user.get("email")
        }
        missing_emails = [email for email in recipient_emails if email not in matched_users_by_email]
        if missing_emails:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Some recipient emails are not registered",
                    "missing_emails": missing_emails,
                },
            )

        recipient_user_ids = sorted({
            str(user.get("_id"))
            for user in matched_users_by_email.values()
            if user and str(user.get("_id") or "").strip() and str(user.get("_id")) != owner_user_id
        })
        if not recipient_user_ids:
            raise HTTPException(status_code=400, detail="No valid recipient users found")

        expires_in_hours = payload.expires_in_hours if payload.expires_in_hours is not None else 168
        if expires_in_hours <= 0:
            raise HTTPException(status_code=400, detail="expires_in_hours must be a positive integer")

        expires_at = datetime.now(timezone.utc) + timedelta(hours=int(expires_in_hours))
        share_token = _create_share_token()
        token_hash = _hash_share_token(share_token)

        share_doc = await create_report_share(
            report_id=report_id,
            token_hash=token_hash,
            role=payload.role,
            expires_at=expires_at,
            created_by=owner_user_id,
            recipient_user_ids=recipient_user_ids,
            recipient_emails=recipient_emails,
            created_ip=(request.client.host if request and request.client else None),
        )
        if not share_doc:
            raise HTTPException(status_code=400, detail="Invalid report id")

        return {
            "status": "success",
            "share": {
                "report_id": report_id,
                "role": payload.role,
                "expires_at": expires_at,
                "recipient_emails": recipient_emails,
                "token": share_token,
                "share_url": _build_frontend_share_url(request, report_id, share_token),
            },
        }
    except HTTPException:
        raise
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Share token collision. Retry request")
    except Exception as e:
        _raise_internal_error("Failed to create report share", e)


@app.get("/shared-reports/{report_id}")
async def get_shared_report_endpoint(report_id: str, shareToken: str, request: Request, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        if not shareToken:
            raise HTTPException(status_code=400, detail="shareToken is required")

        share_doc, report_doc = await _resolve_shared_access(
            report_id=report_id,
            share_token=shareToken,
            current_user=current_user,
            request=request,
        )

        serialized = _serialize_report(report_doc)
        if serialized:
            serialized.pop("owner_user_id", None)

        return {
            "status": "success",
            "mode": "shared-viewer",
            "role": share_doc.get("role") or "viewer",
            "report": serialized,
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to fetch shared report", e)


@app.on_event("startup")
async def startup_event():
    await ensure_indexes()


@app.post("/admin/migrations/backfill-owner-user-ids")
async def admin_backfill_owner_ids(
    payload: OwnerBackfillRequest,
    _admin_user: Annotated[dict, Depends(_require_admin_user)],
):
    try:
        result = await backfill_owner_user_ids(
            dry_run=payload.dry_run,
            sample_size=payload.sample_size,
        )
        if not payload.dry_run:
            # Re-ensure tenant indexes after migration run.
            await ensure_indexes()
        return result
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to run ownership migration", e)

@app.post("/ingest")
async def ingest(current_user: Annotated[dict, Depends(_require_current_user)], source_id: Optional[str] = None, url: Optional[str] = None):
    try:
        owner_user_id = str(current_user.get("_id"))
        result = await run_ingestion(source_id=source_id, url=url, owner_user_id=owner_user_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Ingestion failed", e)


@app.post("/ingest/source/{source_id}")
async def ingest_by_source_config(source_id: str, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        owner_user_id = str(current_user.get("_id"))
        return await run_ingestion(source_id=source_id, owner_user_id=owner_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Ingestion failed", e)


@app.post("/ingest/upload")
async def ingest_uploaded_file(current_user: Annotated[dict, Depends(_require_current_user)], file: UploadFile = File(...)):
    try:
        owner_user_id = str(current_user.get("_id"))
        source_id = f"upload::{owner_user_id}::{(file.filename or 'uploaded_file').strip() or 'uploaded_file'}"

        file_bytes = await file.read()
        source_details = {
            "source_type": "upload",
            "uploader": {
                "id": str(current_user.get("_id")),
                "name": source_id,
                "email": current_user.get("email"),
            },
        }

        return await run_uploaded_file_ingestion(
            file_bytes=file_bytes,
            file_name=file.filename or "uploaded_file",
            content_type=file.content_type or "",
            source_id=source_id,
            owner_user_id=owner_user_id,
            source_details=source_details,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Ingestion failed", e)


@app.post("/source-config")
async def create_or_update_source_config(payload: SourceConfigUpsertRequest, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        owner_user_id = str(current_user.get("_id"))
        config_payload = payload.model_dump(exclude_none=True)
        _validate_source_config(config_payload)

        result = await upsert_source_config(
            source_id=payload.source_id,
            owner_user_id=owner_user_id,
            name=payload.name,
            source_type=payload.source_type,
            api_endpoint=payload.api_endpoint,
            url=payload.url,
            sftp=payload.sftp.model_dump(exclude_none=True) if payload.sftp else None,
        )

        if payload.source_type == "api":
            await unset_source_config_fields(payload.source_id, owner_user_id=owner_user_id, fields=["sftp"])
        if payload.source_type == "sftp":
            await unset_source_config_fields(payload.source_id, owner_user_id=owner_user_id, fields=["api_endpoint", "url"])

        current = await get_source_config(payload.source_id, owner_user_id=owner_user_id)

        return {
            "status": "success",
            "source_config": _serialize_source_config(current),
            "db_result": result,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Failed to save source config", e)


@app.get("/source-config")
async def get_all_source_configs(current_user: Annotated[dict, Depends(_require_current_user)], limit: int = 200):
    try:
        owner_user_id = str(current_user.get("_id"))
        configs = await list_source_configs(owner_user_id=owner_user_id, limit=limit)
        return {
            "status": "success",
            "count": len(configs),
            "items": [_serialize_source_config(config) for config in configs],
        }
    except Exception as e:
        _raise_internal_error("Failed to list source configs", e)


@app.get("/source-config/{source_id}")
async def get_source_config_by_id(source_id: str, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        owner_user_id = str(current_user.get("_id"))
        source_config = await get_source_config(source_id, owner_user_id=owner_user_id)
        if not source_config:
            raise HTTPException(status_code=404, detail=f"Source config not found for: {source_id}")

        return {
            "status": "success",
            "source_config": _serialize_source_config(source_config),
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to fetch source config", e)


@app.patch("/source-config/{source_id}")
async def patch_source_config(source_id: str, payload: SourceConfigPatchRequest, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        owner_user_id = str(current_user.get("_id"))
        existing = await get_source_config(source_id, owner_user_id=owner_user_id)
        if not existing:
            raise HTTPException(status_code=404, detail=f"Source config not found for: {source_id}")

        merged = _serialize_source_config(existing)
        patch_data = payload.model_dump(exclude_none=True)
        if not patch_data:
            raise HTTPException(status_code=400, detail="No fields provided for update")

        merged.update(patch_data)
        _validate_source_config(merged)

        result = await upsert_source_config(
            source_id=source_id,
            owner_user_id=owner_user_id,
            name=merged["name"],
            source_type=merged["source_type"],
            api_endpoint=merged.get("api_endpoint"),
            url=merged.get("url"),
            sftp=merged.get("sftp"),
        )

        if merged["source_type"] == "api":
            await unset_source_config_fields(source_id, owner_user_id=owner_user_id, fields=["sftp"])
        if merged["source_type"] == "sftp":
            await unset_source_config_fields(source_id, owner_user_id=owner_user_id, fields=["api_endpoint", "url"])

        current = await get_source_config(source_id, owner_user_id=owner_user_id)

        return {
            "status": "success",
            "source_config": _serialize_source_config(current),
            "db_result": result,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Failed to update source config", e)


@app.get("/datasets/latest")
async def get_latest_datasets(current_user: Annotated[dict, Depends(_require_current_user)], limit: int = 100):
    try:
        owner_user_id = str(current_user.get("_id"))
        documents = await list_latest_datasets(owner_user_id=owner_user_id, limit=limit)
        return {
            "status": "success",
            "count": len(documents),
            "items": [_serialize_dataset(document) for document in documents],
        }
    except Exception as e:
        _raise_internal_error("Failed to list datasets", e)


@app.get("/datasets")
async def get_all_datasets(current_user: Annotated[dict, Depends(_require_current_user)], limit: int = 1000):
    try:
        owner_user_id = str(current_user.get("_id"))
        documents = await list_datasets(owner_user_id=owner_user_id, limit=limit)
        return {
            "status": "success",
            "count": len(documents),
            "items": [_serialize_dataset(document) for document in documents],
        }
    except Exception as e:
        _raise_internal_error("Failed to list all datasets", e)


@app.get("/datasets/latest/{source_id}")
async def get_latest_dataset_for_source(source_id: str, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        owner_user_id = str(current_user.get("_id"))
        document = await get_latest_dataset_by_source(source_id, owner_user_id=owner_user_id)
        if not document:
            raise HTTPException(status_code=404, detail=f"No latest dataset found for source: {source_id}")

        return {
            "status": "success",
            "item": _serialize_dataset(document),
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to fetch latest dataset", e)


@app.get("/datasets/{document_id}")
async def get_dataset_document(document_id: str, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        owner_user_id = str(current_user.get("_id"))
        document = await get_dataset_by_id(document_id, owner_user_id=owner_user_id)
        if not document:
            raise HTTPException(status_code=404, detail=f"Dataset not found: {document_id}")

        return {
            "status": "success",
            "item": _serialize_dataset(document),
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to fetch dataset", e)


@app.put("/datasets/{document_id}/delete")
async def delete_dataset_document(document_id: str, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        owner_user_id = str(current_user.get("_id"))
        result = await delete_dataset_by_id(document_id, owner_user_id=owner_user_id)
        if int(result.get("deleted_count") or 0) == 0:
            raise HTTPException(status_code=404, detail=f"Dataset not found: {document_id}")

        clear_dataset_cache(document_id)

        promoted_latest_document_id = result.get("promoted_latest_document_id")
        if promoted_latest_document_id:
            clear_dataset_cache(promoted_latest_document_id)

        source_key = result.get("source_key")
        if source_key:
            clear_dataset_cache(str(source_key))

        return {
            "status": "success",
            "deleted_document_id": document_id,
            "promoted_latest_document_id": promoted_latest_document_id,
            "source_key": source_key,
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to delete dataset", e)


async def _run_hr_analytics_module(module: str, payload: HrAnalyticsRequest):
    try:
        return {
            "status": "success",
            **compute_module(module=module, data=payload.data, mapping=payload.mapping),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error(f"Failed to compute HR analytics module: {module}", e)


@app.post("/chart/recommend")
async def chart_recommend(payload: ChartEngineRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        return {
            "status": "success",
            **recommend_chart(columns=payload.columns, data=payload.data),
        }
    except Exception as e:
        _raise_internal_error("Failed to recommend chart", e)


@app.post("/chart/config")
async def chart_config(payload: ChartConfigRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        return {
            "status": "success",
            **generate_chart_config(
                chart_type=payload.chart_type,
                columns=payload.columns,
                data=payload.data,
                selected_fields=payload.selected_fields,
            ),
        }
    except Exception as e:
        _raise_internal_error("Failed to generate chart config", e)


@app.post("/query")
async def query_data(
    payload: QueryRequest,
    request: Request,
    current_user: Annotated[dict, Depends(_require_current_user)],
    reportId: Optional[str] = None,
    shareToken: Optional[str] = None,
):
    started_at = time.perf_counter()
    try:
        owner_user_id = str(current_user.get("_id"))

        has_share_context = bool((reportId or "").strip() or (shareToken or "").strip())
        if has_share_context:
            if not reportId or not shareToken:
                raise HTTPException(status_code=400, detail="Both reportId and shareToken are required for shared query access")

            _, report_doc = await _resolve_shared_access(
                report_id=str(reportId).strip(),
                share_token=str(shareToken).strip(),
                current_user=current_user,
                request=request,
            )

            allowed_dataset_ids = _extract_report_dataset_ids(report_doc)
            requested_dataset_id = str(payload.datasetId or "").strip()
            if requested_dataset_id and allowed_dataset_ids and requested_dataset_id not in allowed_dataset_ids:
                raise HTTPException(status_code=403, detail="Dataset is not part of this shared report")

            owner_user_id = str(report_doc.get("owner_user_id") or "").strip() or owner_user_id

        response = await run_query(payload.model_dump(exclude_none=True), owner_user_id=owner_user_id)
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.info(
            "query.completed dataset_id=%s chart_type=%s rows=%s filtered_rows=%s cache_hit=%s elapsed_ms=%s",
            str(payload.datasetId or ""),
            str(payload.chartType or ""),
            len(response.get("rows") or []) if isinstance(response, dict) else 0,
            (response.get("filteredRowCount") if isinstance(response, dict) else None),
            (response.get("meta") or {}).get("cacheHit") if isinstance(response, dict) else None,
            elapsed_ms,
        )
        return _to_json_safe(response)
    except QueryEngineError as e:
        return JSONResponse(status_code=400, content=e.to_dict())
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_QUERY",
                    "message": str(e),
                    "details": {},
                }
            },
        )
    except Exception as e:
        logger.exception("Failed to execute query")
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "QUERY_EXECUTION_FAILED",
                    "message": "Failed to execute query",
                    "details": {"reason": str(e)},
                }
            },
        )


@app.post("/query/export")
async def query_export(
    payload: QueryRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: Annotated[dict, Depends(_require_current_user)],
    reportId: Optional[str] = None,
    shareToken: Optional[str] = None,
):
    try:
        owner_user_id = str(current_user.get("_id"))

        has_share_context = bool((reportId or "").strip() or (shareToken or "").strip())
        if has_share_context:
            if not reportId or not shareToken:
                raise HTTPException(status_code=400, detail="Both reportId and shareToken are required for shared query export")

            _, report_doc = await _resolve_shared_access(
                report_id=str(reportId).strip(),
                share_token=str(shareToken).strip(),
                current_user=current_user,
                request=request,
            )

            allowed_dataset_ids = _extract_report_dataset_ids(report_doc)
            requested_dataset_id = str(payload.datasetId or "").strip()
            if requested_dataset_id and allowed_dataset_ids and requested_dataset_id not in allowed_dataset_ids:
                raise HTTPException(status_code=403, detail="Dataset is not part of this shared report")

            owner_user_id = str(report_doc.get("owner_user_id") or "").strip() or owner_user_id

        response = await run_query(payload.model_dump(exclude_none=True), owner_user_id=owner_user_id)
        columns = response.get("columns", []) if isinstance(response, dict) else []
        rows = response.get("rows", []) if isinstance(response, dict) else []

        if isinstance(rows, list) and rows and isinstance(rows[0], dict):
            df = pd.DataFrame(rows)
        else:
            df = pd.DataFrame(rows, columns=columns)

        fd, temp_path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        await asyncio.to_thread(df.to_excel, temp_path, index=False)

        filename = f"query_export_{payload.datasetId}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.xlsx"
        background_tasks.add_task(os.remove, temp_path)
        return FileResponse(
            temp_path,
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except QueryEngineError as e:
        return JSONResponse(status_code=400, content=e.to_dict())
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_QUERY",
                    "message": str(e),
                    "details": {},
                }
            },
        )
    except Exception as e:
        logger.exception("Failed to export query")
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "QUERY_EXPORT_FAILED",
                    "message": "Failed to export query",
                    "details": {"reason": str(e)},
                }
            },
        )


@app.get("/health/query-runtime")
async def get_query_runtime_health(_current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        stats = get_query_runtime_stats()
        return {
            "status": "success",
            "runtime": stats,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        _raise_internal_error("Failed to fetch query runtime health", e)


@app.post("/semantic/measures")
async def create_semantic_measure(payload: SemanticMeasureCreateRequest, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        await _require_dataset_access(payload.datasetId, current_user)
        measure = set_measure(
            dataset_id=payload.datasetId,
            name=payload.name,
            expression=payload.expression,
        )
        clear_dataset_cache(payload.datasetId)
        return {
            "status": "success",
            "datasetId": payload.datasetId,
            "measure": measure,
        }
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_SEMANTIC_MEASURE",
                    "message": str(e),
                    "details": {},
                }
            },
        )


@app.get("/semantic/measures")
async def get_semantic_measures(
    datasetId: str,
    request: Request,
    current_user: Annotated[dict, Depends(_require_current_user)],
    reportId: Optional[str] = None,
    shareToken: Optional[str] = None,
):
    try:
        owner_user_id = str(current_user.get("_id"))
        has_share_context = bool((reportId or "").strip() or (shareToken or "").strip())

        if has_share_context:
            if not reportId or not shareToken:
                raise HTTPException(status_code=400, detail="Both reportId and shareToken are required for shared semantic access")

            _, report_doc = await _resolve_shared_access(
                report_id=str(reportId).strip(),
                share_token=str(shareToken).strip(),
                current_user=current_user,
                request=request,
            )

            allowed_dataset_ids = _extract_report_dataset_ids(report_doc)
            requested_dataset_id = str(datasetId or "").strip()
            if requested_dataset_id and allowed_dataset_ids and requested_dataset_id not in allowed_dataset_ids:
                raise HTTPException(status_code=403, detail="Dataset is not part of this shared report")

            owner_user_id = str(report_doc.get("owner_user_id") or "").strip() or owner_user_id
            doc = await get_dataset_for_query(datasetId, owner_user_id=owner_user_id)
            if not doc:
                raise HTTPException(status_code=404, detail=f"Dataset not found: {datasetId}")
        else:
            await _require_dataset_access(datasetId, current_user)

        items = list_measures(datasetId)
        return {
            "status": "success",
            "datasetId": datasetId,
            "count": len(items),
            "measures": items,
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to list semantic measures", e)


@app.put("/semantic/measures/{name}")
async def update_semantic_measure(name: str, payload: SemanticMeasureUpdateRequest, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        await _require_dataset_access(payload.datasetId, current_user)
        measure = set_measure(
            dataset_id=payload.datasetId,
            name=name,
            expression=payload.expression,
        )
        clear_dataset_cache(payload.datasetId)
        return {
            "status": "success",
            "datasetId": payload.datasetId,
            "measure": measure,
        }
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_SEMANTIC_MEASURE",
                    "message": str(e),
                    "details": {},
                }
            },
        )


@app.delete("/semantic/measures/{name}")
async def remove_semantic_measure(name: str, datasetId: str, current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        await _require_dataset_access(datasetId, current_user)
        removed = delete_measure(dataset_id=datasetId, name=name)
        if removed:
            clear_dataset_cache(datasetId)
        return {
            "status": "success",
            "datasetId": datasetId,
            "removed": removed,
            "name": name,
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Failed to delete semantic measure", e)


@app.get("/relationships")
async def get_relationships(_current_user: Annotated[dict, Depends(_require_current_user)], limit: int = 1000):
    try:
        items = await list_relationships(limit=limit)
        return {
            "status": "success",
            "count": len(items),
            "items": [_to_json_safe({k: v for k, v in item.items() if k != "_id"}) for item in items],
        }
    except Exception as e:
        _raise_internal_error("Failed to list relationships", e)


@app.post("/relationships")
async def create_relationship(payload: QueryJoin, _current_user: Annotated[dict, Depends(_require_current_user)]):
    try:
        result = await upsert_relationship(
            from_table=payload.from_table,
            from_column=payload.from_column,
            to_table=payload.to_table,
            to_column=payload.to_column,
        )
        return {
            "status": "success",
            "relationship": payload.model_dump(),
            "db_result": result,
        }
    except Exception as e:
        _raise_internal_error("Failed to save relationship", e)


@app.post("/hr/analytics/summary")
async def hr_analytics_summary(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("summary", payload)


@app.post("/hr/analytics/demographics")
async def hr_analytics_demographics(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("demographics", payload)


@app.post("/hr/analytics/hiring")
async def hr_analytics_hiring(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("hiring", payload)


@app.post("/hr/analytics/attrition")
async def hr_analytics_attrition(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("attrition", payload)


@app.post("/hr/analytics/experience")
async def hr_analytics_experience(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("experience", payload)


@app.post("/hr/analytics/org")
async def hr_analytics_org(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("org", payload)


@app.post("/hr/analytics/payroll")
async def hr_analytics_payroll(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("payroll", payload)


@app.post("/hr/analytics/education")
async def hr_analytics_education(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("education", payload)


@app.post("/hr/analytics/location")
async def hr_analytics_location(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("location", payload)


@app.post("/hr/analytics/department")
async def hr_analytics_department(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("department", payload)


@app.post("/hr/analytics/lifecycle")
async def hr_analytics_lifecycle(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("lifecycle", payload)


@app.post("/hr/analytics/compliance")
async def hr_analytics_compliance(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("compliance", payload)


@app.post("/hr/analytics/contact")
async def hr_analytics_contact(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("contact", payload)


@app.post("/hr/analytics/data-quality")
async def hr_analytics_data_quality(payload: HrAnalyticsRequest, _current_user: Annotated[dict, Depends(_require_current_user)]):
    return await _run_hr_analytics_module("data-quality", payload)


#The below endpoints are added for testiing
@app.get("/test/file")
async def get_test_excel_file(_current_user: Annotated[dict, Depends(_require_current_user)]):
    if not TEST_EXCEL_FILE.exists():
        raise HTTPException(status_code=404, detail="Test source file not found")

    media_type = mimetypes.guess_type(str(TEST_EXCEL_FILE))[0] or "application/octet-stream"

    return FileResponse(
        path=TEST_EXCEL_FILE,
        media_type=media_type,
        filename=TEST_EXCEL_FILE.name,
    )


@app.post("/test/source-config/excel")
async def add_test_excel_source_config(request: Request, current_user: Annotated[dict, Depends(_require_current_user)], source_id: str = "local_excel_test"):
    try:
        owner_user_id = str(current_user.get("_id"))
        api_endpoint = f"{str(request.base_url).rstrip('/')}/test/file"
        result = await upsert_source_config(
            source_id=source_id,
            owner_user_id=owner_user_id,
            name="Local Test Excel Source",
            api_endpoint=api_endpoint,
            source_type="api",
        )

        return {
            "status": "success",
            "source_id": source_id,
            "api_endpoint": api_endpoint,
            "db_result": result,
        }
    except Exception as e:
        _raise_internal_error("Failed to save source config", e)


@app.post("/test/source-config/sftp")
async def add_test_sftp_source_config(
    current_user: Annotated[dict, Depends(_require_current_user)],
    source_id: str = "local_sftp_test",
    host: str = "localhost",
    port: int = 22,
    username: str = DEFAULT_SFTP_USERNAME,
    private_key_path: str = DEFAULT_SFTP_PRIVATE_KEY_PATH,
    passphrase: Optional[str] = None,
    remote_path: str = DEFAULT_SFTP_REMOTE_PATH,
    known_hosts_path: Optional[str] = None,
):
    try:
        owner_user_id = str(current_user.get("_id"))
        sftp_config = {
            "host": host,
            "port": port,
            "username": username,
            "private_key_path": private_key_path,
            "remote_path": remote_path,
        }
        if passphrase:
            sftp_config["passphrase"] = passphrase
        if known_hosts_path:
            sftp_config["known_hosts_path"] = known_hosts_path

        result = await upsert_source_config(
            source_id=source_id,
            owner_user_id=owner_user_id,
            name="Local Test SFTP Source",
            source_type="sftp",
            sftp=sftp_config,
        )

        return {
            "status": "success",
            "source_id": source_id,
            "source_type": "sftp",
            "remote_path": remote_path,
            "db_result": result,
        }
    except Exception as e:
        _raise_internal_error("Failed to save SFTP source config", e)


@app.post("/test/ingest/excel")
async def ingest_test_excel(current_user: Annotated[dict, Depends(_require_current_user)], source_id: str = "local_excel_test"):
    try:
        owner_user_id = str(current_user.get("_id"))
        return await run_ingestion(source_id=source_id, owner_user_id=owner_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Ingestion failed", e)


@app.post("/test/ingest/sftp")
async def ingest_test_sftp(current_user: Annotated[dict, Depends(_require_current_user)], source_id: str = "local_sftp_test"):
    try:
        owner_user_id = str(current_user.get("_id"))
        return await run_ingestion(source_id=source_id, owner_user_id=owner_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Ingestion failed", e)