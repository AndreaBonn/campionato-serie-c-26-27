from pathlib import Path

import pytest

from fip_calendar import appversion
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
    (docs / "boxscores.json").write_text('{"boxscores": {"6": {}}}')

    assert app_version(docs) == before


def test_app_version_ignores_an_already_stamped_worker(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)
    before = app_version(docs)

    stamp_service_worker(path=docs / "sw.js", version="abc123")

    assert app_version(docs) == before


def test_stamp_service_worker_writes_version_into_worker(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)

    stamp_service_worker(path=docs / "sw.js", version="abc123")

    assert (docs / "sw.js").read_text() == SW.replace(PLACEHOLDER, '"abc123"', 1)


def test_stamp_service_worker_without_placeholder_raises(tmp_path: Path) -> None:
    worker = tmp_path / "sw.js"
    worker.write_text('const VERSION = "v1";\n')

    with pytest.raises(ValueError):
        stamp_service_worker(path=worker, version="abc123")


def test_app_version_changes_when_worker_code_changes(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)
    before = app_version(docs)

    (docs / "sw.js").write_text(SW + "self.skipWaiting();\n")

    assert app_version(docs) != before


def test_app_version_hashes_worker_without_version_line_as_it_is(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)
    (docs / "sw.js").write_text("// no version line\nconst CACHE = 'a';\n")
    before = app_version(docs)

    (docs / "sw.js").write_text("// no version line\nconst CACHE = 'b';\n")

    assert app_version(docs) != before


def test_main_stamps_worker_with_current_app_version(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    docs = make_docs(tmp_path)
    version = app_version(docs)
    monkeypatch.setattr(appversion, "ROOT", tmp_path)

    assert appversion.main() == 0

    assert (docs / "sw.js").read_text().startswith(f'const VERSION = "{version}";')
    assert version in capsys.readouterr().out


def test_app_version_ignores_crests_copied_from_fip(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)
    before = app_version(docs)

    (docs / "logos").mkdir()
    (docs / "logos" / "cus-cagliari.png").write_bytes(b"png")

    assert app_version(docs) == before


def test_app_version_still_tracks_a_page_file_named_like_the_crest_folder(tmp_path: Path) -> None:
    docs = make_docs(tmp_path)
    before = app_version(docs)

    (docs / "icons" / "logos").write_bytes(b"not a crest")

    assert app_version(docs) != before


def test_app_version_changes_when_a_file_is_renamed(tmp_path: Path) -> None:
    # the page loads its files by name: a rename is a new release even with the same bytes
    docs = make_docs(tmp_path)
    before = app_version(docs)

    (docs / "index.html").rename(docs / "index2.html")

    assert app_version(docs) != before


def test_app_version_does_not_depend_on_directory_listing_order(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    for name in ("a.html", "b.css", "c.js"):
        (tmp_path / name).write_text(name, encoding="utf-8")
    real_rglob = Path.rglob

    def listed(reverse: bool) -> str:
        monkeypatch.setattr(
            Path, "rglob",
            lambda self, pattern: iter(sorted(real_rglob(self, pattern), reverse=reverse)),
        )
        return app_version(tmp_path)

    assert listed(reverse=False) == listed(reverse=True)


def test_app_version_creation_order_does_not_change_twelve_character_hash(tmp_path: Path) -> None:
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir()
    second.mkdir()
    files = [("index.html", b"page"), ("styles.css", b"style"), ("app.js", b"script")]
    for name, content in files:
        (first / name).write_bytes(content)
    for name, content in reversed(files):
        (second / name).write_bytes(content)

    version = app_version(first)

    assert version == app_version(second)
    assert len(version) == 12
