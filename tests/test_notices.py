from typing import Any

from fip_calendar.notices import select_notices

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
