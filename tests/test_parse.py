from pathlib import Path

import pytest

from fip_calendar.parse import (
    FipMatch,
    ParseError,
    Standing,
    clean,
    parse_italian_date,
    parse_matches,
    parse_standings,
)

FIXTURES = Path(__file__).parent / "fixtures"
CUS_LOGO = (
    "https://backend.fip.it/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBB"
    "a1lJIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--5740682d9093bb8ba3cf3f497433939726351c60/"
    "cus%20cagliari%20logo_page-0001.jpg"
)


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
        home_logo=CUS_LOGO,
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


def match_block(teams: int = 2, ref: str = "69", date: str = "20 Dicembre 2026") -> str:
    names = "".join(f'<span class="team__name">SQUADRA {i}</span>' for i in range(teams))
    return (
        '<div class="results-matches__match">'
        f'<span class="ref">{ref}</span>'
        f'<div class="teams">{names}</div>'
        f'<div class="datetime"><span class="date">{date}</span>'
        '<span class="time">18:00</span></div>'
        "</div>"
    )


def standings_table(*rows: list[str]) -> str:
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in rows)
    return f'<table class="results-ranking-full"><tbody>{body}</tbody></table>'


STANDING_ROW = ["1", "CUS CAGLIARI", "2", "1", "1", "0", "70", "60"]


def test_parse_matches_minimal_block_without_optional_fields_has_empty_defaults() -> None:
    [match] = parse_matches(match_block())

    assert (match.venue, match.status, match.status_text, match.referees, match.score) == (
        "",
        "",
        "",
        (),
        None,
    )


def test_parse_matches_block_with_one_team_raises() -> None:
    with pytest.raises(ParseError):
        parse_matches(match_block(teams=1))


def test_parse_matches_block_without_game_number_raises() -> None:
    html = match_block().replace('<span class="ref">69</span>', "")

    with pytest.raises(ParseError):
        parse_matches(html)


def test_parse_matches_non_numeric_game_number_raises_parse_error() -> None:
    with pytest.raises(ParseError):
        parse_matches(match_block(ref="n.d."))


def test_parse_standings_row_with_wrong_column_count_raises() -> None:
    with pytest.raises(ParseError):
        parse_standings(standings_table(STANDING_ROW[:7]))


def test_parse_standings_skips_expandable_detail_rows() -> None:
    html = standings_table(STANDING_ROW).replace(
        "</tbody>", '<tr data-row="1"><td>dettaglio</td></tr></tbody>'
    )

    assert [s.team for s in parse_standings(html)] == ["CUS CAGLIARI"]


def test_parse_standings_non_numeric_points_raise_parse_error() -> None:
    with pytest.raises(ParseError):
        parse_standings(standings_table([*STANDING_ROW[:2], "-", *STANDING_ROW[3:]]))


def test_clean_collapses_whitespace_and_province_spacing() -> None:
    assert clean("  ROSSI\n  MARIO di CAGLIARI ( CA) ") == "ROSSI MARIO di CAGLIARI (CA)"


def test_parse_italian_date_without_year_raises() -> None:
    with pytest.raises(ParseError):
        parse_italian_date("20 Dicembre")


def test_parse_italian_date_non_numeric_year_raises_parse_error() -> None:
    with pytest.raises(ParseError):
        parse_italian_date("20 Dicembre duemila")


def test_parse_italian_date_impossible_day_raises_parse_error() -> None:
    with pytest.raises(ParseError):
        parse_italian_date("32 Dicembre 2026")


def test_parse_matches_reads_crest_of_teams_that_uploaded_one() -> None:
    matches = parse_matches(load("serie-c-ritorno-1-non-designata.html"))

    game = by_number(matches, 67)

    assert game.home_logo.startswith("https://backend.fip.it/")
    assert game.home_logo.endswith("/logo%201.png")
    assert game.away_logo.endswith("PORTO%20TORRES%202.jpg")


def test_parse_matches_team_without_crest_has_empty_logo() -> None:
    matches = parse_matches(load("serie-c-ritorno-1-non-designata.html"))

    game = by_number(matches, 68)

    assert (game.home_logo, game.away_logo) == ("", "")


def test_parse_matches_homologated_game_lists_sanctions() -> None:
    matches = parse_matches(load("serie-a-andata-1-omologata.html"))

    game = by_number(matches, 3)

    assert len(game.sanctions) == 1
    assert game.sanctions[0].startswith(
        "soc. UNIVERSO TREVISO BASKET S.r.l:ammenda di Euro 1.200,00"
    )


def test_parse_matches_game_without_sanctions_has_none() -> None:
    matches = parse_matches(load("serie-a-andata-1-omologata.html"))

    sanctioned = [m.number for m in matches if m.sanctions]

    assert len(sanctioned) == 2
    assert all(m.sanctions == () for m in matches if m.number not in sanctioned)


def block_with(inner: str) -> str:
    """A minimal match block (see match_block) with extra markup inside it."""
    return match_block().removesuffix("</div>") + inner + "</div>"


def test_parse_matches_empty_referee_slot_is_not_a_name() -> None:
    info = '<div class="info"><span class="label">Arbitro</span><span class="value">{}</span></div>'
    html = block_with(f'<div class="col2">{info.format("  ")}{info.format("ROSSI MARIO")}</div>')

    [match] = parse_matches(html)

    assert match.referees == ("ROSSI MARIO",)


def test_parse_matches_empty_sanction_paragraph_is_skipped() -> None:
    html = block_with(
        '<p class="value--provvedimento"> </p><p class="value--provvedimento">ammenda</p>'
    )

    [match] = parse_matches(html)

    assert match.sanctions == ("ammenda",)


def test_parse_matches_crest_url_is_trimmed() -> None:
    team = '<div class="team"><span class="team__flag"><img src="{}"></span></div>'
    teams = team.format("\n https://backend.fip.it/a.png ") + team.format("")
    html = block_with(f'<div class="teams">{teams}</div>')

    [match] = parse_matches(html)

    assert (match.home_logo, match.away_logo) == ("https://backend.fip.it/a.png", "")
