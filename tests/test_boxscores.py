import json
from copy import deepcopy
from pathlib import Path

import pytest

from fip_calendar.boxscores import FipGame, MatchResult, match_round
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
