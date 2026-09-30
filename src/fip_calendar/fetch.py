from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fip_calendar.config import (
    FIP_QUERY,
    FIP_RESULTS_URL,
    REQUEST_TIMEOUT_S,
    USER_AGENT,
)


def round_url(half_code: int, round_number: int) -> str:
    query = {**FIP_QUERY, "codice_ar": str(half_code), "giornata": str(round_number)}
    return f"{FIP_RESULTS_URL}?{urlencode(query)}"


def fetch_round(half_code: int, round_number: int) -> str:
    """Download the fip.it/risultati page of one round. Network errors propagate."""
    request = Request(round_url(half_code=half_code, round_number=round_number))
    request.add_header("User-Agent", USER_AGENT)
    with urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
        body: bytes = response.read()
    return body.decode("utf-8")
