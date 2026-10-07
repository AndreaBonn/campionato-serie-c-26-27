import logging
from copy import deepcopy
from datetime import date
from urllib.error import URLError

import pytest

from fip_calendar.boxscores import BoxscoreEntry, RoundDict
from fip_calendar.playbasket_sync import PlaybasketClient, collect_boxscores

TODAY = date(2026, 10, 18)
PAGE = "<title>S. Orsola Sassari - Cus Cagliari 62-55 [03/10/2026]</title>"
BROKEN_PLAYERS = PAGE + (
    '<table id="tableStandingsTeam0"><tbody><tr><td class="sq">'
    '<a href="profile.php?obj=1">Player</a></td><td class="divisore">bad</td>'
    '</tr></tbody></table>'
)


def make_round(code: str, number: int, game_date: str = "2026-10-03") -> RoundDict:
    return {"round": code, "games": [{
        "n": number, "home": "BASKET S. ORSOLA", "away": "CUS CAGLIARI",
        "score": {"home": 62, "away": 55}, "date": game_date,
    }]}


def saved_entry(code: str, status: str = "partial") -> BoxscoreEntry:
    return {"round": code, "status": status, "fip_score": {"home": 62, "away": 55},
            "mn": 1, "url": "saved", "home": None, "away": None}


def test_collect_boxscores_network_outage_preserves_previous_and_counts_attempts(
    caplog: pytest.LogCaptureFixture,
) -> None:
    calls: list[tuple[int, int, int]] = []
    sleeps: list[float] = []

    def fetch(half: int, round_number: int, mn: int) -> str:
        calls.append((half, round_number, mn))
        raise URLError(reason="offline")

    rounds = [make_round(code="A1", number=1, game_date="2026-10-17")]
    previous = {"1": saved_entry(code="A1")}
    original = deepcopy(x=(rounds, previous))
    with caplog.at_level(level=logging.INFO):
        result = collect_boxscores(rounds=rounds, previous=previous, today=TODAY,
                                   client=PlaybasketClient(fetch=fetch, sleep=sleeps.append))
    assert result == previous
    assert (rounds, previous) == original
    assert calls == [(1, 1, 1)]
    assert sleeps == []
    assert "A1" in caplog.text and "mn=1" in caplog.text and "offline" in caplog.text
    assert "playbasket: 1 pages requested" in caplog.text


@pytest.mark.parametrize(argnames="broken", argvalues=["<html></html>", BROKEN_PLAYERS])
def test_collect_boxscores_parse_failure_rolls_back_entire_round(
    broken: str, caplog: pytest.LogCaptureFixture,
) -> None:
    rounds = [make_round(code="A1", number=1, game_date="2026-10-17")]
    rounds[0]["games"] += make_round(code="A1", number=2, game_date="2026-10-17")["games"]
    rounds[0]["games"] += make_round(code="A1", number=3)["games"]
    rounds[0]["games"][1]["score"] = {"home": 90, "away": 80}
    previous = {"3": saved_entry(code="A1")}
    previous["3"]["mn"] = 3
    calls: list[int] = []

    def fetch(half: int, round_number: int, mn: int) -> str:
        calls.append(mn)
        return PAGE if mn == 1 else broken

    result = collect_boxscores(rounds=rounds, previous=previous, today=TODAY,
                               client=PlaybasketClient(fetch=fetch, sleep=lambda _: None))
    # game 3 is past its 14 days: it freezes whatever happens to the pages of the round
    assert result == {"3": {**previous["3"], "status": "incomplete"}}
    assert calls == [1, 2]
    assert "A1" in caplog.text and "mn=2" in caplog.text


def test_collect_boxscores_budget_stops_at_40_without_freezing_unvisited_games(
    caplog: pytest.LogCaptureFixture,
) -> None:
    rounds = [make_round(code=f"A{n}", number=n) for n in range(1, 16)]
    calls: list[tuple[int, int, int]] = []
    sleeps: list[float] = []

    def fetch(half: int, round_number: int, mn: int) -> str:
        calls.append((half, round_number, mn))
        return "<title>Unknown - Club 1-2 [03/10/2026]</title>"

    with caplog.at_level(level=logging.INFO):
        result = collect_boxscores(rounds=rounds, previous={}, today=TODAY,
                                   client=PlaybasketClient(fetch=fetch, sleep=sleeps.append))
    assert calls == [(1, n, mn) for n in range(1, 7) for mn in range(1, 7)] + [
        (1, 7, mn) for mn in range(1, 5)
    ]
    assert sleeps == [5.0] * 39
    assert set(result) == {str(n) for n in range(1, 7)}
    assert result["1"] == {"round": "A1", "status": "unmatched",
                           "fip_score": {"home": 62, "away": 55},
                           "mn": None, "url": None, "home": None, "away": None}
    assert "playbasket: 40 pages requested" in caplog.text


