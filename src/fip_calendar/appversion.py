import hashlib
import sys
from pathlib import Path

from fip_calendar.config import ROOT

# written by fip-calendar on every sync: a data update is not a new app version
DATA_FILES = frozenset({"data.json", "calendario.ics", "status.json", "boxscores.json"})
# crests copied from fip.it by the same sync (logos.py)
DATA_DIRS = frozenset({"logos"})
PLACEHOLDER = '"dev"'
VERSION_LINE = "const VERSION = {};"
VERSION_LENGTH = 12
WORKER_NAME = "sw.js"


def app_version(docs: Path) -> str:
    """Hash of every published file except FIP data.

    The service worker is hashed with its placeholder, so stamping it does not
    change the version it was stamped with.
    """
    digest = hashlib.sha256()
    for path in sorted(p for p in docs.rglob("*") if p.is_file()):
        if path.name in DATA_FILES or path.relative_to(docs).parts[0] in DATA_DIRS:
            continue
        content = path.read_bytes()
        if path.name == WORKER_NAME:
            content = _unstamped(content.decode("utf-8")).encode("utf-8")
        digest.update(path.relative_to(docs).as_posix().encode("utf-8") + b"\0")
        digest.update(content)
    return digest.hexdigest()[:VERSION_LENGTH]


def _unstamped(worker: str) -> str:
    first, _, rest = worker.partition("\n")
    if first.startswith(VERSION_LINE.format("")[:-1]):
        return VERSION_LINE.format(PLACEHOLDER) + "\n" + rest
    return worker


def stamp_service_worker(path: Path, version: str) -> None:
    """Write `version` into the worker, so each app release changes its bytes.

    The browser detects an update only when sw.js differs byte for byte.
    """
    worker = path.read_text(encoding="utf-8")
    placeholder_line = VERSION_LINE.format(PLACEHOLDER)
    if not worker.startswith(placeholder_line):
        raise ValueError(f"{path} does not start with {placeholder_line!r}")
    stamped = VERSION_LINE.format(f'"{version}"') + worker.removeprefix(placeholder_line)
    path.write_text(stamped, encoding="utf-8")


def main() -> int:
    docs = ROOT / "docs"
    version = app_version(docs)
    stamp_service_worker(path=docs / WORKER_NAME, version=version)
    print(f"sw.js stamped with app version {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
