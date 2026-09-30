import json
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request

import pytest

from fip_calendar import fetch
from fip_calendar.config import REQUEST_TIMEOUT_S, USER_AGENT
from fip_calendar.fetch import fetch_posts, fetch_round, round_url


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def read(self) -> bytes:
        return self.body


class FakeUrlopen:
    """Stands in for the network: records each request and answers with a fixed body."""

    def __init__(self, body: bytes) -> None:
        self.body = body
        self.requests: list[tuple[Request, float]] = []

    def __call__(self, request: Request, timeout: float) -> FakeResponse:
        self.requests.append((request, timeout))
        return FakeResponse(self.body)


def query_of(url: str) -> dict[str, str]:
    return {key: values[0] for key, values in parse_qs(urlsplit(url).query).items()}


def test_round_url_targets_serie_c_girone_with_half_and_round() -> None:
    url = round_url(half_code=0, round_number=11)

    assert url.startswith("https://fip.it/risultati/?")
    assert query_of(url) == {
        "group": "campionati-regionali",
        "regione_codice": "SA",
        "comitato_codice": "RSA",
        "sesso": "M",
        "codice_campionato": "C1",
        "codice_fase": "1",
        "codice_girone": "85305",
        "codice_ar": "0",
        "giornata": "11",
    }


def test_fetch_round_returns_page_decoded_as_utf8(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(fetch, "urlopen", FakeUrlopen("Quartu Sant’Elena".encode()))

    assert fetch_round(half_code=1, round_number=3) == "Quartu Sant’Elena"


def test_fetch_round_requests_round_page_with_user_agent_and_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeUrlopen(b"<html></html>")
    monkeypatch.setattr(fetch, "urlopen", fake)

    fetch_round(half_code=1, round_number=3)

    [(request, timeout)] = fake.requests
    assert (request.full_url, request.get_header("User-agent"), timeout) == (
        round_url(half_code=1, round_number=3),
        USER_AGENT,
        REQUEST_TIMEOUT_S,
    )


def test_fetch_round_network_error_propagates(monkeypatch: pytest.MonkeyPatch) -> None:
    def unreachable(request: Request, timeout: float) -> FakeResponse:
        raise URLError("fip.it unreachable")

    monkeypatch.setattr(fetch, "urlopen", unreachable)

    with pytest.raises(URLError):
        fetch_round(half_code=1, round_number=1)


def test_fetch_posts_returns_decoded_api_items(monkeypatch: pytest.MonkeyPatch) -> None:
    items = [{"date": "2026-10-20T10:00:00", "title": {"rendered": "Formula"}, "link": "x"}]
    monkeypatch.setattr(fetch, "urlopen", FakeUrlopen(json.dumps(items).encode()))

    assert fetch_posts(search="formula", after="2026-09-23T00:00:00") == items


def test_fetch_posts_asks_only_recent_matching_posts_with_needed_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeUrlopen(b"[]")
    monkeypatch.setattr(fetch, "urlopen", fake)

    fetch_posts(search="playoff", after="2026-09-23T00:00:00")

    [(request, _)] = fake.requests
    assert request.full_url.startswith("https://sardegna.fip.it/wp-json/wp/v2/posts?")
    assert query_of(request.full_url) == {
        "search": "playoff",
        "after": "2026-09-23T00:00:00",
        "per_page": "20",
        "_fields": "date,title,link",
    }
