from dataclasses import replace
from typing import Any

import pytest

from fip_calendar.merge import MergeError, build_data, merge_game
from fip_calendar.parse import FipMatch, Standing

VENUES = {
    "palacus": {"name": "PALACUS", "address": "Via Is Mirrionis 3-9, Cagliari"},
    "simula": {"name": "Palestra Luca Simula", "address": "Via Poligono 2, Sassari"},
}
BASE: dict[str, Any] = {
    "round": "R1",
    "n": 69,
    "date": "2026-12-20",
    "time": "18:00",
    "home": "CUS Cagliari",
    "away": "Basket S. Orsola",
    "venue": "palacus",
}
FIP = FipMatch(
    number=69,
    home="CUS CAGLIARI",
    away="BASKET S. ORSOLA",
    date="2026-12-20",
    time="18:00",
    venue="PALACUS, Via Is Mirrionis 3 - 9 09123 CAGLIARI (CA)",
    status="non-designata",
    status_text="Gara non ancora designata",
    referees=(),
    score=None,
)
TEAM = "CUS CAGLIARI"


def test_merge_game_unchanged_schedule_reports_no_changes() -> None:
    game = merge_game(base=BASE, venues=VENUES, match=FIP, fip_team=TEAM)

    assert game["changes"] == []
    assert game["is_home"] is True
    assert game["date"] == "2026-12-20"
    assert game["venue"] == {
        "name": "PALACUS",
        "address": "Via Is Mirrionis 3 - 9 09123 CAGLIARI (CA)",
    }
    assert game["official"]["venue"] == VENUES["palacus"]


def test_merge_game_new_time_and_date_are_flagged_and_used() -> None:
    moved = replace(FIP, date="2026-12-21", time="20:30")

    game = merge_game(base=BASE, venues=VENUES, match=moved, fip_team=TEAM)

    assert game["changes"] == ["date", "time"]
    assert (game["date"], game["time"]) == ("2026-12-21", "20:30")
    assert (game["official"]["date"], game["official"]["time"]) == ("2026-12-20", "18:00")


def test_merge_game_venue_name_is_compared_case_insensitively() -> None:
    same = replace(FIP, venue="Palacus, Via Is Mirrionis 3 - 9 09123 CAGLIARI (CA)")
    moved = replace(FIP, venue="PalaPirastu, Via Rockefeller 09126 CAGLIARI (CA)")

    assert merge_game(base=BASE, venues=VENUES, match=same, fip_team=TEAM)["changes"] == []
    game = merge_game(base=BASE, venues=VENUES, match=moved, fip_team=TEAM)
    assert game["changes"] == ["venue"]
    assert game["venue"]["name"] == "PalaPirastu"


def test_merge_game_missing_fip_venue_keeps_official_venue() -> None:
    no_venue = replace(FIP, venue="")

    game = merge_game(base=BASE, venues=VENUES, match=no_venue, fip_team=TEAM)

    assert game["changes"] == []
    assert game["venue"] == VENUES["palacus"]


def test_merge_game_swapped_home_team_is_flagged_and_teams_swapped() -> None:
    swapped = replace(FIP, home="BASKET S. ORSOLA", away="CUS CAGLIARI")

    game = merge_game(base=BASE, venues=VENUES, match=swapped, fip_team=TEAM)

    assert "home" in game["changes"]
    assert game["is_home"] is False
    assert (game["home"], game["away"]) == ("Basket S. Orsola", "CUS Cagliari")


def test_merge_game_copies_referees_and_score() -> None:
    played = replace(
        FIP, status="omologata", referees=("ROSSI MARIO di CAGLIARI (CA)",), score=(71, 64)
    )

    game = merge_game(base=BASE, venues=VENUES, match=played, fip_team=TEAM)

    assert game["referees"] == ["ROSSI MARIO di CAGLIARI (CA)"]
    assert game["score"] == {"home": 71, "away": 64}
    assert game["status"] == "omologata"


def test_merge_game_match_without_team_raises() -> None:
    other = replace(FIP, home="SEF TORRES", away="PALL. NUORO")

    with pytest.raises(MergeError):
        merge_game(base=BASE, venues=VENUES, match=other, fip_team=TEAM)


def test_build_data_missing_fip_match_raises() -> None:
    calendar = {"fip_team": TEAM, "venues": VENUES, "games": [BASE]}

    with pytest.raises(MergeError):
        build_data(calendar=calendar, matches={}, standings=[])


def test_build_data_includes_games_and_standings() -> None:
    calendar = {"fip_team": TEAM, "venues": VENUES, "games": [BASE]}
    row = Standing(
        position=1, team=TEAM, points=2, played=1, won=1, lost=0, points_for=70, points_against=60
    )

    data = build_data(calendar=calendar, matches={69: FIP}, standings=[row])

    assert [g["n"] for g in data["games"]] == [69]
    assert data["standings"][0]["team"] == TEAM
    assert data["standings"][0]["points"] == 2
