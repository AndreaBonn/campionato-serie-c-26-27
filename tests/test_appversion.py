from pathlib import Path

import pytest

from fip_calendar.appversion import PLACEHOLDER, app_version, stamp_service_worker

SW = f"const VERSION = {PLACEHOLDER};\nconst CACHE = `cus-basket-${{VERSION}}`;\n"


def make_docs(root: Path) -> Path:
    docs = root / "docs"
    (docs / "icons").mkdir(parents=True)
    (docs / "index.html").write_text("<html>v1</html>")
    (docs / "sw.js").write_text(SW)
    (docs / "icons" / "icon-192.png").write_bytes(b"png")
    (docs / "data.json").write_text('{"games": []}')
    (docs / "calendario.ics").write_text("BEGIN:VCALENDAR")
    (docs / "status.json").write_text('{"checked_at": "x"}')
    return docs


def test_app_version_is_stable_for_unchanged_files(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)

    assert app_version(docs) == app_version(docs)


def test_app_version_changes_when_page_changes(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)
    before = app_version(docs)

    (docs / "index.html").write_text("<html>v2</html>")

    assert app_version(docs) != before


def test_app_version_changes_when_an_icon_changes(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)
    before = app_version(docs)

    (docs / "icons" / "icon-192.png").write_bytes(b"new png")

    assert app_version(docs) != before


def test_app_version_ignores_fip_data_updates(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)
    before = app_version(docs)

    (docs / "data.json").write_text('{"games": [1]}')
    (docs / "calendario.ics").write_text("BEGIN:VCALENDAR\r\nNEW")
    (docs / "status.json").write_text('{"checked_at": "y"}')

    assert app_version(docs) == before


def test_app_version_ignores_an_already_stamped_worker(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)
    before = app_version(docs)

    stamp_service_worker(path=docs / "sw.js", version="abc123")

    assert app_version(docs) == before


def test_stamp_service_worker_writes_version_into_worker(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)

    stamp_service_worker(path=docs / "sw.js", version="abc123")

    assert (docs / "sw.js").read_text().startswith('const VERSION = "abc123";')


def test_stamp_service_worker_without_placeholder_raises(tmp_path: Path) -> None:
    worker = tmp_path / "sw.js"
    worker.write_text('const VERSION = "v1";\n')

    with pytest.raises(ValueError):
        stamp_service_worker(path=worker, version="abc123")