def test_collect_boxscores_follows_global_pending_priority_between_rounds() -> None:
    rounds = [make_round(code="A1", number=1, game_date="2026-10-04"),
              make_round(code="R1", number=3, game_date="2026-10-17")]
    rounds[0]["games"] += make_round(code="A1", number=2)["games"]
    rounds[0]["games"][1]["score"] = {"home": 90, "away": 80}
    calls: list[tuple[int, int, int]] = []

    def fetch(half: int, round_number: int, mn: int) -> str:
        calls.append((half, round_number, mn))
        return PAGE if mn == 1 else PAGE.replace("62-55", "90-80")

    result = collect_boxscores(rounds=rounds, previous={}, today=TODAY,
                               client=PlaybasketClient(fetch=fetch, sleep=lambda _: None))
    assert calls == [(1, 1, 1), (2, 1, 1), (1, 1, 2)]
    assert {n: entry["status"] for n, entry in result.items()} == {
        "1": "partial", "2": "incomplete", "3": "partial",
    }


def test_collect_boxscores_empty_run_logs_zero(caplog: pytest.LogCaptureFixture) -> None:
    def fetch(half: int, round_number: int, mn: int) -> str:
        pytest.fail(reason="Unexpected fetch")

    with caplog.at_level(level=logging.INFO):
        assert collect_boxscores(rounds=[], previous={}, today=TODAY,
                                  client=PlaybasketClient(fetch=fetch, sleep=lambda _: None)) == {}
    assert "playbasket: 0 pages requested" in caplog.text


def test_collect_boxscores_round_failure_does_not_discard_another_round() -> None:
    rounds = [make_round(code="A1", number=1), make_round(code="R1", number=2)]
    calls: list[tuple[int, int, int]] = []
    sleeps: list[float] = []

    def fetch(half: int, round_number: int, mn: int) -> str:
        calls.append((half, round_number, mn))
        if half == 1:
            raise URLError(reason="offline")
        return PAGE

    result = collect_boxscores(rounds=rounds, previous={}, today=TODAY,
                               client=PlaybasketClient(fetch=fetch, sleep=sleeps.append))
    assert calls == [(1, 1, 1), (2, 1, 1)]
    assert sleeps == [5.0]
    assert {n: entry["status"] for n, entry in result.items()} == {"2": "incomplete"}


def test_collect_boxscores_corrected_score_retries_frozen_page_and_reuses_parsed_pages() -> None:
    rounds = [make_round(code="A1", number=1)]
    rounds[0]["games"] += make_round(code="A1", number=2)["games"]
    rounds[0]["games"][1]["score"] = {"home": 90, "away": 80}
    previous = {"1": saved_entry(code="A1", status="complete")}
    previous["1"]["fip_score"] = {"home": 0, "away": 20}
    original = deepcopy(x=previous)
    calls: list[int] = []

    def fetch(half: int, round_number: int, mn: int) -> str:
        calls.append(mn)
        return PAGE if mn == 1 else PAGE.replace("62-55", "90-80")

    result = collect_boxscores(rounds=rounds, previous=previous, today=TODAY,
                               client=PlaybasketClient(fetch=fetch, sleep=lambda _: None))
    assert calls == [1, 2]
    assert {n: entry["status"] for n, entry in result.items()} == {
        "1": "incomplete", "2": "incomplete",
    }
    assert result["1"]["fip_score"] == {"home": 62, "away": 55}
    assert previous == original


@pytest.mark.parametrize(
    argnames="failure",
    argvalues=[TimeoutError("read timed out"), ConnectionResetError("reset"),
               UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte")],
)
def test_collect_boxscores_read_errors_keep_previous_state(failure: Exception) -> None:
    def fetch(half: int, round_number: int, mn: int) -> str:
        raise failure

    rounds = [make_round(code="A1", number=1, game_date="2026-10-17")]
    previous = {"1": saved_entry(code="A1")}

    result = collect_boxscores(rounds=rounds, previous=previous, today=TODAY,
                               client=PlaybasketClient(fetch=fetch, sleep=lambda _: None))

    assert result == previous


def test_collect_boxscores_failed_page_still_freezes_expired_partial_of_the_round() -> None:
    rounds = [make_round(code="A1", number=1)]
    rounds[0]["games"] += make_round(code="A1", number=2, game_date="2026-10-17")["games"]
    previous = {"1": saved_entry(code="A1")}

    def fetch(half: int, round_number: int, mn: int) -> str:
        raise URLError(reason="offline")

    result = collect_boxscores(rounds=rounds, previous=previous, today=TODAY,
                               client=PlaybasketClient(fetch=fetch, sleep=lambda _: None))

    assert result == {"1": {**previous["1"], "status": "incomplete"}}
