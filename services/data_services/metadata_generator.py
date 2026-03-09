from datetime import datetime


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


def generate_metadata(source_url, df, source_type="api", source_details=None):

    metadata = {
        "source": source_url,
        "source_type": source_type,
        "timestamp": datetime.now(),
        "row_count": len(df),
        "columns": list(df.columns)
    }

    if source_details:
        metadata["source_details"] = _redact_sensitive(source_details)

    return metadata