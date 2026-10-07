import json
from copy import deepcopy
from datetime import date
from pathlib import Path

import pytest

from fip_calendar.boxscores import RoundDict
from fip_calendar.playbasket_sync import PlaybasketClient, collect_boxscores, parse_round

ROOT = Path(__file__).resolve().parents[1]
TODAY = date(2026, 10, 7)


def load_rounds() -> list[RoundDict]:
    # frozen copy of round A1: docs/data.json follows fip.it and must not break the tests
    rounds: list[RoundDict] = json.loads(
        s=(ROOT / "tests/fixtures/rounds-a1.json").read_text(encoding="utf-8")
    )
    return rounds


class FixtureClient:
    def __init__(self) -> None:
        self.calls: list[tuple[int, int, int]] = []
        self.events: list[str | float] = []

    def fetch(self, half: int, round_number: int, mn: int) -> str:
        self.calls.append((half, round_number, mn))
        self.events.append("fetch")
        return (ROOT / f"tests/fixtures/playbasket-a1-m{mn}.html").read_text(encoding="utf-8")

    def sleep(self, seconds: float) -> None:
        self.events.append(seconds)

    def client(self) -> PlaybasketClient:
        return PlaybasketClient(fetch=self.fetch, sleep=self.sleep)


def test_collect_boxscores_real_a1_freezes_six_matches_and_preserves_inputs() -> None:
    rounds, fake = load_rounds(), FixtureClient()
    original = deepcopy(x=rounds)
    result = collect_boxscores(rounds=rounds, previous={}, today=TODAY, client=fake.client())
    assert {n: entry["status"] for n, entry in result.items()} == {
        str(n): "complete" for n in range(1, 7)
    }
    assert fake.calls == [(1, 1, mn) for mn in range(1, 7)]
    assert fake.events == ["fetch", 5.0] * 5 + ["fetch"]
    assert rounds == original
    previous = deepcopy(x=result)
    second = FixtureClient()
    assert collect_boxscores(
        rounds=rounds, previous=result, today=TODAY, client=second.client(),
    ) == previous
    assert second.calls == []
    assert result == previous
    assert collect_boxscores(
        rounds=rounds, previous={}, today=TODAY, client=FixtureClient().client(),
    ) == result


def test_collect_boxscores_serializes_original_names_players_and_constructed_url() -> None:
    result = collect_boxscores(
        rounds=load_rounds(), previous={}, today=TODAY, client=FixtureClient().client(),
    )
    entry = result["6"]
    assert set(entry) == {"round", "status", "fip_score", "mn", "url", "home", "away"}
    assert (entry["round"], entry["mn"], entry["fip_score"]) == ("A1", 6, {"home": 62, "away": 55})
    assert entry["url"] == (
        "https://www.playbasket.it/sardegna/match.php?lt=2&lr=SA&lp=CA&lc=C%2FM"
        "&lg=1&season=2027&lf=M&gtt=1&gtn=1&mn=6"
    )
    home, away = entry["home"], entry["away"]
    assert home and away
    assert (home["team"], away["team"]) == ("S. Orsola Sassari", "Cus Cagliari")
    assert sum(player["pts"] or 0 for player in home["players"]) == 62
    assert sum(player["pts"] or 0 for player in away["players"]) == 55
    assert set(home["players"][0]) == {"id", "number", "name", "role", "age", "pts"}
    assert json.loads(s=json.dumps(obj=result)) == result


def test_collect_boxscores_skips_frozen_pages_and_stops_at_expected_match() -> None:
    rounds = load_rounds()
    previous = collect_boxscores(
        rounds=rounds, previous={}, today=TODAY, client=FixtureClient().client(),
    )
    previous["6"]["status"] = "partial"
    fake = FixtureClient()
    result = collect_boxscores(rounds=rounds, previous=previous, today=TODAY, client=fake.client())
    assert result["6"]["status"] == "complete"
    assert fake.calls == [(1, 1, 6)]
    assert fake.events == ["fetch"]
    assert result["1"] == previous["1"]
    expired = FixtureClient()
    result = collect_boxscores(
        rounds=rounds, previous=previous, today=date(2026, 11, 1), client=expired.client(),
    )
    assert result["6"] == {**previous["6"], "status": "incomplete"}
    assert previous["6"]["status"] == "partial"
    assert expired.calls == []


def test_collect_boxscores_searches_remaining_pages_when_hint_is_wrong() -> None:
    rounds = load_rounds()
    rounds[0]["games"] = [game for game in rounds[0]["games"] if game["n"] == 6]
    fake = FixtureClient()
    result = collect_boxscores(rounds=rounds, previous={}, today=TODAY, client=fake.client())
    assert result["6"]["mn"] == 6
    assert fake.calls == [(1, 1, mn) for mn in range(1, 7)]


@pytest.mark.parametrize(argnames="code,expected", argvalues=[("A5", (1, 5)), ("R3", (2, 3))])
def test_parse_round_maps_half_and_number(code: str, expected: tuple[int, int]) -> None:
    assert parse_round(code=code) == expected


def test_collect_boxscores_page_matching_a_later_game_is_not_requested_again() -> None:
    first = "<title>S. Orsola Sassari - Cus Cagliari 62-55 [03/10/2026]</title>"
    second = "<title>Olimpia Cagliari - Sef Torres Sassari 70-60 [03/10/2026]</title>"
    rounds: list[RoundDict] = [
        {
            "round": "A1",
            "games": [
                {
                    "n": 1,
                    "home": "BASKET S. ORSOLA",
                    "away": "CUS CAGLIARI",
                    "score": {"home": 62, "away": 55},
                    "date": "2026-10-03",
                },
                {
                    "n": 2,
                    "home": "OLIMPIA CAGLIARI",
                    "away": "SEF TORRES",
                    "score": {"home": 70, "away": 60},
                    "date": "2026-10-03",
                },
            ],
        }
    ]
    calls: list[int] = []

    def fetch(half: int, round_number: int, mn: int) -> str:
        calls.append(mn)
        return second if mn == 1 else first

    result = collect_boxscores(
        rounds=rounds,
        previous={},
        today=TODAY,
        client=PlaybasketClient(fetch=fetch, sleep=lambda _: None),
    )
    assert (result["1"]["mn"], result["2"]["mn"]) == (2, 1)
    assert calls == [1, 2]
