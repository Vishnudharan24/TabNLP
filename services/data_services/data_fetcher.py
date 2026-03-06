import requests

def fetch_data(url: str):
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    
    return response.content, response.headers
