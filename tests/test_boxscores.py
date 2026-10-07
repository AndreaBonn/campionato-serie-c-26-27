import json
from copy import deepcopy
from datetime import date
from pathlib import Path

import pytest

from fip_calendar.boxscores import (
    BoxscoreEntry,
    FipGame,
    MatchResult,
    RoundDict,
    classify,
    match_round,
    select_pending,
)
from fip_calendar.playbasket import PbHeader, parse_header

ROOT = Path(__file__).resolve().parents[1]
HOME = "BASKET S. ORSOLA"
AWAY = "CUS CAGLIARI"
PAGE = PbHeader(home="S. Orsola Sassari", away="Cus Cagliari", score=(62, 55))


def game(number: int = 6) -> FipGame:
    return {"n": number, "home": HOME, "away": AWAY, "score": {"home": 62, "away": 55}}


def test_match_round_real_a1_matches_all_six_pages_without_mutation() -> None:
    data = json.loads(s=(ROOT / "docs/data.json").read_text(encoding="utf-8"))
    fip_games: list[FipGame] = next(r["games"] for r in data["rounds"] if r["round"] == "A1")
    pages = {
        mn: parse_header(
            html=(ROOT / f"tests/fixtures/playbasket-a1-m{mn}.html").read_text(encoding="utf-8")
        )
        for mn in range(1, 7)
    }
    original = deepcopy(x=(fip_games, pages))

    result = match_round(fip_games, pages)

    assert result == MatchResult(matches={1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6}, unmatched={})
    assert (fip_games, pages) == original


def test_match_round_same_score_different_teams_resolves_by_alias() -> None:
    pages = {
        17: PbHeader(home="CMB Porto Torres", away="Aurea Sassari", score=(62, 55)),
        23: PAGE,
    }
    assert match_round(fip_games=[game()], pages=pages) == MatchResult(
        matches={6: 23}, unmatched={}
    )


@pytest.mark.parametrize(argnames="side", argvalues=["home", "away"])
@pytest.mark.parametrize(argnames="name", argvalues=["Unknown Club", "Aurea Sassari"])
def test_match_round_missing_or_wrong_alias_reports_page_and_name(side: str, name: str) -> None:
    page = PbHeader(
        home=name if side == "home" else PAGE.home,
        away=name if side == "away" else PAGE.away,
        score=PAGE.score,
    )
    assert match_round(fip_games=[game()], pages={23: PAGE}).matches == {6: 23}

    result = match_round(fip_games=[game()], pages={23: page})

    assert result.matches == {}
    assert "mn=23" in result.unmatched[6]
    assert name in result.unmatched[6]


@pytest.mark.parametrize(argnames="score", argvalues=[(63, 55), (55, 62), None])
def test_match_round_different_score_reports_page_without_matching(
    score: tuple[int, int] | None,
) -> None:
    page = PbHeader(home=PAGE.home, away=PAGE.away, score=score)
    assert match_round(fip_games=[game()], pages={23: PAGE}).matches == {6: 23}

    result = match_round(fip_games=[game()], pages={23: page})

    assert result.matches == {}
    assert "mn=23" in result.unmatched[6]
    assert "score" in result.unmatched[6]


def test_match_round_case_variants_match_aliases() -> None:
    fip_game = game()
    fip_game = {**fip_game, "home": HOME.lower(), "away": AWAY.lower()}
    page = PbHeader(home=PAGE.home.upper(), away=PAGE.away.upper(), score=PAGE.score)
    assert match_round(fip_games=[fip_game], pages={23: page}).matches == {6: 23}


def test_match_round_duplicate_valid_pages_reports_ambiguity() -> None:
    assert match_round(fip_games=[game()], pages={23: PAGE}).matches == {6: 23}
    result = match_round(fip_games=[game()], pages={23: PAGE, 17: PAGE})
    assert result.matches == {}
    assert "mn=23" in result.unmatched[6]
    assert "mn=17" in result.unmatched[6]
    assert "ambiguous" in result.unmatched[6]


