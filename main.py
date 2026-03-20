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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Literal
from pathlib import Path
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from services.data_services.ingestion_service import run_ingestion
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