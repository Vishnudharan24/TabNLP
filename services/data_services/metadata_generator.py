from datetime import datetime, timezone
from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse
import pandas as pd


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

    def classify_declared_type(series: pd.Series) -> str:
        if pd.api.types.is_numeric_dtype(series):
            return "number"
        if pd.api.types.is_datetime64_any_dtype(series):
            return "date"
        if pd.api.types.is_bool_dtype(series):
            return "boolean"
        return "string"

    def infer_semantic_type(column_name: str, series: pd.Series) -> str:
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

        declared = classify_declared_type(series)
        if declared == "number":
            return "numeric"
        if declared == "date":
            return "date"
        return "categorical"

    file_name = _extract_filename_from_content_disposition(
        response_headers.get("content-disposition", "")
    ) or _extract_filename_from_source(source_url)

    metadata = {
        "source": source_url,
        "source_type": source_type,
        "timestamp": datetime.now(timezone.utc),
        "row_count": len(df),
        "columns": list(df.columns),
        "column_types": {column: classify_declared_type(df[column]) for column in df.columns},
        "column_semantic_types": {column: infer_semantic_type(column, df[column]) for column in df.columns},
        "relationships": [],
        "file_name": file_name,
    }

    if source_details:
        metadata["source_details"] = _redact_sensitive(source_details)

    return metadata