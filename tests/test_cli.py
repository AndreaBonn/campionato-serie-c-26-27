import json
from pathlib import Path

from fip_calendar.cli import round_to_page, write_if_changed

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
