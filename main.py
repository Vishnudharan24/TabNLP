from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Request
from fastapi.responses import FileResponse
from typing import Optional
from pathlib import Path
from services.data_services.ingestion_service import run_ingestion
from db.db_store import upsert_source_config, ensure_indexes

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
TEST_EXCEL_FILE = DATA_DIR / "Employee_Master_Data_260220261036.xlsx"
DEFAULT_SFTP_USERNAME = "sftp_user"
DEFAULT_SFTP_PRIVATE_KEY_PATH = str(Path.home() / ".ssh" / "id_rsa")
DEFAULT_SFTP_REMOTE_PATH = str(Path.home() / "odyssey" / "TabNLP" / "data" / "Employee_Master_Data_260220261036.xlsx")


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