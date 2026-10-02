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
        build_data(calendar=calendar, rounds={"R1": []}, standings=[])


def test_build_data_includes_games_and_standings() -> None:
    calendar = {"fip_team": TEAM, "venues": VENUES, "games": [BASE]}
    row = Standing(
        position=1, team=TEAM, points=2, played=1, won=1, lost=0, points_for=70, points_against=60
    )

    data = build_data(calendar=calendar, rounds={"R1": [FIP]}, standings=[row])

    assert [g["n"] for g in data["games"]] == [69]
    assert data["standings"][0]["team"] == TEAM
    assert data["standings"][0]["points"] == 2


def test_build_data_lists_every_game_of_each_round_in_calendar_order() -> None:
    calendar = {"fip_team": TEAM, "venues": VENUES, "games": [BASE]}
    other = replace(FIP, number=67, home="SEF TORRES", away="PALL. NUORO", score=(80, 75))

    data = build_data(calendar=calendar, rounds={"R1": [FIP, other]}, standings=[])

    assert data["rounds"] == [
        {
            "round": "R1",
            "games": [
                {
                    "n": 67,
                    "home": "SEF TORRES",
                    "away": "PALL. NUORO",
                    "date": "2026-12-20",
                    "time": "18:00",
                    "status": "non-designata",
                    "score": {"home": 80, "away": 75},
                },
                {
                    "n": 69,
                    "home": "CUS CAGLIARI",
                    "away": "BASKET S. ORSOLA",
                    "date": "2026-12-20",
                    "time": "18:00",
                    "status": "non-designata",
                    "score": None,
                },
            ],
        }
    ]


def test_merge_game_time_change_alone_is_flagged() -> None:
    later = replace(FIP, time="20:30")

    game = merge_game(base=BASE, venues=VENUES, match=later, fip_team=TEAM)

    assert game["changes"] == ["time"]


def test_merge_game_away_game_keeps_official_names_and_orientation() -> None:
    away_base = {**BASE, "home": "Basket S. Orsola", "away": "CUS Cagliari", "venue": "simula"}
    away_fip = replace(FIP, home="BASKET S. ORSOLA", away="CUS CAGLIARI", venue="")

    game = merge_game(base=away_base, venues=VENUES, match=away_fip, fip_team=TEAM)

    assert (game["home"], game["away"], game["is_home"], game["changes"]) == (
        "Basket S. Orsola",
        "CUS Cagliari",
        False,
        [],
    )


def test_merge_game_fip_venue_without_address_keeps_whole_name() -> None:
    bare = replace(FIP, venue="PALACUS")

    game = merge_game(base=BASE, venues=VENUES, match=bare, fip_team=TEAM)

    assert game["venue"] == {"name": "PALACUS", "address": ""}


def test_merge_game_venue_name_ignores_repeated_inner_spaces() -> None:
    at_simula = {**BASE, "venue": "simula"}
    spaced = replace(FIP, venue="PALESTRA  LUCA   SIMULA, Via Poligono 2 07100 SASSARI (SS)")

    assert merge_game(base=at_simula, venues=VENUES, match=spaced, fip_team=TEAM)["changes"] == []


def test_build_data_empty_calendar_and_rounds_gives_empty_document() -> None:
    calendar = {"fip_team": TEAM, "venues": VENUES, "games": []}

    assert build_data(calendar=calendar, rounds={}, standings=[]) == {
        "games": [],
        "rounds": [],
        "standings": [],
    }


def test_merge_game_unknown_calendar_venue_raises_merge_error() -> None:
    typo = {**BASE, "venue": "palacuss"}

    with pytest.raises(MergeError):
        merge_game(base=typo, venues=VENUES, match=FIP, fip_team=TEAM)


def test_merge_game_team_name_case_change_on_fip_still_matches() -> None:
    recased = replace(FIP, home="Cus Cagliari")

    game = merge_game(base=BASE, venues=VENUES, match=recased, fip_team=TEAM)

    assert (game["is_home"], game["changes"]) == (True, [])


def test_merge_game_calendar_game_without_team_raises_merge_error() -> None:
    typo = {**BASE, "home": "CUS Cagliri"}

    with pytest.raises(MergeError):
        merge_game(base=typo, venues=VENUES, match=FIP, fip_team=TEAM)
