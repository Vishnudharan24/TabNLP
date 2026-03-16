import os
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Literal
from pathlib import Path
from services.data_services.ingestion_service import run_ingestion
from db.db_store import (
    upsert_source_config,
    ensure_indexes,
    get_source_config,
    list_source_configs,
    unset_source_config_fields,
)

app = FastAPI()

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
TEST_EXCEL_FILE = Path("/home/vishnudharan/odyssey/TabNLP/poweranalytics-desktop/data/Employee_Master_Data_260220261036.xlsx")
DEFAULT_SFTP_USERNAME = "sftp_user"
DEFAULT_SFTP_PRIVATE_KEY_PATH = str(Path.home() / ".ssh" / "id_rsa")
DEFAULT_SFTP_REMOTE_PATH = str(Path.home() / "odyssey" / "TabNLP" / "data" / "Employee_Master_Data_260220261036.xlsx")


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


def _serialize_source_config(source_config: dict):
    if not source_config:
        return None

    serialized = {key: value for key, value in source_config.items() if key != "_id"}
    return serialized


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


@app.on_event("startup")
async def startup_event():
    await ensure_indexes()

@app.post("/ingest")
async def ingest(source_id: Optional[str] = None, url: Optional[str] = None):
    try:
        result = await run_ingestion(source_id=source_id, url=url)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/source/{source_id}")
async def ingest_by_source_config(source_id: str):
    try:
        return await run_ingestion(source_id=source_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/source-config")
async def create_or_update_source_config(payload: SourceConfigUpsertRequest):
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
        raise HTTPException(status_code=500, detail=f"Failed to save source config: {str(e)}")


@app.get("/source-config")
async def get_all_source_configs(limit: int = 200):
    try:
        configs = await list_source_configs(limit=limit)
        return {
            "status": "success",
            "count": len(configs),
            "items": [_serialize_source_config(config) for config in configs],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list source configs: {str(e)}")


@app.get("/source-config/{source_id}")
async def get_source_config_by_id(source_id: str):
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
        raise HTTPException(status_code=500, detail=f"Failed to fetch source config: {str(e)}")


@app.patch("/source-config/{source_id}")
async def patch_source_config(source_id: str, payload: SourceConfigPatchRequest):
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
        raise HTTPException(status_code=500, detail=f"Failed to update source config: {str(e)}")





#The below endpoints are added for testiing
@app.get("/test/excel")
async def get_test_excel_file():
    if not TEST_EXCEL_FILE.exists():
        raise HTTPException(status_code=404, detail="Test Excel file not found")

    return FileResponse(
        path=TEST_EXCEL_FILE,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=TEST_EXCEL_FILE.name,
    )


@app.post("/test/source-config/excel")
async def add_test_excel_source_config(request: Request, source_id: str = "local_excel_test"):
    try:
        api_endpoint = f"{str(request.base_url).rstrip('/')}/test/excel"
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
        raise HTTPException(status_code=500, detail=f"Failed to save source config: {str(e)}")


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
        raise HTTPException(status_code=500, detail=f"Failed to save SFTP source config: {str(e)}")


@app.post("/test/ingest/excel")
async def ingest_test_excel(source_id: str = "local_excel_test"):
    try:
        return await run_ingestion(source_id=source_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/test/ingest/sftp")
async def ingest_test_sftp(source_id: str = "local_sftp_test"):
    try:
        return await run_ingestion(source_id=source_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))