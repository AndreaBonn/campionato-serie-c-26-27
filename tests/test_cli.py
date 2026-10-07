import http.client
import json
from datetime import datetime
from pathlib import Path
from urllib.error import URLError

import pytest

from fip_calendar import cli
from fip_calendar.cli import previous_notices, round_to_page, with_round_pdfs, write_if_changed
from fip_calendar.config import (
    NOTICE_CATEGORY_ID,
    NOTICE_SEARCH_TERMS,
    NOTICE_SINCE,
    REQUEST_DELAY_S,
)
from fip_calendar.fetch import round_pdf_url, round_url
from fip_calendar.merge import MergeError
from fip_calendar.parse import FipMatch, ParseError, parse_standings

NOW = "2026-10-01T08:00:00+00:00"
LATER = "2026-10-01T12:00:00+00:00"
FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def no_extra_notice_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep the category and comunicati requests off the network unless a test sets them."""
    monkeypatch.setattr(cli, "fetch_category_posts", lambda category, after: [])
    monkeypatch.setattr(cli, "fetch_comunicati", lambda after: [])


def empty_data(
    calendar: dict[str, object], rounds: dict[str, object], standings: list[object]
) -> dict[str, list[object]]:
    """Stand-in for merge.build_data: same keys, no games."""
    return {"games": [], "rounds": []}


def wp_item(title: str, slug: str) -> dict[str, object]:
    return {
        "date": "2026-10-20T10:00:00",
        "title": {"rendered": title},
        "link": f"https://sardegna.fip.it/{slug}/",
    }


def test_round_to_page_maps_first_and_second_half() -> None:
    assert round_to_page("A5") == (1, 5)
    assert round_to_page("R11") == (0, 11)


def test_with_round_pdfs_links_each_round_to_its_fip_report() -> None:
    league = [{"round": "A1", "games": []}, {"round": "R11", "games": []}]

    linked = with_round_pdfs(league)

    assert [r["pdf_url"] for r in linked] == [
        round_pdf_url(half_code=1, round_number=1),
        round_pdf_url(half_code=0, round_number=11),
    ]
    assert linked[1]["games"] == [] and league[0] == {"round": "A1", "games": []}


def test_write_if_changed_writes_new_file_with_timestamp(tmp_path: Path) -> None:
    target = tmp_path / "data.json"

    changed = write_if_changed(path=target, data={"games": [1]}, now=NOW)

    assert changed is True
    assert json.loads(target.read_text()) == {"games": [1], "updated_at": NOW}


def test_write_if_changed_same_data_keeps_old_timestamp(tmp_path: Path) -> None:
    target = tmp_path / "data.json"
    write_if_changed(path=target, data={"games": [1]}, now=NOW)

    changed = write_if_changed(path=target, data={"games": [1]}, now=LATER)

    assert changed is False
    assert json.loads(target.read_text())["updated_at"] == NOW


def test_write_if_changed_different_data_updates_timestamp(tmp_path: Path) -> None:
    target = tmp_path / "data.json"
    write_if_changed(path=target, data={"games": [1]}, now=NOW)

    changed = write_if_changed(path=target, data={"games": [2]}, now=LATER)

    assert changed is True
    assert json.loads(target.read_text()) == {"games": [2], "updated_at": LATER}


def test_previous_notices_reads_them_from_existing_data(tmp_path: Path) -> None:
    target = tmp_path / "data.json"
    notice = {"date": "2026-10-20", "title": "Formula Serie C", "link": "https://x/"}
    target.write_text(json.dumps({"games": [], "notices": [notice]}))

    assert previous_notices(target) == [notice]


def test_previous_notices_missing_file_returns_empty(tmp_path: Path) -> None:
    assert previous_notices(tmp_path / "data.json") == []


def test_collect_notices_unexpected_payload_keeps_previous(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "data.json"
    notice = {"date": "2026-10-20", "title": "Formula Serie C", "link": "https://x/"}
    target.write_text(json.dumps({"notices": [notice]}))
    monkeypatch.setattr(cli, "fetch_posts", lambda term, after: {"code": "rest_error"})

    assert cli.collect_notices(target) == [notice]


def test_write_ics_if_changed_rewrites_when_content_differs(tmp_path: Path) -> None:
    target = tmp_path / "calendario.ics"
    target.write_text("BEGIN:VCALENDAR\r\nDTSTAMP:20260101T000000Z\r\nOLD\r\nEND:VCALENDAR\r\n")

    new = "BEGIN:VCALENDAR\r\nDTSTAMP:20261001T000000Z\r\nNEW\r\nEND:VCALENDAR\r\n"

    changed = cli.write_ics_if_changed(path=target, text=new)

    assert changed is True
    # read_bytes, not read_text: the feed must keep the CRLF line endings RFC 5545 requires
    assert target.read_bytes() == new.encode("utf-8")


def test_write_ics_if_changed_creates_missing_feed(tmp_path: Path) -> None:
    target = tmp_path / "calendario.ics"

    assert cli.write_ics_if_changed(path=target, text="BEGIN:VCALENDAR\r\n") is True
    assert target.read_bytes() == b"BEGIN:VCALENDAR\r\n"


def test_write_ics_if_changed_ignores_dtstamp_only_difference(tmp_path: Path) -> None:
    target = tmp_path / "calendario.ics"
    old = "BEGIN:VCALENDAR\r\nDTSTAMP:20260101T000000Z\r\nSAME\r\nEND:VCALENDAR\r\n"
    target.write_text(old, newline="")

    changed = cli.write_ics_if_changed(path=target, text=old.replace("20260101", "20261001"))

    assert changed is False
    assert target.read_bytes().decode("utf-8") == old


def _patch_main_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    calendar = tmp_path / "calendario.json"
    calendar.write_text(json.dumps({"games": []}))
    monkeypatch.setattr(cli, "CALENDAR_PATH", calendar)
    monkeypatch.setattr(cli, "OUTPUT_PATH", tmp_path / "data.json")
    monkeypatch.setattr(cli, "ICS_PATH", tmp_path / "calendario.ics")
    status = tmp_path / "status.json"
    monkeypatch.setattr(cli, "STATUS_PATH", status)
    # sync_logos deletes crests no team uses: never let it see the real docs/logos
    monkeypatch.setattr(cli, "LOGOS_DIR", tmp_path / "logos")
    monkeypatch.setattr(cli, "BOXSCORES_PATH", tmp_path / "boxscores.json")
    return status


def test_main_successful_sync_records_check_time(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    status = _patch_main_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(cli, "collect", lambda games: ({}, []))
    monkeypatch.setattr(cli, "build_data", empty_data)
    monkeypatch.setattr(cli, "collect_notices", lambda path: [])

    assert cli.main() == 0

    checked_at = json.loads(status.read_text())["checked_at"]
    assert checked_at == json.loads((tmp_path / "data.json").read_text())["updated_at"]


@pytest.mark.parametrize(
    "failure",
    [URLError("fip.it unreachable"), ParseError("layout changed"), MergeError("game 69 missing")],
)
def test_main_failed_sync_leaves_outputs_and_check_time_untouched(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: Exception
) -> None:
    status = _patch_main_paths(tmp_path, monkeypatch)
    status.write_text(json.dumps({"checked_at": NOW}))

    def fip_down(games: list[dict[str, object]]) -> None:
        raise failure

    monkeypatch.setattr(cli, "collect", fip_down)

    assert cli.main() == 1
    assert json.loads(status.read_text()) == {"checked_at": NOW}
    assert not (tmp_path / "data.json").exists()
    assert not (tmp_path / "calendario.ics").exists()


def test_main_successful_sync_writes_feed_and_fip_link(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_main_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(cli, "collect", lambda games: ({}, []))
    one_round = {"games": [], "rounds": [{"round": "A1", "games": []}]}
    monkeypatch.setattr(cli, "build_data", lambda calendar, rounds, standings: one_round)
    monkeypatch.setattr(cli, "collect_notices", lambda path: [])

    cli.main()

    data = json.loads((tmp_path / "data.json").read_text())
    assert data["fip_url"] == round_url(half_code=1, round_number=1)
    assert data["rounds"][0]["pdf_url"] == round_pdf_url(half_code=1, round_number=1)
    assert (tmp_path / "calendario.ics").read_bytes().startswith(b"BEGIN:VCALENDAR\r\n")


def test_previous_notices_file_without_notices_returns_empty(tmp_path: Path) -> None:
    target = tmp_path / "data.json"
    target.write_text(json.dumps({"games": []}))

    assert previous_notices(target) == []


def test_collect_notices_network_error_keeps_previous(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "data.json"
    notice = {"date": "2026-10-20", "title": "Formula Serie C", "link": "https://x/"}
    target.write_text(json.dumps({"notices": [notice]}))

    def offline(term: str, after: str) -> list[dict[str, object]]:
        raise URLError("sardegna.fip.it unreachable")

    monkeypatch.setattr(cli, "fetch_posts", offline)

    assert cli.collect_notices(target) == [notice]


def test_collect_notices_searches_every_term_since_season_start(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    searches: list[tuple[str, str]] = []

    def record(term: str, after: str) -> list[dict[str, object]]:
        searches.append((term, after))
        return []

    monkeypatch.setattr(cli, "fetch_posts", record)

    cli.collect_notices(tmp_path / "data.json")

    assert searches == [(term, NOTICE_SINCE) for term in NOTICE_SEARCH_TERMS]


def test_collect_notices_merges_results_of_all_searches(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def one_post_per_term(term: str, after: str) -> list[dict[str, object]]:
        return [
            {
                "date": "2026-10-20T10:00:00",
                "title": {"rendered": f"Serie C {term}"},
                "link": f"https://sardegna.fip.it/{term}/",
            }
        ]

    monkeypatch.setattr(cli, "fetch_posts", one_post_per_term)

    notices = cli.collect_notices(tmp_path / "data.json")

    assert sorted(n["link"] for n in notices) == sorted(
        f"https://sardegna.fip.it/{term}/" for term in NOTICE_SEARCH_TERMS
    )


def _serve_fixtures(monkeypatch: pytest.MonkeyPatch) -> list[tuple[int, int]]:
    pages = {
        (1, 1): "serie-c-andata-1-designata-parziale.html",
        (0, 1): "serie-c-ritorno-1-non-designata.html",
    }
    requested: list[tuple[int, int]] = []

    def fake_fetch_round(half_code: int, round_number: int) -> str:
        requested.append((half_code, round_number))
        return (FIXTURES / pages[(half_code, round_number)]).read_text(encoding="utf-8")

    monkeypatch.setattr(cli, "fetch_round", fake_fetch_round)
    monkeypatch.setattr("fip_calendar.cli.time.sleep", lambda seconds: None)
    return requested


def test_collect_reads_the_page_of_each_calendar_round(monkeypatch: pytest.MonkeyPatch) -> None:
    requested = _serve_fixtures(monkeypatch)

    rounds, _ = cli.collect([{"round": "A1"}, {"round": "R1"}])

    assert requested == [(1, 1), (0, 1)]
    assert {code: sorted(m.number for m in ms) for code, ms in rounds.items()} == {
        "A1": [1, 2, 3, 4, 5, 6],
        "R1": [67, 68, 69, 70, 71, 72],
    }


def test_collect_returns_standings_read_from_the_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    _serve_fixtures(monkeypatch)

    _, standings = cli.collect([{"round": "R1"}])

    assert len(standings) == 12
    assert "CUS CAGLIARI" in {s.team for s in standings}


def test_collect_pauses_between_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    _serve_fixtures(monkeypatch)
    pauses: list[float] = []
    monkeypatch.setattr("fip_calendar.cli.time.sleep", pauses.append)

    cli.collect([{"round": "A1"}, {"round": "R1"}])

    assert pauses == [REQUEST_DELAY_S, REQUEST_DELAY_S]


def test_collect_without_games_makes_no_request(monkeypatch: pytest.MonkeyPatch) -> None:
    requested = _serve_fixtures(monkeypatch)

    assert cli.collect([]) == ({}, [])
    assert requested == []


def test_previous_notices_corrupted_file_returns_empty(tmp_path: Path) -> None:
    target = tmp_path / "data.json"
    target.write_text('{"notices": [')

    assert previous_notices(target) == []


def test_write_if_changed_overwrites_corrupted_file(tmp_path: Path) -> None:
    target = tmp_path / "data.json"
    target.write_text('{"games": [')

    changed = write_if_changed(path=target, data={"games": [1]}, now=NOW)

    assert changed is True
    assert json.loads(target.read_text()) == {"games": [1], "updated_at": NOW}


def test_write_if_changed_overwrites_json_that_is_not_an_object(tmp_path: Path) -> None:
    target = tmp_path / "data.json"
    target.write_text("[1, 2]")

    changed = write_if_changed(path=target, data={"games": [1]}, now=NOW)

    assert changed is True
    assert json.loads(target.read_text()) == {"games": [1], "updated_at": NOW}


def test_collect_notices_reads_league_category_and_comunicati_since_season_start(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    asked: list[tuple[str, object]] = []

    def category(category: int, after: str) -> list[dict[str, object]]:
        asked.append(("category", (category, after)))
        return [wp_item("Serie C, si parte", "si-parte")]

    def comunicati(after: str) -> list[dict[str, object]]:
        asked.append(("comunicati", after))
        return [wp_item("N. 1 – giudice sportivo – serie c", "comunicato/n-1")]

    monkeypatch.setattr(cli, "fetch_posts", lambda term, after: [])
    monkeypatch.setattr(cli, "fetch_category_posts", category)
    monkeypatch.setattr(cli, "fetch_comunicati", comunicati)

    notices = cli.collect_notices(tmp_path / "data.json")

    assert asked == [
        ("category", (NOTICE_CATEGORY_ID, NOTICE_SINCE)),
        ("comunicati", NOTICE_SINCE),
    ]
    assert sorted((n["link"], n["kind"]) for n in notices) == [
        ("https://sardegna.fip.it/comunicato/n-1/", "comunicato"),
        ("https://sardegna.fip.it/si-parte/", "serie-c"),
    ]


def test_collect_notices_formula_post_also_in_category_is_listed_once_as_formula(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    item = wp_item("Serie C: formula dei playoff", "formula")
    monkeypatch.setattr(cli, "fetch_posts", lambda term, after: [item])
    monkeypatch.setattr(cli, "fetch_category_posts", lambda category, after: [item])

    notices = cli.collect_notices(tmp_path / "data.json")

    assert [(n["link"], n["kind"]) for n in notices] == [
        ("https://sardegna.fip.it/formula/", "formula")
    ]


def test_collect_notices_comunicati_outage_keeps_previous(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "data.json"
    notice = {"date": "2026-10-20", "title": "Formula Serie C", "link": "https://x/"}
    target.write_text(json.dumps({"notices": [notice]}))

    def offline(after: str) -> list[dict[str, object]]:
        raise URLError("comunicato endpoint unreachable")

    monkeypatch.setattr(cli, "fetch_posts", lambda term, after: [])
    monkeypatch.setattr(cli, "fetch_comunicati", offline)

    assert cli.collect_notices(target) == [notice]


@pytest.mark.parametrize(
    "failure",
    [
        # an HTML maintenance page instead of JSON
        json.JSONDecodeError("Expecting value", "<html>", 0),
        # an item without the `link` field
        KeyError("link"),
    ],
)
def test_collect_notices_malformed_answer_keeps_previous(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: Exception
) -> None:
    target = tmp_path / "data.json"
    notice = {"date": "2026-10-20", "title": "Formula Serie C", "link": "https://x/"}
    target.write_text(json.dumps({"notices": [notice]}))

    def broken(term: str, after: str) -> list[dict[str, object]]:
        raise failure

    monkeypatch.setattr(cli, "fetch_posts", broken)

    assert cli.collect_notices(target) == [notice]


def test_main_unchanged_data_still_advances_check_time(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    status = _patch_main_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(cli, "collect", lambda games: ({}, []))
    monkeypatch.setattr(cli, "build_data", empty_data)
    monkeypatch.setattr(cli, "collect_notices", lambda path: [])

    class Clock(datetime):
        """Two runs of the sync, four hours apart."""

        @classmethod
        def now(cls, tz: object = None) -> "Clock":
            return next(runs)

    runs = iter([Clock.fromisoformat(NOW), Clock.fromisoformat(LATER)])
    monkeypatch.setattr(cli, "datetime", Clock)
    cli.main()

    cli.main()

    assert json.loads(status.read_text()) == {"checked_at": LATER}
    assert json.loads((tmp_path / "data.json").read_text())["updated_at"] == NOW


def test_collect_logos_reuses_published_entries_without_downloading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    logos_dir = tmp_path / "logos"
    logos_dir.mkdir()
    (logos_dir / "cus-cagliari.png").write_bytes(b"png")
    url = "https://backend.fip.it/blobs/cus.jpg"
    entry = {"file": "logos/cus-cagliari.png", "source": url}
    published = tmp_path / "data.json"
    published.write_text(json.dumps({"logos": {"CUS CAGLIARI": entry}}))
    monkeypatch.setattr(cli, "LOGOS_DIR", logos_dir)
    monkeypatch.setattr(cli, "fetch_logo", lambda u: pytest.fail(f"downloaded {u}"))
    cus = FipMatch(
        number=69, home="CUS CAGLIARI", away="BASKET S. ORSOLA", date="2026-12-20",
        time="18:00", venue="", status="", status_text="", referees=(), score=None,
        home_logo=url,
    )  # fmt: skip

    logos = cli.collect_logos(rounds={"R1": [cus]}, fallback_path=published)

    assert logos["CUS CAGLIARI"] == entry


def test_collect_logos_without_published_data_starts_empty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(cli, "LOGOS_DIR", tmp_path / "logos")

    assert cli.collect_logos(rounds={}, fallback_path=tmp_path / "missing.json") == {}


def test_main_successful_sync_publishes_logos(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_main_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(cli, "collect", lambda games: ({}, []))
    monkeypatch.setattr(cli, "build_data", empty_data)
    monkeypatch.setattr(cli, "collect_notices", lambda path: [])
    monkeypatch.setattr(cli, "collect_logos", lambda rounds, fallback_path: {"X": {"file": "f"}})

    cli.main()

    assert json.loads((tmp_path / "data.json").read_text())["logos"] == {"X": {"file": "f"}}


def test_collect_returns_the_standings_of_the_last_page_read(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # a Serie A page after a Serie C one: the two tables differ, so the order shows
    pages = {
        (1, 1): "serie-c-andata-1-designata-parziale.html",
        (0, 1): "serie-a-andata-2-designata.html",
    }
    last_page = (FIXTURES / pages[(0, 1)]).read_text(encoding="utf-8")
    monkeypatch.setattr(
        cli,
        "fetch_round",
        lambda half_code, round_number: (FIXTURES / pages[(half_code, round_number)]).read_text(
            encoding="utf-8"
        ),
    )
    monkeypatch.setattr("fip_calendar.cli.time.sleep", lambda seconds: None)

    _, standings = cli.collect([{"round": "A1"}, {"round": "R1"}])

    assert standings == parse_standings(last_page)


def test_collect_logos_published_logos_not_an_object_reads_as_none(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    published = tmp_path / "data.json"
    published.write_text(json.dumps({"logos": ["logos/cus-cagliari.png"]}))
    monkeypatch.setattr(cli, "LOGOS_DIR", tmp_path / "logos")

    assert cli.collect_logos(rounds={}, fallback_path=published) == {}


def test_main_successful_sync_publishes_fip_sardegna_notices(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_main_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(cli, "collect", lambda games: ({}, []))
    monkeypatch.setattr(cli, "build_data", empty_data)
    item = wp_item("Serie C regionale: formula playoff", "formula-c")
    monkeypatch.setattr(cli, "fetch_posts", lambda term, after: [item])

    cli.main()

    notices = json.loads((tmp_path / "data.json").read_text())["notices"]
    assert [n["link"] for n in notices] == ["https://sardegna.fip.it/formula-c/"]


BOXSCORE = {
    "round": "A1",
    "status": "complete",
    "fip_score": {"home": 62, "away": 55},
    "mn": 6,
    "url": "https://www.playbasket.it/sardegna/match.php?mn=6",
    "home": {"team": "S. Orsola Sassari", "players": []},
    "away": {"team": "Cus Cagliari", "players": []},
}


def test_main_writes_box_scores_from_previous_state_and_league_rounds(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_main_paths(tmp_path, monkeypatch)
    (tmp_path / "boxscores.json").write_text(json.dumps({"boxscores": {"1": BOXSCORE}}))
    monkeypatch.setattr(cli, "collect", lambda games: ({}, []))
    one_round = {"games": [], "rounds": [{"round": "A1", "games": []}]}
    monkeypatch.setattr(cli, "build_data", lambda calendar, rounds, standings: one_round)
    monkeypatch.setattr(cli, "collect_notices", lambda path: [])
    seen: dict[str, object] = {}

    def collect_boxscores(**kwargs: object) -> dict[str, object]:
        seen.update(kwargs)
        return {"6": BOXSCORE}

    monkeypatch.setattr(cli, "collect_boxscores", collect_boxscores)

    assert cli.main() == 0

    written = json.loads((tmp_path / "boxscores.json").read_text())
    assert written["boxscores"] == {"6": BOXSCORE}
    assert seen["previous"] == {"1": BOXSCORE}
    assert seen["rounds"] == [{"round": "A1", "games": [], "pdf_url": round_pdf_url(1, 1)}]


def test_previous_boxscores_without_an_object_returns_empty(tmp_path: Path) -> None:
    target = tmp_path / "boxscores.json"
    target.write_text(json.dumps({"boxscores": ["not", "a", "dict"]}))

    assert cli.previous_boxscores(target) == {}


def test_previous_boxscores_reads_published_entries(tmp_path: Path) -> None:
    target = tmp_path / "boxscores.json"
    target.write_text(json.dumps({"boxscores": {"6": BOXSCORE}}))

    assert cli.previous_boxscores(target) == {"6": BOXSCORE}


def test_italian_date_after_midnight_in_rome_is_the_next_day() -> None:
    late_saturday_utc = datetime.fromisoformat("2026-10-03T22:30:00+00:00")

    assert cli.italian_date(late_saturday_utc).isoformat() == "2026-10-04"


@pytest.mark.parametrize(
    "failure", [TimeoutError("read timed out"), http.client.IncompleteRead(partial=b"")]
)
def test_collect_notices_read_failure_keeps_previous(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: Exception
) -> None:
    target = tmp_path / "data.json"
    notice = {"date": "2026-10-20", "title": "Formula Serie C", "link": "https://x/"}
    target.write_text(json.dumps({"notices": [notice]}))

    def stalled(term: str, after: str) -> list[dict[str, object]]:
        raise failure

    monkeypatch.setattr(cli, "fetch_posts", stalled)

    assert cli.collect_notices(target) == [notice]


def test_main_fip_read_timeout_fails_cleanly_without_outputs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    status = _patch_main_paths(tmp_path, monkeypatch)

    def fip_stalled(games: list[dict[str, object]]) -> None:
        raise TimeoutError("read timed out")

    monkeypatch.setattr(cli, "collect", fip_stalled)

    assert cli.main() == 1
    assert not status.exists()
    assert not (tmp_path / "data.json").exists()
