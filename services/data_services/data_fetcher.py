import httpx
import mimetypes

from services.data_services.sftp_fetcher import fetch_sftp_data


async def _fetch_api_data(url: str):
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url)
        response.raise_for_status()

    return response.content, response.headers


async def fetch_data(url: str = None, source_config: dict = None):
    source_config = source_config or {}
    source_type = source_config.get("source_type", "api")

    if source_type == "api":
        resolved_url = url or source_config.get("api_endpoint") or source_config.get("url")
        if not resolved_url:
            raise ValueError("API source requires url/api_endpoint")
        return await _fetch_api_data(resolved_url)

    if source_type == "sftp":
        sftp_config = source_config.get("sftp") or source_config
        data = await fetch_sftp_data(sftp_config)
        remote_path = sftp_config.get("remote_path", "")
        content_type = mimetypes.guess_type(remote_path)[0] or "application/octet-stream"
        return data, {"content-type": content_type, "x-source-type": "sftp"}

    raise ValueError(f"Unsupported source_type: {source_type}")
