import os
import math
import mimetypes
import logging
import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Request
from fastapi import Header
from fastapi import Depends
from fastapi import UploadFile
from fastapi import File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Literal, Any
from pathlib import Path
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from services.data_services.ingestion_service import run_ingestion, run_uploaded_file_ingestion
from services.hr.hr_analytics_service import compute_module
from services.chart.visualization_engine import (
    recommend_chart,
    generate_chart_config,
)
from services.query_engine import run_query
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
    get_source_config,
    list_source_configs,
    unset_source_config_fields,
    list_datasets,
    list_latest_datasets,
    get_latest_dataset_by_source,
    get_dataset_by_id,
    create_user,
    get_user_by_email,
    get_user_by_id,
    update_user_last_login,
    list_relationships,
    upsert_relationship,
)

app = FastAPI()
logger = logging.getLogger(__name__)

FRONTEND_ORIGINS = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
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

    serialized = {
        key: value
        for key, value in document.items()
        if key != "_id"
    }
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


def _raise_internal_error(public_message: str, exc: Exception):
    _ = exc
    logger.exception(public_message)
    raise HTTPException(status_code=500, detail=public_message)


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
async def auth_me(current_user: dict = Depends(_require_current_user)):
    try:
        return {
            "status": "success",
            "user": _to_json_safe(_user_public(current_user)),
        }
    except HTTPException:
        raise
    except Exception as e:
        _raise_internal_error("Authentication check failed", e)


@app.on_event("startup")
async def startup_event():
    await ensure_indexes()

@app.post("/ingest")
async def ingest(source_id: Optional[str] = None, url: Optional[str] = None, _current_user: dict = Depends(_require_current_user)):
    try:
        result = await run_ingestion(source_id=source_id, url=url)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Ingestion failed", e)


@app.post("/ingest/source/{source_id}")
async def ingest_by_source_config(source_id: str, _current_user: dict = Depends(_require_current_user)):
    try:
        return await run_ingestion(source_id=source_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Ingestion failed", e)


@app.post("/ingest/upload")
async def ingest_uploaded_file(file: UploadFile = File(...), current_user: dict = Depends(_require_current_user)):
    try:
        source_id = (current_user.get("name") or "").strip()
        if not source_id:
            raise ValueError("Authenticated user name is required for upload source id")

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
            source_details=source_details,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Ingestion failed", e)


@app.post("/source-config")
async def create_or_update_source_config(payload: SourceConfigUpsertRequest, _current_user: dict = Depends(_require_current_user)):
    try:
        config_payload = payload.model_dump(exclude_none=True)
        _validate_source_config(config_payload)

        result = await upsert_source_config(
            source_id=payload.source_id,
            name=payload.name,
            source_type=payload.source_type,
            api_endpoint=payload.api_endpoint,
            url=payload.url,
            sftp=payload.sftp.model_dump(exclude_none=True) if payload.sftp else None,
        )

        if payload.source_type == "api":
            await unset_source_config_fields(payload.source_id, ["sftp"])
        if payload.source_type == "sftp":
            await unset_source_config_fields(payload.source_id, ["api_endpoint", "url"])

        current = await get_source_config(payload.source_id)

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
async def get_all_source_configs(limit: int = 200, _current_user: dict = Depends(_require_current_user)):
    try:
        configs = await list_source_configs(limit=limit)
        return {
            "status": "success",
            "count": len(configs),
            "items": [_serialize_source_config(config) for config in configs],
        }
    except Exception as e:
        _raise_internal_error("Failed to list source configs", e)


@app.get("/source-config/{source_id}")
async def get_source_config_by_id(source_id: str, _current_user: dict = Depends(_require_current_user)):
    try:
        source_config = await get_source_config(source_id)
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
async def patch_source_config(source_id: str, payload: SourceConfigPatchRequest, _current_user: dict = Depends(_require_current_user)):
    try:
        existing = await get_source_config(source_id)
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
            name=merged["name"],
            source_type=merged["source_type"],
            api_endpoint=merged.get("api_endpoint"),
            url=merged.get("url"),
            sftp=merged.get("sftp"),
        )

        if merged["source_type"] == "api":
            await unset_source_config_fields(source_id, ["sftp"])
        if merged["source_type"] == "sftp":
            await unset_source_config_fields(source_id, ["api_endpoint", "url"])

        current = await get_source_config(source_id)

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
async def get_latest_datasets(limit: int = 100, _current_user: dict = Depends(_require_current_user)):
    try:
        documents = await list_latest_datasets(limit=limit)
        return {
            "status": "success",
            "count": len(documents),
            "items": [_serialize_dataset(document) for document in documents],
        }
    except Exception as e:
        _raise_internal_error("Failed to list datasets", e)


@app.get("/datasets")
async def get_all_datasets(limit: int = 1000, _current_user: dict = Depends(_require_current_user)):
    try:
        documents = await list_datasets(limit=limit)
        return {
            "status": "success",
            "count": len(documents),
            "items": [_serialize_dataset(document) for document in documents],
        }
    except Exception as e:
        _raise_internal_error("Failed to list all datasets", e)


