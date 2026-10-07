import json
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request

import pytest

from fip_calendar import fetch
from fip_calendar.config import (
    LOGO_MAX_BYTES,
    PLAYBASKET_FIRST_HALF,
    PLAYBASKET_SECOND_HALF,
    REQUEST_TIMEOUT_S,
    USER_AGENT,
)
from fip_calendar.fetch import (
    fetch_category_posts,
    fetch_comunicati,
    fetch_logo,
    fetch_posts,
    fetch_round,
    round_pdf_url,
    round_url,
)


class FakeResponse:
    def __init__(self, body: bytes, final_url: str = "") -> None:
        self.body = body
        self.final_url = final_url

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def read(self, limit: int = -1) -> bytes:
        return self.body if limit < 0 else self.body[:limit]

    def geturl(self) -> str:
        return self.final_url


class FakeUrlopen:
    """Stands in for the network: records each request and answers with a fixed body."""

    def __init__(self, body: bytes, redirect_to: str | None = None) -> None:
        self.body = body
        self.redirect_to = redirect_to
        self.requests: list[tuple[Request, float]] = []

    def __call__(self, request: Request, timeout: float) -> FakeResponse:
        self.requests.append((request, timeout))
        return FakeResponse(self.body, final_url=self.redirect_to or request.full_url)


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


def test_round_pdf_url_targets_fip_backend_report_of_one_round() -> None:
    url = round_pdf_url(half_code=0, round_number=11)

    assert url.startswith("https://backend.fip.it/api/v1/giornata.pdf?")
    assert query_of(url) == {
        "regione_codice": "SA",
        "comitato_codice": "RSA",
        "sesso": "M",
        "codice_campionato": "C1",
        "codice_fase": "1",
        "codice_girone": "85305",
        "codice_andata_ritorno": "0",
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


def test_playbasket_match_url_encodes_first_half_query_in_order() -> None:
    url = fetch.playbasket_match_url(half=PLAYBASKET_FIRST_HALF, round_number=1, mn=6)

    assert url == (
        "https://www.playbasket.it/sardegna/match.php?"
        "lt=2&lr=SA&lp=CA&lc=C%2FM&lg=1&season=2027&lf=M&gtt=1&gtn=1&mn=6"
    )


def test_playbasket_match_url_uses_second_half_code() -> None:
    url = fetch.playbasket_match_url(half=PLAYBASKET_SECOND_HALF, round_number=3, mn=2)

    assert "gtt=2&gtn=3&mn=2" in url


def test_fetch_playbasket_match_requests_page_with_user_agent_and_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeUrlopen(body=b"<html></html>")
    monkeypatch.setattr(fetch, "urlopen", fake)

    fetch.fetch_playbasket_match(half=PLAYBASKET_FIRST_HALF, round_number=1, mn=6)

    [(request, timeout)] = fake.requests
    assert (request.full_url, request.get_header("User-agent"), timeout) == (
        fetch.playbasket_match_url(half=PLAYBASKET_FIRST_HALF, round_number=1, mn=6),
        USER_AGENT,
        REQUEST_TIMEOUT_S,
    )


def test_fetch_playbasket_match_returns_page_decoded_as_utf8(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(fetch, "urlopen", FakeUrlopen(body="Quartu Sant’Elena".encode()))

    assert (
        fetch.fetch_playbasket_match(half=PLAYBASKET_FIRST_HALF, round_number=1, mn=6)
        == "Quartu Sant’Elena"
    )


def test_fetch_playbasket_match_network_error_propagates(monkeypatch: pytest.MonkeyPatch) -> None:
    def unreachable(request: Request, timeout: float) -> FakeResponse:
        raise URLError("playbasket.it unreachable")

    monkeypatch.setattr(fetch, "urlopen", unreachable)

    with pytest.raises(URLError, match="playbasket.it unreachable"):
        fetch.fetch_playbasket_match(half=PLAYBASKET_FIRST_HALF, round_number=1, mn=6)


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


def test_fetch_category_posts_asks_recent_posts_of_that_category(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeUrlopen(b"[]")
    monkeypatch.setattr(fetch, "urlopen", fake)

    fetch_category_posts(category=50, after="2026-09-23T00:00:00")

    [(request, _)] = fake.requests
    assert request.full_url.startswith("https://sardegna.fip.it/wp-json/wp/v2/posts?")
    assert query_of(request.full_url) == {
        "categories": "50",
        "after": "2026-09-23T00:00:00",
        "per_page": "20",
        "_fields": "date,title,link",
    }


def test_fetch_comunicati_asks_the_comunicato_post_type(monkeypatch: pytest.MonkeyPatch) -> None:
    items = [{"date": "2026-10-20T10:00:00", "title": {"rendered": "N. 1"}, "link": "x"}]
    fake = FakeUrlopen(json.dumps(items).encode())
    monkeypatch.setattr(fetch, "urlopen", fake)

    assert fetch_comunicati(after="2026-09-23T00:00:00") == items

    [(request, timeout)] = fake.requests
    assert request.full_url.startswith("https://sardegna.fip.it/wp-json/wp/v2/comunicato?")
    assert query_of(request.full_url) == {
        "after": "2026-09-23T00:00:00",
        "per_page": "20",
        "_fields": "date,title,link",
    }
    assert request.get_header("User-agent") == USER_AGENT
    assert timeout == REQUEST_TIMEOUT_S


def test_fetch_logo_returns_image_bytes_with_user_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeUrlopen(b"\x89PNG...")
    monkeypatch.setattr(fetch, "urlopen", fake)

    body = fetch_logo("https://backend.fip.it/x/logo.png")

    request, timeout = fake.requests[0]
    assert body == b"\x89PNG..."
    assert request.full_url == "https://backend.fip.it/x/logo.png"
    assert request.get_header("User-agent") == USER_AGENT
    assert timeout == REQUEST_TIMEOUT_S


def test_fetch_logo_oversized_body_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(fetch, "urlopen", FakeUrlopen(b"x" * (LOGO_MAX_BYTES + 1)))

    with pytest.raises(ValueError, match="larger than"):
        fetch_logo("https://backend.fip.it/x/huge.jpg")


def test_fetch_logo_body_at_the_limit_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(fetch, "urlopen", FakeUrlopen(b"x" * LOGO_MAX_BYTES))

    assert len(fetch_logo("https://backend.fip.it/x/big.jpg")) == LOGO_MAX_BYTES


def test_fetch_logo_redirect_off_the_fip_backend_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(fetch, "urlopen", FakeUrlopen(b"png", redirect_to="https://evil.example/x"))

    with pytest.raises(ValueError, match="redirected"):
        fetch_logo("https://backend.fip.it/x/logo.png")


def test_fetch_logo_redirect_within_the_fip_backend_is_followed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeUrlopen(b"png", redirect_to="https://backend.fip.it/storage/logo.png")
    monkeypatch.setattr(fetch, "urlopen", fake)

    assert fetch_logo("https://backend.fip.it/x/logo.png") == b"png"
