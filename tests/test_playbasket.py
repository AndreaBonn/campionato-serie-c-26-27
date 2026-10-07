from pathlib import Path

import pytest

from fip_calendar.playbasket import (
    PbHeader,
    PbPlayer,
    PlaybasketParseError,
    parse_header,
    parse_players,
)

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_parse_header_a1_m6_returns_teams_and_score() -> None:
    assert parse_header(html=load(name="playbasket-a1-m6.html")) == PbHeader(
        home="S. Orsola Sassari", away="Cus Cagliari", score=(62, 55)
    )


def test_parse_header_unplayed_returns_teams_without_score() -> None:
    assert parse_header(html=load(name="playbasket-a2-m1-unplayed.html")) == PbHeader(
        home="Scuola Basket Carbonia", away="Sirbones Nuoro", score=None
    )


@pytest.mark.parametrize(
    argnames="html",
    argvalues=[
        "<html></html>",
        "<title></title>",
        "<title>A B [3 Ott]</title>",
        "<title>A - B</title>",
        "<title> - B [3 Ott]</title>",
        "<title>A -  [3 Ott]</title>",
    ],
)
def test_parse_header_malformed_title_raises_parse_error(html: str) -> None:
    assert parse_header(html="<title>A - B [3 Ott]</title>") == PbHeader(
        home="A", away="B", score=None
    )
    with pytest.raises(expected_exception=PlaybasketParseError):
        parse_header(html)


def test_parse_header_hyphenated_names_preserves_punctuation() -> None:
    html = "<title>Basket-A - Ferrini Quartu S.Elena 88-70 [3 Ott] | League</title>"
    assert parse_header(html) == PbHeader(
        home="Basket-A", away="Ferrini Quartu S.Elena", score=(88, 70)
    )


@pytest.mark.parametrize(argnames="mn", argvalues=range(1, 7))
def test_parse_players_a1_points_match_header_and_exclude_total(mn: int) -> None:
    html = load(name=f"playbasket-a1-m{mn}.html")
    players = [parse_players(html, side=side) for side in (0, 1)]

    totals = tuple(sum(p.pts for p in team if p.pts is not None) for team in players)

    assert totals == parse_header(html).score
    assert all(team for team in players)
    assert all(p.name != "Totale" for team in players for p in team)
    if mn == 6:
        assert totals == (62, 55)


def test_parse_players_a1_m1_distinguishes_blank_and_zero_points() -> None:
    players = parse_players(html=load(name="playbasket-a1-m1.html"), side=1)
    by_id = {p.id: p for p in players}

    assert (by_id["196073"].name, by_id["196073"].pts) == ("Mura Federico", None)
    assert (by_id["195969"].name, by_id["195969"].pts) == ("Garau Vincenzo", 0)


@pytest.mark.parametrize(
    argnames="name", argvalues=["playbasket-a2-m1-unplayed.html", "playbasket-r1-m1-unplayed.html"]
)
@pytest.mark.parametrize(argnames="side", argvalues=[0, 1])
def test_parse_players_unplayed_without_tables_returns_empty(name: str, side: int) -> None:
    assert parse_players(html=load(name="playbasket-a1-m6.html"), side=side)
    assert parse_header(html=load(name)).score is None
    assert parse_players(html=load(name), side=side) == ()


def player_table(info: str, query: str = "extobj=999&obj=173425", pts: str = "12") -> str:
    return (
        '<table id="tableStandingsTeam0"><tbody><tr>'
        '<td class="colfrozen playerTeamNumber">&nbsp;</td><td class="sq colfrozen">'
        f'<a href="profile.php?{query}">Example Player{info}</a></td>'
        f'<td class="colfrozen divisore">{pts}</td></tr>'
        '<tr><td class="sq colfrozen">Totale</td><td class="divisore">12</td></tr>'
        "</tbody></table>"
    )


@pytest.mark.parametrize(
    argnames=("info", "role", "age"),
    argvalues=[
        ("", "", ""),
        ('<div class="playerInfos"></div>', "", ""),
        ('<div class="playerInfos"><span class="playerInfos_role">play</span></div>', "play", ""),
        ('<div class="playerInfos"><span class="playerInfos_age">U19</span></div>', "", "U19"),
    ],
)
def test_parse_players_optional_metadata_returns_available_fields(
    info: str,
    role: str,
    age: str,
) -> None:
    assert parse_players(html=player_table(info), side=0) == (
        PbPlayer(id="173425", number="", name="Example Player", role=role, age=age, pts=12),
    )


def test_parse_players_missing_obj_uses_normalized_name() -> None:
    assert parse_players(html=player_table(info="", query="extobj=999"), side=0)[0].id == (
        "example player"
    )
    assert parse_players(html=player_table(info=""), side=0)[0].id == "173425"


def test_parse_players_non_numeric_points_raises_parse_error() -> None:
    assert parse_players(html=player_table(info="", pts="12"), side=0)[0].pts == 12
    with pytest.raises(expected_exception=PlaybasketParseError):
        parse_players(html=player_table(info="", pts="invalid"), side=0)


def test_parse_players_row_without_points_cell_raises_parse_error() -> None:
    no_points = player_table(info="").replace('<td class="colfrozen divisore">12</td>', "")
    assert parse_players(html=player_table(info=""), side=0)[0].pts == 12
    with pytest.raises(expected_exception=PlaybasketParseError, match="missing points cell"):
        parse_players(html=no_points, side=0)
