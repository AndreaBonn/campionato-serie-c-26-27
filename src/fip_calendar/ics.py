from datetime import datetime, timedelta
from typing import Any

CRLF = "\r\n"
MAX_LINE_OCTETS = 75
GAME_DURATION = timedelta(hours=2)
UID_DOMAIN = "campionato-serie-c-26-27"
LOCAL_FORMAT = "%Y%m%dT%H%M%S"
# RFC 5545 requires a VTIMEZONE for every TZID used; EU rules since 1996
ROME_TIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Rome",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
]
CALENDAR_HEADER = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//campionato-serie-c-26-27//CUS Cagliari Basket//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:CUS Cagliari Basket",
    "X-WR-TIMEZONE:Europe/Rome",
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
]


def escape_text(value: str) -> str:
    """Escape a TEXT value as RFC 5545 section 3.3.11 requires."""
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold_line(line: str) -> str:
    """Fold a content line at 75 octets without splitting a UTF-8 character."""
    parts, current, limit = [], "", MAX_LINE_OCTETS
    for char in line:
        if len((current + char).encode("utf-8")) > limit:
            parts.append(current)
            current, limit = " ", MAX_LINE_OCTETS
        current += char
    parts.append(current)
    return CRLF.join(parts)


def round_label(round_code: str) -> str:
    half = "andata" if round_code.startswith("A") else "ritorno"
    return f"{round_code[1:]}ª giornata di {half}"


def _description(game: dict[str, Any], page_url: str) -> str:
    lines = [f"Serie C regionale, {round_label(game['round'])}, gara n. {game['n']}"]
    if game["referees"]:
        lines.append("Arbitri: " + "; ".join(game["referees"]))
    if game["changes"]:
        lines.append("Modificata dalla FIP rispetto al comunicato ufficiale")
    lines.append(f"Aggiornamenti: {page_url}")
    return "\n".join(lines)


def _event(game: dict[str, Any], dtstamp: str, page_url: str) -> list[str]:
    start = datetime.fromisoformat(f"{game['date']}T{game['time']}")
    summary = f"{game['home']} - {game['away']}"
    if game["score"]:
        summary += f" {game['score']['home']}-{game['score']['away']}"
    venue = game["venue"]
    location = ", ".join(part for part in (venue["name"], venue["address"]) if part)
    return [
        "BEGIN:VEVENT",
        f"UID:cus-gara{game['n']}@{UID_DOMAIN}",
        f"DTSTAMP:{dtstamp}",
        f"DTSTART;TZID=Europe/Rome:{start.strftime(LOCAL_FORMAT)}",
        f"DTEND;TZID=Europe/Rome:{(start + GAME_DURATION).strftime(LOCAL_FORMAT)}",
        f"SUMMARY:{escape_text(summary)}",
        f"LOCATION:{escape_text(location)}",
        f"DESCRIPTION:{escape_text(_description(game, page_url))}",
        f"URL:{page_url}",
        "END:VEVENT",
    ]


def build_ics(games: list[dict[str, Any]], dtstamp: str, page_url: str) -> str:
    """Build the subscribable calendar of CUS games from data.json games."""
    lines = [*CALENDAR_HEADER, *ROME_TIMEZONE]
    for game in games:
        lines.extend(_event(game, dtstamp, page_url))
    lines.append("END:VCALENDAR")
    return CRLF.join(fold_line(line) for line in lines) + CRLF
