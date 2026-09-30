from pathlib import Path

import pytest

from fip_calendar.parse import (
    FipMatch,
    ParseError,
    Standing,
    parse_italian_date,
    parse_matches,
    parse_standings,
)

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def by_number(matches: list[FipMatch], number: int) -> FipMatch:
    return next(m for m in matches if m.number == number)


def test_parse_matches_serie_c_round_returns_all_six_games() -> None:
    matches = parse_matches(load("serie-c-ritorno-1-non-designata.html"))

    assert sorted(m.number for m in matches) == [67, 68, 69, 70, 71, 72]


def test_parse_matches_undesignated_game_has_schedule_and_no_referees() -> None:
    matches = parse_matches(load("serie-c-ritorno-1-non-designata.html"))

    cus = by_number(matches, 69)

    assert cus == FipMatch(
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


def test_parse_matches_played_game_has_score_and_referees() -> None:
    matches = parse_matches(load("serie-a-andata-1-omologata.html"))

    game = by_number(matches, 3)

    assert game.status == "omologata"
    assert game.score == (109, 94)
    assert game.referees[0] == "GRIGIONI VALERIO di QUARTO D'ALTINO (VE)"
    assert len(game.referees) == 3


def test_parse_matches_designated_game_lists_referees_without_score() -> None:
    matches = parse_matches(load("serie-a-andata-2-designata.html"))

    game = by_number(matches, 12)

    assert game.status == "designata"
    assert game.referees == (
        "LANZARINI SAVERIO di BOLOGNA (BO)",
        "MINIATI GIAN LORENZO di EMPOLI (FI)",
        "ATTARD LUCA di PRIOLO GARGALLO (SR)",
    )
    assert game.score is None


def test_parse_matches_designation_not_visible_has_no_referee_names() -> None:
    matches = parse_matches(load("serie-a-andata-3-designata-nonvisibile.html"))

    game = by_number(matches, 22)

    assert game.status == "designata-nonvisibile"
    assert game.referees == ()


def test_parse_matches_pending_referee_slot_is_not_a_name() -> None:
    matches = parse_matches(load("serie-c-andata-1-designata-parziale.html"))

    game = by_number(matches, 6)

    assert game.status == "designata"
    assert game.referees == (
        "FIORIN GIANMARCO di CABRAS (OR)",
        "ATZENI GIANLUCA di ARBUS (SU)",
    )


def test_parse_matches_page_without_games_raises() -> None:
    with pytest.raises(ParseError):
        parse_matches("<html><body><p>Manutenzione</p></body></html>")


def test_parse_standings_reads_official_table() -> None:
    standings = parse_standings(load("serie-a-andata-2-designata.html"))

    assert len(standings) == 16
    assert standings[0] == Standing(
        position=1,
        team="OLD WILD WEST UDINE",
        points=2,
        played=1,
        won=1,
        lost=0,
        points_for=87,
        points_against=63,
    )


def test_parse_standings_serie_c_lists_twelve_teams() -> None:
    standings = parse_standings(load("serie-c-ritorno-1-non-designata.html"))

    assert len(standings) == 12
    assert "CUS CAGLIARI" in {s.team for s in standings}


def test_parse_standings_page_without_table_raises() -> None:
    with pytest.raises(ParseError):
        parse_standings("<html><body></body></html>")


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("20 Dicembre 2026", "2026-12-20"),
        ("3 Ottobre 2026", "2026-10-03"),
        ("7 marzo 2027", "2027-03-07"),
    ],
)
def test_parse_italian_date_converts_to_iso(text: str, expected: str) -> None:
    assert parse_italian_date(text) == expected


def test_parse_italian_date_unknown_month_raises() -> None:
    with pytest.raises(ParseError):
        parse_italian_date("20 Brumaio 2026")
