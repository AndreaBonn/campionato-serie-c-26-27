import logging
from datetime import date
from pathlib import Path

import pytest

from fip_calendar.boxscores import BoxscoreEntry, RoundDict
from fip_calendar.playbasket_sync import PlaybasketClient, collect_boxscores

TODAY = date(2026, 10, 18)
FIXTURES = Path(__file__).parent / "fixtures"
TITLE_ONLY = "<title>S. Orsola Sassari - Cus Cagliari 62-55 [3 Ott]</title>"
FULL_PAGE = (FIXTURES / "playbasket-a1-m6.html").read_text(encoding="utf-8")


def orsola_cus(game_date: str) -> list[RoundDict]:
    return [{"round": "A1", "games": [{
        "n": 6, "home": "BASKET S. ORSOLA", "away": "CUS CAGLIARI",
        "score": {"home": 62, "away": 55}, "date": game_date,
    }]}]


def collect_with_page(page: str, game_date: str) -> BoxscoreEntry:
    result = collect_boxscores(
        rounds=orsola_cus(game_date=game_date), previous={}, today=TODAY,
        client=PlaybasketClient(fetch=lambda half, round_number, mn: page, sleep=lambda _: None),
    )
    return result["6"]


def test_matched_page_without_player_points_warns_of_a_layout_change(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(level=logging.WARNING):
        entry = collect_with_page(page=TITLE_ONLY, game_date="2026-10-17")

    assert entry["status"] == "partial"
    assert "A1 n=6 mn=1: no player points" in caplog.text


def test_matched_page_with_player_points_does_not_warn(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(level=logging.WARNING):
        entry = collect_with_page(page=FULL_PAGE, game_date="2026-10-17")

    assert entry["status"] == "complete"
    assert caplog.text == ""


def test_game_frozen_as_incomplete_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    previous: dict[str, BoxscoreEntry] = {"6": {
        "round": "A1", "status": "partial", "fip_score": {"home": 62, "away": 55},
        "mn": 6, "url": "saved", "home": None, "away": None,
    }}
    rounds = orsola_cus(game_date="2026-10-03")

    def fetch(half: int, round_number: int, mn: int) -> str:
        pytest.fail(reason="an expired game is never requested")

    with caplog.at_level(level=logging.WARNING):
        result = collect_boxscores(rounds=rounds, previous=previous, today=TODAY,
                                   client=PlaybasketClient(fetch=fetch, sleep=lambda _: None))

    assert result["6"]["status"] == "incomplete"
    assert "A1 n=6 frozen as incomplete" in caplog.text


def test_first_attempt_past_the_window_logs_the_incomplete_box_score(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(level=logging.WARNING):
        entry = collect_with_page(page=TITLE_ONLY, game_date="2026-10-03")

    assert entry["status"] == "incomplete"
    assert "A1 n=6 frozen as incomplete" in caplog.text
