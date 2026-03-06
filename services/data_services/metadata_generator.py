from datetime import datetime

def generate_metadata(source_url, df):

    metadata = {
        "source": source_url,
        "timestamp": datetime.now(),
        "row_count": len(df),
        "columns": list(df.columns)
    }

    return metadata