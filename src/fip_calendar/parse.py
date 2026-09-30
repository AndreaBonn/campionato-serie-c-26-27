import re
from dataclasses import dataclass
from datetime import date

from bs4 import BeautifulSoup, Tag

MONTHS = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
    "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}  # fmt: skip
STATUS_PREFIX = "match-status--"
REFEREE_LABEL = "Arbitro"
# FIP fills an undesignated referee slot with this text instead of leaving it empty
PENDING_DESIGNATION = "Designazione in attesa"
VENUE_LABEL = "Campo di gioco"
STANDING_COLUMNS = 8


class ParseError(Exception):
    """The fip.it page does not have the structure the parser relies on."""


@dataclass(frozen=True)
class FipMatch:
    number: int
    home: str
    away: str
    date: str
    time: str
    venue: str
    status: str
    status_text: str
    referees: tuple[str, ...]
    score: tuple[int, int] | None


@dataclass(frozen=True)
class Standing:
    position: int
    team: str
    points: int
    played: int
    won: int
    lost: int
    points_for: int
    points_against: int


def clean(text: str) -> str:
    """Collapse whitespace and the stray space FIP puts after '(' in province codes."""
    return re.sub(r"\s+", " ", text).strip().replace("( ", "(")


def parse_int(text: str, what: str) -> int:
    """Read an integer from the page, reporting a layout change as ParseError."""
    try:
        return int(text)
    except ValueError as err:
        raise ParseError(f"non-numeric {what}: {text!r}") from err


def parse_italian_date(text: str) -> str:
    """Convert '20 Dicembre 2026' to '2026-12-20'; impossible dates raise ParseError."""
    parts = clean(text).split(" ")
    month = MONTHS.get(parts[1].lower()) if len(parts) == 3 else None
    if month is None:
        raise ParseError(f"unrecognised date: {text!r}")
    day, year = parse_int(parts[0], "day"), parse_int(parts[2], "year")
    try:
        return date(year, month, day).isoformat()
    except ValueError as err:
        raise ParseError(f"impossible date: {text!r}") from err


def _text(node: Tag, selector: str) -> str:
    found = node.select_one(selector)
    if found is None:
        raise ParseError(f"missing {selector!r} in match block")
    return clean(found.get_text())


def _info_values(node: Tag, column: str, label: str) -> list[str]:
    values = []
    for info in node.select(f"{column} .info"):
        label_node, value_node = info.select_one(".label"), info.select_one(".value")
        if label_node and value_node and label in label_node.get_text():
            values.append(clean(value_node.get_text()))
    return values


def _referees(node: Tag) -> tuple[str, ...]:
    names = _info_values(node, ".col2", REFEREE_LABEL)
    return tuple(n for n in names if n and not n.startswith(PENDING_DESIGNATION))


def _status(node: Tag) -> tuple[str, str]:
    status_node = node.select_one(".match-status")
    if status_node is None:
        return "", ""
    classes = [c for c in status_node.get("class") or [] if c.startswith(STATUS_PREFIX)]
    status = classes[0].removeprefix(STATUS_PREFIX) if classes else ""
    legend = status_node.select_one(".match-status__legend h4")
    return status, clean(legend.get_text()) if legend else ""


def _score(node: Tag) -> tuple[int, int] | None:
    points = [clean(p.get_text()) for p in node.select(".team__points")]
    if len(points) != 2 or not all(p.isdigit() for p in points):
        return None
    return int(points[0]), int(points[1])


def _parse_match(node: Tag) -> FipMatch:
    teams = [clean(t.get_text()) for t in node.select(".teams .team__name")]
    if len(teams) != 2:
        raise ParseError(f"expected 2 teams, found {teams}")
    venues = _info_values(node, ".col1", VENUE_LABEL)
    status, status_text = _status(node)
    return FipMatch(
        number=parse_int(_text(node, ".ref"), "game number"),
        home=teams[0],
        away=teams[1],
        date=parse_italian_date(_text(node, ".datetime .date")),
        time=_text(node, ".datetime .time"),
        venue=venues[0] if venues else "",
        status=status,
        status_text=status_text,
        referees=_referees(node),
        score=_score(node),
    )


def parse_matches(html: str) -> list[FipMatch]:
    """Extract every game of one round from a fip.it/risultati page."""
    nodes = BeautifulSoup(html, "html.parser").select("div.results-matches__match")
    if not nodes:
        raise ParseError("no match blocks found: fip.it layout may have changed")
    return [_parse_match(node) for node in nodes]


def parse_standings(html: str) -> list[Standing]:
    """Extract the official standings table from a fip.it/risultati page."""
    soup = BeautifulSoup(html, "html.parser")
    rows = [r for r in soup.select(".results-ranking-full tbody tr") if not r.has_attr("data-row")]
    if not rows:
        raise ParseError("standings table not found: fip.it layout may have changed")
    standings = []
    for row in rows:
        cells = [clean(td.get_text()) for td in row.select("td")]
        if len(cells) != STANDING_COLUMNS:
            raise ParseError(f"unexpected standings row: {cells}")
        numbers = [parse_int(c, "standings value") for c in cells[2:]]
        position = parse_int(cells[0], "standings position")
        standings.append(Standing(position, cells[1], *numbers))
    return standings
