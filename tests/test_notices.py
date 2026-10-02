from typing import Any

import pytest

from fip_calendar.notices import (
    KIND_COMUNICATO,
    KIND_FORMULA,
    KIND_LEAGUE,
    merge_notices,
    select_notices,
)

SINCE = "2026-09-23T00:00:00"


def post(title: str, date: str = "2026-10-20T10:00:00", slug: str = "x") -> dict[str, Any]:
    return {"date": date, "title": {"rendered": title}, "link": f"https://sardegna.fip.it/{slug}/"}


def test_select_notices_keeps_recent_formula_post_for_regional_c() -> None:
    posts = [post("Serie C regionale: la formula dei playoff 2026/27", slug="formula")]

    notices = select_notices(posts=posts, since=SINCE)

    assert notices == [
        {
            "date": "2026-10-20",
            "title": "Serie C regionale: la formula dei playoff 2026/27",
            "link": "https://sardegna.fip.it/formula/",
            "kind": "formula",
        }
    ]


def test_select_notices_accepts_regional_championships_wording() -> None:
    notices = select_notices(posts=[post("LA FORMULA DEI CAMPIONATI REGIONALI")], since=SINCE)

    assert len(notices) == 1


def test_select_notices_drops_posts_without_competition_keyword() -> None:
    posts = [post("B Interregionale, si parte! Play by play e boxscore su FIP Stats")]

    assert select_notices(posts=posts, since=SINCE) == []


def test_select_notices_drops_posts_before_the_season_calendar() -> None:
    old = post("Playoff e Playout C regionale, primo turno", date="2026-03-15T21:25:15")

    assert select_notices(posts=[old], since=SINCE) == []


def test_select_notices_unescapes_html_and_dedupes_links() -> None:
    posts = [
        post("Serie C: formula &#8220;playoff&#8221;", slug="a"),
        post("Serie C: formula &#8220;playoff&#8221;", slug="a"),
    ]

    notices = select_notices(posts=posts, since=SINCE)

    assert [n["title"] for n in notices] == ["Serie C: formula “playoff”"]


def test_select_notices_sorts_newest_first() -> None:
    posts = [
        post("Serie C playout", date="2026-11-01T10:00:00", slug="old"),
        post("Serie C playoff", date="2027-03-01T10:00:00", slug="new"),
    ]

    notices = select_notices(posts=posts, since=SINCE)

    assert [n["link"] for n in notices] == [
        "https://sardegna.fip.it/new/",
        "https://sardegna.fip.it/old/",
    ]


def test_select_notices_drops_playoff_posts_of_other_championships() -> None:
    posts = [post("Serie A2 Femminile: la formula dei playoff")]

    assert select_notices(posts=posts, since=SINCE) == []


def test_select_notices_drops_links_outside_fip_sardegna() -> None:
    posts = [
        {
            "date": "2026-10-20T10:00:00",
            "title": {"rendered": "Serie C formula"},
            "link": "javascript:alert(1)",
        }
    ]

    assert select_notices(posts=posts, since=SINCE) == []


def test_select_notices_post_published_exactly_at_since_is_kept() -> None:
    posts = [post("Serie C: formula", date=SINCE)]

    assert len(select_notices(posts=posts, since=SINCE)) == 1


def test_select_notices_accepts_hyphenated_play_off_wording() -> None:
    posts = [post("Serie C regionale, date dei play-off")]

    assert len(select_notices(posts=posts, since=SINCE)) == 1


@pytest.mark.parametrize(
    "link",
    [
        "https://sardegna.fip.it.example.com/formula/",
        "http://sardegna.fip.it/formula/",
        "https://fip.it/formula/",
    ],
)
def test_select_notices_drops_lookalike_and_insecure_links(link: str) -> None:
    posts = [
        {"date": "2026-10-20T10:00:00", "title": {"rendered": "Serie C formula"}, "link": link}
    ]

    assert select_notices(posts=posts, since=SINCE) == []


def test_select_notices_no_posts_returns_empty() -> None:
    assert select_notices(posts=[], since=SINCE) == []


def test_select_notices_league_category_keeps_any_title() -> None:
    posts = [post("Basket, Serie C Regionale: ecco le 12 protagoniste", slug="protagoniste")]

    notices = select_notices(posts=posts, since=SINCE, kind=KIND_LEAGUE)

    assert [(n["link"], n["kind"]) for n in notices] == [
        ("https://sardegna.fip.it/protagoniste/", "serie-c")
    ]


def test_select_notices_league_category_without_competition_word_is_kept() -> None:
    posts = [post("Il calendario definitivo delle semifinali")]

    assert len(select_notices(posts=posts, since=SINCE, kind=KIND_LEAGUE)) == 1


def test_select_notices_league_category_still_drops_old_and_offsite_posts() -> None:
    old = post("Serie C, la finale", date="2026-05-10T19:15:30")
    offsite = {**post("Serie C, la finale"), "link": "https://example.com/finale/"}

    assert select_notices(posts=[old, offsite], since=SINCE, kind=KIND_LEAGUE) == []


def test_select_notices_comunicato_keeps_serie_c_judge_decision() -> None:
    title = "N. 12 del 10/10/2026 &#8211; giudice sportivo &#8211; serie c"
    posts = [post(title, slug="comunicato/n-12")]

    notices = select_notices(posts=posts, since=SINCE, kind=KIND_COMUNICATO)

    assert [(n["title"], n["kind"]) for n in notices] == [
        ("N. 12 del 10/10/2026 – giudice sportivo – serie c", "comunicato")
    ]


def test_select_notices_comunicato_of_other_championship_is_dropped() -> None:
    posts = [post("N. 13 del 10/10/2026 – giudice sportivo – u17 f reg")]

    assert select_notices(posts=posts, since=SINCE, kind=KIND_COMUNICATO) == []


def test_merge_notices_dedupes_by_link_keeping_the_first_source() -> None:
    formula = select_notices(posts=[post("Serie C: formula playoff", slug="f")], since=SINCE)
    league = select_notices(
        posts=[post("Serie C: formula playoff", slug="f")], since=SINCE, kind=KIND_LEAGUE
    )

    merged = merge_notices(formula, league)

    assert [(n["link"], n["kind"]) for n in merged] == [
        ("https://sardegna.fip.it/f/", KIND_FORMULA)
    ]


def test_merge_notices_sorts_all_sources_newest_first() -> None:
    older = select_notices(
        posts=[post("Serie C: formula", date="2026-10-01T10:00:00", slug="old")], since=SINCE
    )
    newer = select_notices(
        posts=[post("N. 1 – giudice sportivo – serie c", date="2026-11-01T10:00:00", slug="new")],
        since=SINCE,
        kind=KIND_COMUNICATO,
    )

    assert [n["link"] for n in merge_notices(older, newer)] == [
        "https://sardegna.fip.it/new/",
        "https://sardegna.fip.it/old/",
    ]


def test_merge_notices_no_sources_returns_empty() -> None:
    assert merge_notices() == []
