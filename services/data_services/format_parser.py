import pandas as pd
from io import BytesIO


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


def parse_data(data, content_type):

    if "json" in content_type:
        df = pd.read_json(data)

    elif "csv" in content_type:
        df = pd.read_csv(BytesIO(data))

    elif (
        "excel" in content_type
        or "spreadsheetml" in content_type
        or "officedocument" in content_type
        or "application/vnd.ms-excel" in content_type
    ):
        df = pd.read_excel(BytesIO(data))
        df = _normalize_excel_dataframe(df)

    elif "tsv" in content_type:
        df = pd.read_csv(BytesIO(data), sep="\t")

    else:
        raise ValueError("Unsupported format")

    return df