@app.get("/datasets/latest/{source_id}")
async def get_latest_dataset_for_source(source_id: str, _current_user: dict = Depends(_require_current_user)):
    try:
        document = await get_latest_dataset_by_source(source_id)
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
async def get_dataset_document(document_id: str, _current_user: dict = Depends(_require_current_user)):
    try:
        document = await get_dataset_by_id(document_id)
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
async def chart_recommend(payload: ChartEngineRequest, _current_user: dict = Depends(_require_current_user)):
    try:
        return {
            "status": "success",
            **recommend_chart(columns=payload.columns, data=payload.data),
        }
    except Exception as e:
        _raise_internal_error("Failed to recommend chart", e)


@app.post("/chart/config")
async def chart_config(payload: ChartConfigRequest, _current_user: dict = Depends(_require_current_user)):
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
async def query_data(payload: QueryRequest, _current_user: dict = Depends(_require_current_user)):
    try:
        response = await run_query(payload.model_dump(exclude_none=True))
        return response
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


@app.post("/semantic/measures")
async def create_semantic_measure(payload: SemanticMeasureCreateRequest, _current_user: dict = Depends(_require_current_user)):
    try:
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
async def get_semantic_measures(datasetId: str, _current_user: dict = Depends(_require_current_user)):
    try:
        items = list_measures(datasetId)
        return {
            "status": "success",
            "datasetId": datasetId,
            "count": len(items),
            "measures": items,
        }
    except Exception as e:
        _raise_internal_error("Failed to list semantic measures", e)


@app.put("/semantic/measures/{name}")
async def update_semantic_measure(name: str, payload: SemanticMeasureUpdateRequest, _current_user: dict = Depends(_require_current_user)):
    try:
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
async def remove_semantic_measure(name: str, datasetId: str, _current_user: dict = Depends(_require_current_user)):
    try:
        removed = delete_measure(dataset_id=datasetId, name=name)
        if removed:
            clear_dataset_cache(datasetId)
        return {
            "status": "success",
            "datasetId": datasetId,
            "removed": removed,
            "name": name,
        }
    except Exception as e:
        _raise_internal_error("Failed to delete semantic measure", e)


@app.get("/relationships")
async def get_relationships(limit: int = 1000, _current_user: dict = Depends(_require_current_user)):
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
async def create_relationship(payload: QueryJoin, _current_user: dict = Depends(_require_current_user)):
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
async def hr_analytics_summary(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("summary", payload)


@app.post("/hr/analytics/demographics")
async def hr_analytics_demographics(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("demographics", payload)


@app.post("/hr/analytics/hiring")
async def hr_analytics_hiring(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("hiring", payload)


@app.post("/hr/analytics/attrition")
async def hr_analytics_attrition(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("attrition", payload)


@app.post("/hr/analytics/experience")
async def hr_analytics_experience(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("experience", payload)


@app.post("/hr/analytics/org")
async def hr_analytics_org(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("org", payload)


@app.post("/hr/analytics/payroll")
async def hr_analytics_payroll(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("payroll", payload)


@app.post("/hr/analytics/education")
async def hr_analytics_education(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("education", payload)


@app.post("/hr/analytics/location")
async def hr_analytics_location(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("location", payload)


@app.post("/hr/analytics/department")
async def hr_analytics_department(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("department", payload)


@app.post("/hr/analytics/lifecycle")
async def hr_analytics_lifecycle(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("lifecycle", payload)


@app.post("/hr/analytics/compliance")
async def hr_analytics_compliance(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("compliance", payload)


@app.post("/hr/analytics/contact")
async def hr_analytics_contact(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("contact", payload)


@app.post("/hr/analytics/data-quality")
async def hr_analytics_data_quality(payload: HrAnalyticsRequest, _current_user: dict = Depends(_require_current_user)):
    return await _run_hr_analytics_module("data-quality", payload)


#The below endpoints are added for testiing
@app.get("/test/file")
async def get_test_excel_file(_current_user: dict = Depends(_require_current_user)):
    if not TEST_EXCEL_FILE.exists():
        raise HTTPException(status_code=404, detail="Test source file not found")

    media_type = mimetypes.guess_type(str(TEST_EXCEL_FILE))[0] or "application/octet-stream"

    return FileResponse(
        path=TEST_EXCEL_FILE,
        media_type=media_type,
        filename=TEST_EXCEL_FILE.name,
    )


@app.post("/test/source-config/excel")
async def add_test_excel_source_config(request: Request, source_id: str = "local_excel_test", _current_user: dict = Depends(_require_current_user)):
    try:
        api_endpoint = f"{str(request.base_url).rstrip('/')}/test/file"
        result = await upsert_source_config(
            source_id=source_id,
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
    source_id: str = "local_sftp_test",
    host: str = "localhost",
    port: int = 22,
    username: str = DEFAULT_SFTP_USERNAME,
    private_key_path: str = DEFAULT_SFTP_PRIVATE_KEY_PATH,
    passphrase: Optional[str] = None,
    remote_path: str = DEFAULT_SFTP_REMOTE_PATH,
    known_hosts_path: Optional[str] = None,
    _current_user: dict = Depends(_require_current_user),
):
    try:
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
async def ingest_test_excel(source_id: str = "local_excel_test", _current_user: dict = Depends(_require_current_user)):
    try:
        return await run_ingestion(source_id=source_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Ingestion failed", e)


@app.post("/test/ingest/sftp")
async def ingest_test_sftp(source_id: str = "local_sftp_test", _current_user: dict = Depends(_require_current_user)):
    try:
        return await run_ingestion(source_id=source_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_internal_error("Ingestion failed", e)