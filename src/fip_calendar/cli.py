import json
import logging
import sys
import time
from datetime import UTC, date, datetime
from http.client import HTTPException
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fip_calendar.boxscores import BoxscoreEntry, RoundDict
from fip_calendar.config import (
    BOXSCORES_PATH,
    CALENDAR_PATH,
    FIRST_HALF_CODE,
    ICS_PATH,
    LOGOS_DIR,
    NOTICE_CATEGORY_ID,
    NOTICE_SEARCH_TERMS,
    NOTICE_SINCE,
    OUTPUT_PATH,
    PAGE_URL,
    REQUEST_DELAY_S,
    SECOND_HALF_CODE,
    STATUS_PATH,
)
from fip_calendar.fetch import (
    fetch_category_posts,
    fetch_comunicati,
    fetch_logo,
    fetch_playbasket_match,
    fetch_posts,
    fetch_round,
    round_pdf_url,
    round_url,
)
from fip_calendar.ics import build_ics
from fip_calendar.logos import Logos, logo_sources, sync_logos
from fip_calendar.merge import MergeError, build_data
from fip_calendar.notices import (
    KIND_COMUNICATO,
    KIND_LEAGUE,
    merge_notices,
    select_notices,
)
from fip_calendar.parse import FipMatch, ParseError, Standing, parse_matches, parse_standings
from fip_calendar.playbasket_sync import PlaybasketClient, collect_boxscores

logger = logging.getLogger("fip_calendar")
TIMESTAMP_KEY = "updated_at"
NOTICES_KEY = "notices"
LOGOS_KEY = "logos"
BOXSCORES_KEY = "boxscores"
# OSError covers URLError and the read timeouts urlopen raises outside it; HTTPException a
# truncated body
NETWORK_ERRORS = (OSError, HTTPException)
# FIP dates are Italian: the 14-day retry window counts Italian calendar days
LOCAL_TZ = ZoneInfo("Europe/Rome")


def round_to_page(round_code: str) -> tuple[int, int]:
    """Map a calendar round ('A5', 'R11') to fip.it (codice_ar, giornata)."""
    half = FIRST_HALF_CODE if round_code.startswith("A") else SECOND_HALF_CODE
    return half, int(round_code[1:])


def with_round_pdfs(league: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Copy of the league rounds, each with the link to its official FIP PDF."""
    return [{**r, "pdf_url": round_pdf_url(*round_to_page(r["round"]))} for r in league]


def read_json(path: Path) -> dict[str, Any] | None:
    """Read a generated JSON file; a missing or corrupted one reads as None."""
    if not path.exists():
        return None
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        logger.warning("%s is not valid JSON, treating it as absent: %s", path, err)
        return None
    if not isinstance(content, dict):
        logger.warning("%s does not hold a JSON object, treating it as absent", path)
        return None
    return content


def write_if_changed(path: Path, data: dict[str, Any], now: str) -> bool:
    """Write data with a timestamp, only if it differs from the file on disk."""
    previous = read_json(path)
    if previous is not None:
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
    previous = read_json(path)
    notices: list[dict[str, str]] = previous.get(NOTICES_KEY, []) if previous else []
    return notices


def collect_logos(rounds: dict[str, list[FipMatch]], fallback_path: Path) -> Logos:
    """Copy new or changed crests into LOGOS_DIR; the entries already published are reused."""
    previous = read_json(fallback_path)
    known = previous.get(LOGOS_KEY) if previous else None
    return sync_logos(
        sources=logo_sources(rounds),
        previous=known if isinstance(known, dict) else {},
        directory=LOGOS_DIR,
        download=fetch_logo,
    )


def previous_boxscores(path: Path) -> dict[str, BoxscoreEntry]:
    """Box scores already published: frozen games are never requested again."""
    previous = read_json(path)
    known = previous.get(BOXSCORES_KEY) if previous else None
    return known if isinstance(known, dict) else {}


def italian_date(moment: datetime) -> date:
    return moment.astimezone(LOCAL_TZ).date()


def sync_boxscores(rounds: list[RoundDict], now: datetime) -> bool:
    """Read the pending playbasket.it box scores and write boxscores.json if they changed."""
    boxscores = collect_boxscores(
        rounds=rounds,
        previous=previous_boxscores(BOXSCORES_PATH),
        today=italian_date(now),
        client=PlaybasketClient(fetch=fetch_playbasket_match, sleep=time.sleep),
    )
    return write_if_changed(
        path=BOXSCORES_PATH, data={BOXSCORES_KEY: boxscores}, now=now.isoformat(timespec="seconds")
    )


def collect(games: list[dict[str, Any]]) -> tuple[dict[str, list[FipMatch]], list[Standing]]:
    """Read the fip.it page of every calendar round, pausing between requests.

    Every round page carries the current standings table, so the one from the
    last page read is returned.
    """
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
    """FIP Sardegna notices are a side feature: an outage keeps the last known list.

    Three sources, merged with the format searches first so a post found twice keeps
    the more specific kind: keyword searches, the "C REGIONALE" category, the comunicati.
    """
    try:
        posts = [p for term in NOTICE_SEARCH_TERMS for p in fetch_posts(term, NOTICE_SINCE)]
        league = fetch_category_posts(NOTICE_CATEGORY_ID, NOTICE_SINCE)
        comunicati = fetch_comunicati(NOTICE_SINCE)
        return merge_notices(
            select_notices(posts=posts, since=NOTICE_SINCE),
            select_notices(posts=league, since=NOTICE_SINCE, kind=KIND_LEAGUE),
            select_notices(posts=comunicati, since=NOTICE_SINCE, kind=KIND_COMUNICATO),
        )
    except (*NETWORK_ERRORS, ValueError, KeyError, TypeError) as err:
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
    except (*NETWORK_ERRORS, ParseError, MergeError) as err:
        logger.error("sync with fip.it failed, data.json left untouched: %s", err)
        return 1
    data["rounds"] = with_round_pdfs(data["rounds"])
    data[NOTICES_KEY] = collect_notices(OUTPUT_PATH)
    data[LOGOS_KEY] = collect_logos(rounds=rounds, fallback_path=OUTPUT_PATH)
    data["fip_url"] = round_url(half_code=FIRST_HALF_CODE, round_number=1)
    now = datetime.now(tz=UTC)
    checked_at = now.isoformat(timespec="seconds")
    changed = write_if_changed(path=OUTPUT_PATH, data=data, now=checked_at)
    # rebuilt on every run so a fix to ics.py reaches subscribers even when FIP data is unchanged
    ics = build_ics(data["games"], now.strftime("%Y%m%dT%H%M%SZ"), PAGE_URL)
    ics_changed = write_ics_if_changed(path=ICS_PATH, text=ics)
    boxscores_changed = sync_boxscores(rounds=data["rounds"], now=now)
    # written last: it certifies that fip.it was read and every output is on disk
    STATUS_PATH.write_text(json.dumps({"checked_at": checked_at}) + "\n", encoding="utf-8")
    logger.info(
        "data.json %s, calendario.ics %s, boxscores.json %s",
        "updated" if changed else "unchanged",
        "updated" if ics_changed else "unchanged",
        "updated" if boxscores_changed else "unchanged",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
