import httpx

async def fetch_data(url: str):
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url)
        response.raise_for_status()

    return response.content, response.headers
