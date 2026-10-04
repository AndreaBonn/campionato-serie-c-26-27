import json
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fip_calendar.config import (
    FIP_QUERY,
    FIP_RESULTS_URL,
    FIP_SARDEGNA_COMUNICATI_URL,
    FIP_SARDEGNA_POSTS_URL,
    LOGO_MAX_BYTES,
    LOGO_SOURCE_PREFIX,
    NOTICE_SEARCH_LIMIT,
    REQUEST_TIMEOUT_S,
    USER_AGENT,
)


def round_url(half_code: int, round_number: int) -> str:
    """fip.it/risultati address of one round of the CUS Cagliari girone."""
    query = {**FIP_QUERY, "codice_ar": str(half_code), "giornata": str(round_number)}
    return f"{FIP_RESULTS_URL}?{urlencode(query)}"


def fetch_round(half_code: int, round_number: int) -> str:
    """Download the fip.it/risultati page of one round. Network errors propagate."""
    request = Request(round_url(half_code=half_code, round_number=round_number))
    request.add_header("User-Agent", USER_AGENT)
    with urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
        body: bytes = response.read()
    return body.decode("utf-8")


def fetch_logo(url: str) -> bytes:
    """Download one crest image, refusing bodies larger than LOGO_MAX_BYTES."""
    request = Request(url)
    request.add_header("User-Agent", USER_AGENT)
    with urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
        # urlopen follows redirects: the host check made on the page URL must hold for the last hop
        final_url = response.geturl()
        if not final_url.startswith(LOGO_SOURCE_PREFIX):
            raise ValueError(f"crest redirected off the FIP backend: {url} -> {final_url}")
        body: bytes = response.read(LOGO_MAX_BYTES + 1)
    if len(body) > LOGO_MAX_BYTES:
        raise ValueError(f"crest larger than {LOGO_MAX_BYTES} bytes: {url}")
    return body


def _fetch_wp_items(url: str, after: str, filters: dict[str, str]) -> list[dict[str, Any]]:
    """Read recent FIP Sardegna items from a WordPress REST API collection."""
    query = {
        **filters,
        "after": after,
        "per_page": str(NOTICE_SEARCH_LIMIT),
        "_fields": "date,title,link",
    }
    request = Request(f"{url}?{urlencode(query)}")
    request.add_header("User-Agent", USER_AGENT)
    with urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
        items: list[dict[str, Any]] = json.loads(response.read().decode("utf-8"))
    return items


def fetch_posts(search: str, after: str) -> list[dict[str, Any]]:
    """Search FIP Sardegna posts through the WordPress REST API."""
    return _fetch_wp_items(url=FIP_SARDEGNA_POSTS_URL, after=after, filters={"search": search})


def fetch_category_posts(category: int, after: str) -> list[dict[str, Any]]:
    """FIP Sardegna posts filed under one category (e.g. "C REGIONALE")."""
    filters = {"categories": str(category)}
    return _fetch_wp_items(url=FIP_SARDEGNA_POSTS_URL, after=after, filters=filters)


def fetch_comunicati(after: str) -> list[dict[str, Any]]:
    """FIP Sardegna official comunicati, the section other regions use for judge decisions."""
    return _fetch_wp_items(url=FIP_SARDEGNA_COMUNICATI_URL, after=after, filters={})
