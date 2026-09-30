import json
import logging
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import URLError

from fip_calendar.config import (
    CALENDAR_PATH,
    FIRST_HALF_CODE,
    OUTPUT_PATH,
    REQUEST_DELAY_S,
    SECOND_HALF_CODE,
)
from fip_calendar.fetch import fetch_round, round_url
from fip_calendar.merge import MergeError, build_data
from fip_calendar.parse import FipMatch, ParseError, Standing, parse_matches, parse_standings

logger = logging.getLogger("fip_calendar")
TIMESTAMP_KEY = "updated_at"


def round_to_page(round_code: str) -> tuple[int, int]:
    """Map a calendar round ('A5', 'R11') to fip.it (codice_ar, giornata)."""
    half = FIRST_HALF_CODE if round_code.startswith("A") else SECOND_HALF_CODE
    return half, int(round_code[1:])


def write_if_changed(path: Path, data: dict[str, Any], now: str) -> bool:
    """Write data with a timestamp, only if it differs from the file on disk."""
    if path.exists():
        previous = json.loads(path.read_text(encoding="utf-8"))
        previous.pop(TIMESTAMP_KEY, None)
        if previous == data:
            return False
    text = json.dumps({**data, TIMESTAMP_KEY: now}, ensure_ascii=False, indent=2) + "\n"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)
    return True


def collect(games: list[dict[str, Any]]) -> tuple[dict[int, FipMatch], list[Standing]]:
    matches: dict[int, FipMatch] = {}
    standings: list[Standing] = []
    for game in games:
        half, number = round_to_page(game["round"])
        html = fetch_round(half_code=half, round_number=number)
        matches.update({m.number: m for m in parse_matches(html)})
        standings = parse_standings(html)
        logger.info("round %s read", game["round"])
        time.sleep(REQUEST_DELAY_S)
    return matches, standings


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    calendar = json.loads(CALENDAR_PATH.read_text(encoding="utf-8"))
    try:
        matches, standings = collect(calendar["games"])
        data = build_data(calendar=calendar, matches=matches, standings=standings)
    except (URLError, ParseError, MergeError) as err:
        logger.error("sync with fip.it failed, data.json left untouched: %s", err)
        return 1
    data["fip_url"] = round_url(half_code=FIRST_HALF_CODE, round_number=1)
    now = datetime.now(tz=UTC).isoformat(timespec="seconds")
    changed = write_if_changed(path=OUTPUT_PATH, data=data, now=now)
    logger.info("data.json %s", "updated" if changed else "unchanged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
