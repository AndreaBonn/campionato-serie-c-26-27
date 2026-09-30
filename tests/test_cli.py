import json
from pathlib import Path
from urllib.error import URLError

import pytest

from fip_calendar import cli
from fip_calendar.cli import previous_notices, round_to_page, write_if_changed

NOW = "2026-10-01T08:00:00+00:00"
LATER = "2026-10-01T12:00:00+00:00"


def test_round_to_page_maps_first_and_second_half() -> None:
    assert round_to_page("A5") == (1, 5)
    assert round_to_page("R11") == (0, 11)


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

    changed = cli.write_ics_if_changed(
        path=target, text="BEGIN:VCALENDAR\r\nDTSTAMP:20261001T000000Z\r\nNEW\r\nEND:VCALENDAR\r\n"
    )

    assert changed is True
    assert "NEW" in target.read_text()


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
    return status


def test_main_successful_sync_records_check_time(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    status = _patch_main_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(cli, "collect", lambda games: ({}, []))
    monkeypatch.setattr(cli, "build_data", lambda calendar, rounds, standings: {"games": []})
    monkeypatch.setattr(cli, "collect_notices", lambda path: [])

    assert cli.main() == 0

    checked_at = json.loads(status.read_text())["checked_at"]
    assert checked_at == json.loads((tmp_path / "data.json").read_text())["updated_at"]


def test_main_failed_sync_keeps_previous_check_time(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    status = _patch_main_paths(tmp_path, monkeypatch)
    status.write_text(json.dumps({"checked_at": NOW}))

    def fip_down(games: list[dict[str, object]]) -> None:
        raise URLError("fip.it unreachable")

    monkeypatch.setattr(cli, "collect", fip_down)

    assert cli.main() == 1
    assert json.loads(status.read_text()) == {"checked_at": NOW}
