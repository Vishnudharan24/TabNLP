import pandas as pd
from io import BytesIO
from pathlib import Path


def _normalize_excel_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    # Remove fully empty rows first.
    df = df.dropna(how="all").reset_index(drop=True)
    if df.empty:
        return df

    # Keep all columns (including Unnamed:* ones) and only drop fully empty rows.
    df = df.dropna(axis=0, how="all").reset_index(drop=True)
    return df


def _safe_text_head(data: bytes, size: int = 2048) -> str:
    if not data:
        return ""
    return data[:size].decode("utf-8", errors="ignore").strip()


def _guess_from_source_name(source_name: str) -> str:
    if not source_name:
        return ""

    suffix = Path(source_name).suffix.lower()
    if suffix in {".xlsx", ".xls", ".xlsm", ".xlsb"}:
        return "excel"
    if suffix == ".csv":
        return "csv"
    if suffix == ".tsv":
        return "tsv"
    if suffix == ".json":
        return "json"
    return ""


def _detect_format_order(data: bytes, content_type: str, source_name: str = "") -> list[str]:
    content_type = (content_type or "").lower()
    head = _safe_text_head(data)
    candidates = []

    # Header-driven hints
    if "json" in content_type:
        candidates.append("json")
    if "csv" in content_type:
        candidates.append("csv")
    if "tsv" in content_type or "tab-separated" in content_type:
        candidates.append("tsv")
    if (
        "excel" in content_type
        or "spreadsheetml" in content_type
        or "officedocument" in content_type
        or "application/vnd.ms-excel" in content_type
    ):
        candidates.append("excel")

    # Source-name hints (URL/path/file name)
    guessed = _guess_from_source_name(source_name)
    if guessed:
        candidates.append(guessed)

    # Byte/content sniffing hints
    if data.startswith(b"PK\x03\x04") or data.startswith(b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"):
        candidates.append("excel")
    if head.startswith("{") or head.startswith("["):
        candidates.append("json")
    if "\t" in head and head.count("\t") >= head.count(","):
        candidates.append("tsv")
    if "," in head:
        candidates.append("csv")

    # Always keep broad fallback attempts.
    for fallback in ["csv", "tsv", "json", "excel"]:
        candidates.append(fallback)

    # De-duplicate while preserving order.
    ordered = []
    for item in candidates:
        if item not in ordered:
            ordered.append(item)
    return ordered


def parse_data(data, content_type, source_name: str = ""):
    attempts = []

    for detected_format in _detect_format_order(data, content_type, source_name):
        try:
            if detected_format == "json":
                return pd.read_json(BytesIO(data))

            if detected_format == "csv":
                return pd.read_csv(BytesIO(data))

            if detected_format == "tsv":
                return pd.read_csv(BytesIO(data), sep="\t")

            if detected_format == "excel":
                df = pd.read_excel(BytesIO(data), engine="openpyxl")
                return _normalize_excel_dataframe(df)
        except Exception as exc:
            attempts.append(f"{detected_format}: {exc}")

    raise ValueError(
        "Unable to parse source data. "
        f"content_type='{content_type or 'unknown'}', "
        f"source='{source_name or 'unknown'}'. "
        f"Tried: {' | '.join(attempts[:4])}"
    )