@pytest.mark.parametrize(argnames="numbers", argvalues=[(6, 7), (7, 6)])
def test_match_round_page_shared_by_games_rejects_both(numbers: tuple[int, int]) -> None:
    assert match_round(fip_games=[game()], pages={23: PAGE}).matches == {6: 23}
    result = match_round(fip_games=[game(number=n) for n in numbers], pages={23: PAGE})
    assert result.matches == {}
    assert set(result.unmatched) == {6, 7}
    assert all("mn=23" in reason and "shared" in reason for reason in result.unmatched.values())


def test_match_round_unplayed_game_has_reason_even_with_unplayed_page() -> None:
    fip_game = game()
    fip_game = {**fip_game, "score": None}
    page = PbHeader(home=PAGE.home, away=PAGE.away, score=None)
    assert match_round(fip_games=[game()], pages={23: PAGE}).matches == {6: 23}
    result = match_round(fip_games=[fip_game], pages={23: page})
    assert result.matches == {}
    assert "FIP score" in result.unmatched[6]


def test_match_round_empty_pages_reports_no_candidate() -> None:
    assert match_round(fip_games=[game()], pages={23: PAGE}).matches == {6: 23}
    assert match_round(fip_games=[game()], pages={}) == MatchResult(
        matches={}, unmatched={6: "no Playbasket pages available"}
    )
    assert match_round(fip_games=[], pages={}) == MatchResult(matches={}, unmatched={})


@pytest.mark.parametrize(
    argnames="totals,today,expected",
    argvalues=[
        ((62, 55), date(2026, 10, 18), "complete"),
        ((61, 55), date(2026, 10, 7), "partial"),
        ((62, 54), date(2026, 10, 17), "partial"),
        ((61, 54), date(2026, 10, 18), "incomplete"),
        (None, date(2026, 10, 7), "unmatched"),
        (None, date(2026, 10, 18), "unmatched"),
    ],
)
def test_classify_totals_and_retry_boundary_return_status(
    totals: tuple[int, int] | None, today: date, expected: str,
) -> None:
    assert classify(
        totals=totals, fip_score={"home": 62, "away": 55},
        game_date=date(2026, 10, 3), today=today,
    ) == expected


@pytest.mark.parametrize(
    argnames="case,expected",
    argvalues=[
        ((None, 7, False, True), [6]),
        ((None, 18, False, True), [6]),
        (("complete", 7, False, True), []),
        (("complete", 18, True, True), [6]),
        (("incomplete", 18, True, True), [6]),
        (("incomplete", 7, False, True), []),
        (("partial", 7, False, True), [6]),
        (("partial", 17, False, True), [6]),
        (("partial", 18, False, True), []),
        (("unmatched", 17, False, True), [6]),
        (("unmatched", 18, False, True), []),
        ((None, 7, False, False), []),
        (("complete", 7, True, False), []),
    ],
)
def test_select_pending_state_rules_preserve_inputs(
    case: tuple[str | None, int, bool, bool], expected: list[int],
) -> None:
    status, day, changed, played = case
    rounds: list[RoundDict] = [{"round": "A1", "games": [
        {**game(), "date": "2026-10-03", "score": game()["score"] if played else None},
    ]}]
    previous: dict[str, BoxscoreEntry] = {} if status is None else {"6": {
        "round": "A1", "status": status, "fip_score": {"home": 0 if changed else 62, "away": 55},
        "mn": 6, "url": "saved", "home": None, "away": None,
    }}
    original = deepcopy(x=(rounds, previous))
    pending = select_pending(rounds=rounds, previous=previous, today=date(2026, 10, day))
    assert [item.game["n"] for item in pending] == expected
    assert (rounds, previous) == original


def test_select_pending_prioritizes_expiring_games_then_natural_round_order() -> None:
    rounds: list[RoundDict] = [
        {"round": code, "games": [{**game(number=n), "date": game_date}]}
        for code, n, game_date in [
            ("A2", 1, "2026-09-30"), ("A10", 2, "2026-09-20"),
            ("R1", 3, "2026-10-17"), ("R2", 4, "2026-10-04"),
        ]
    ]
    pending = select_pending(rounds=rounds, previous={}, today=date(2026, 10, 18))
    assert [(item.round, item.game["n"]) for item in pending] == [
        ("R2", 4), ("R1", 3), ("A2", 1), ("A10", 2),
    ]
