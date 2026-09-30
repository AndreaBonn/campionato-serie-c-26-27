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
    ICS_PATH,
    NOTICE_SEARCH_TERMS,
    NOTICE_SINCE,
    OUTPUT_PATH,
    PAGE_URL,
    REQUEST_DELAY_S,
    SECOND_HALF_CODE,
)
from fip_calendar.fetch import fetch_posts, fetch_round, round_url
from fip_calendar.ics import build_ics
from fip_calendar.merge import MergeError, build_data
from fip_calendar.notices import select_notices
from fip_calendar.parse import FipMatch, ParseError, Standing, parse_matches, parse_standings

logger = logging.getLogger("fip_calendar")
TIMESTAMP_KEY = "updated_at"
NOTICES_KEY = "notices"


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


def previous_notices(path: Path) -> list[dict[str, str]]:
    """Notices already published, reused when FIP Sardegna cannot be reached."""
    if not path.exists():
        return []
    notices: list[dict[str, str]] = json.loads(path.read_text(encoding="utf-8")).get(
        NOTICES_KEY, []
    )
    return notices


def collect(games: list[dict[str, Any]]) -> tuple[dict[str, list[FipMatch]], list[Standing]]:
    rounds: dict[str, list[FipMatch]] = {}
    standings: list[Standing] = []
    for game in games:
        half, number = round_to_page(game["round"])
        html = fetch_round(half_code=half, round_number=number)
        rounds[game["round"]] = parse_matches(html)
        standings = parse_standings(html)
        logger.info("round %s read", game["round"])
        time.sleep(REQUEST_DELAY_S)
    return rounds, standings


def collect_notices(fallback_path: Path) -> list[dict[str, str]]:
    """Format announcements are a side feature: an outage keeps the last known list."""
    try:
        posts = [p for term in NOTICE_SEARCH_TERMS for p in fetch_posts(term, NOTICE_SINCE)]
        return select_notices(posts=posts, since=NOTICE_SINCE)
    except (URLError, ValueError, KeyError, TypeError) as err:
        # TypeError: the API answered with an error object instead of a list of posts
        logger.warning("FIP Sardegna posts unavailable, keeping previous notices: %s", err)
        return previous_notices(fallback_path)


def _without_dtstamp(text: str) -> str:
    return "\r\n".join(line for line in text.split("\r\n") if not line.startswith("DTSTAMP:"))


def write_ics_if_changed(path: Path, text: str) -> bool:
    """Write the feed when its content changes, ignoring the per-run DTSTAMP."""
    if path.exists() and _without_dtstamp(path.read_bytes().decode("utf-8")) == (
        _without_dtstamp(text)
    ):
        return False
    path.write_text(text, encoding="utf-8", newline="")
    return True


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    calendar = json.loads(CALENDAR_PATH.read_text(encoding="utf-8"))
    try:
        rounds, standings = collect(calendar["games"])
        data = build_data(calendar=calendar, rounds=rounds, standings=standings)
    except (URLError, ParseError, MergeError) as err:
        logger.error("sync with fip.it failed, data.json left untouched: %s", err)
        return 1
    data[NOTICES_KEY] = collect_notices(OUTPUT_PATH)
    data["fip_url"] = round_url(half_code=FIRST_HALF_CODE, round_number=1)
    now = datetime.now(tz=UTC)
    changed = write_if_changed(path=OUTPUT_PATH, data=data, now=now.isoformat(timespec="seconds"))
    # rebuilt on every run so a fix to ics.py reaches subscribers even when FIP data is unchanged
    ics = build_ics(data["games"], now.strftime("%Y%m%dT%H%M%SZ"), PAGE_URL)
    ics_changed = write_ics_if_changed(path=ICS_PATH, text=ics)
    logger.info(
        "data.json %s, calendario.ics %s",
        "updated" if changed else "unchanged",
        "updated" if ics_changed else "unchanged",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
