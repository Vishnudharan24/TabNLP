import pandas as pd
from io import BytesIO
from pathlib import Path


def _is_unnamed_column(column_name) -> bool:
    text = str(column_name).strip().lower()
    return text == "" or text.startswith("unnamed")


def _promote_first_row_to_header_if_needed(df: pd.DataFrame) -> pd.DataFrame:
    """
    Some sources arrive with placeholder headers (e.g., Unnamed: 0 ...)
    while the real headers are in the first data row.
    This promotes the first row to header only when that pattern is likely.
    """
    if df.empty or len(df.columns) == 0 or len(df.index) == 0:
        return df

    unnamed_count = sum(1 for col in df.columns if _is_unnamed_column(col))
    min_unnamed_for_promotion = max(1, len(df.columns) // 2)
    if unnamed_count < min_unnamed_for_promotion:
        return df

    first_row = df.iloc[0]
    populated_values = [v for v in first_row.tolist() if not pd.isna(v) and str(v).strip() != ""]
    if len(populated_values) < max(2, len(df.columns) // 3):
        return df

    new_columns = []
    seen = {}
    for idx, raw in enumerate(first_row.tolist()):
        candidate = str(raw).strip() if not pd.isna(raw) else ""
        if candidate == "":
            original = str(df.columns[idx]).strip()
            candidate = original if original else f"column_{idx + 1}"

        if candidate in seen:
            seen[candidate] += 1
            candidate = f"{candidate}_{seen[candidate]}"
        else:
            seen[candidate] = 1

        new_columns.append(candidate)

    promoted = df.iloc[1:].reset_index(drop=True).copy()
    promoted.columns = new_columns
    promoted = promoted.dropna(axis=0, how="all").reset_index(drop=True)
    return promoted


def _normalize_excel_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    # Remove fully empty rows first.
    df = df.dropna(how="all").reset_index(drop=True)
    if df.empty:
        return df

    # Keep all columns (including Unnamed:* ones) and only drop fully empty rows.
    df = df.dropna(axis=0, how="all").reset_index(drop=True)
    return _promote_first_row_to_header_if_needed(df)


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
                return _promote_first_row_to_header_if_needed(pd.read_json(BytesIO(data)))

            if detected_format == "csv":
                return _promote_first_row_to_header_if_needed(pd.read_csv(BytesIO(data)))

            if detected_format == "tsv":
                return _promote_first_row_to_header_if_needed(pd.read_csv(BytesIO(data), sep="\t"))

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