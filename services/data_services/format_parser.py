import pandas as pd
from io import BytesIO

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

    elif "tsv" in content_type:
        df = pd.read_csv(BytesIO(data), sep="\t")

    else:
        raise ValueError("Unsupported format")

    return df