from datetime import datetime
from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse


SENSITIVE_KEYS = {"password", "passphrase", "private_key", "private_key_path", "token", "secret"}


def _redact_sensitive(data):
    if isinstance(data, dict):
        redacted = {}
        for key, value in data.items():
            if key.lower() in SENSITIVE_KEYS:
                redacted[key] = "***REDACTED***"
            else:
                redacted[key] = _redact_sensitive(value)
        return redacted

    if isinstance(data, list):
        return [_redact_sensitive(item) for item in data]

    return data


def _extract_filename_from_content_disposition(content_disposition: str):
    if not content_disposition:
        return None

    parts = [part.strip() for part in content_disposition.split(";") if part.strip()]

    # RFC 5987: filename*=UTF-8''encoded-name.ext
    for part in parts:
        if part.lower().startswith("filename*="):
            value = part.split("=", 1)[1].strip().strip('"')
            if "''" in value:
                value = value.split("''", 1)[1]
            decoded = unquote(value)
            if decoded:
                return decoded

    # Legacy: filename="name.ext"
    for part in parts:
        if part.lower().startswith("filename="):
            value = part.split("=", 1)[1].strip().strip('"')
            if value:
                return value

    return None


def _extract_filename_from_source(source_url: str):
    if not source_url:
        return None

    # Works for URLs and paths (including sftp remote paths)
    parsed = urlparse(source_url)
    candidate_path = parsed.path or source_url
    name = PurePosixPath(candidate_path).name
    if name and "." in name:
        return name
    return None


def generate_metadata(source_url, df, source_type="api", source_details=None, response_headers=None):
    response_headers = response_headers or {}

    file_name = _extract_filename_from_content_disposition(
        response_headers.get("content-disposition", "")
    ) or _extract_filename_from_source(source_url)

    metadata = {
        "source": source_url,
        "source_type": source_type,
        "timestamp": datetime.now(),
        "row_count": len(df),
        "columns": list(df.columns),
        "file_name": file_name,
    }

    if source_details:
        metadata["source_details"] = _redact_sensitive(source_details)

    return metadata