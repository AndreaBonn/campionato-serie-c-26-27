import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit

from bs4 import BeautifulSoup, Tag

SCORE_SUFFIX = re.compile(pattern=r" (?P<home>\d+)-(?P<away>\d+)$")


class PlaybasketParseError(Exception):
    """The Playbasket page lacks the structure needed to read a box score reliably."""


@dataclass(frozen=True)
class PbHeader:
    home: str
    away: str
    score: tuple[int, int] | None


@dataclass(frozen=True)
class PbPlayer:
    id: str
    number: str
    name: str
    role: str
    age: str
    pts: int | None


def parse_header(html: str) -> PbHeader:
    """Read teams and an optional oriented score from the page title.

    Parameters
    ----------
    html : str
        Playbasket match page; an absent or malformed title raises PlaybasketParseError.

    Returns
    -------
    PbHeader
        Original team names and home/away points, or None for an unplayed game.
    """
    title = BeautifulSoup(markup=html, features="html.parser").title
    text = title.get_text(strip=True) if title else ""
    matchup, date_separator, _ = text.partition(" [")
    score_match = SCORE_SUFFIX.search(string=matchup)
    score = None
    if score_match:
        score = (int(score_match["home"]), int(score_match["away"]))
        matchup = matchup[: score_match.start()]
    home, team_separator, away = matchup.partition(" - ")
    if not date_separator or not team_separator or not home.strip() or not away.strip():
        raise PlaybasketParseError(f"missing or malformed match title: {text!r}")
    return PbHeader(home=home.strip(), away=away.strip(), score=score)


def _optional_text(node: Tag, selector: str) -> str:
    found = node.select_one(selector)
    return found.get_text(strip=True) if found else ""


def _player(row: Tag, link: Tag) -> PbPlayer:
    name = " ".join(" ".join(link.find_all(string=True, recursive=False)).split())
    href = link.get("href")
    query = parse_qs(qs=urlsplit(url=href if isinstance(href, str) else "").query)
    points = row.select_one(selector="td.divisore")
    if points is None:
        raise PlaybasketParseError(f"missing points cell for {name!r}")
    pts = points.get_text(strip=True)
    try:
        value = int(pts) if pts else None
    except ValueError as err:
        raise PlaybasketParseError(f"non-numeric points for {name!r}: {pts!r}") from err
    return PbPlayer(
        id=query.get("obj", [name.casefold()])[0],
        number=_optional_text(node=row, selector="td.playerTeamNumber"),
        name=name,
        role=_optional_text(node=link, selector=".playerInfos_role"),
        age=_optional_text(node=link, selector=".playerInfos_age"),
        pts=value,
    )


def parse_players(html: str, side: int) -> tuple[PbPlayer, ...]:
    """Read a team's roster without the aggregate row.

    Parameters
    ----------
    html : str
        Playbasket match page; malformed points raise PlaybasketParseError.
    side : int
        Home table index (0) or away table index (1).

    Returns
    -------
    tuple[PbPlayer, ...]
        Empty for a missing table; blank points become None, numeric zero stays 0.
        IDs use only the profile's obj parameter, falling back to the casefolded name.
    """
    table = BeautifulSoup(markup=html, features="html.parser").select_one(
        selector=f"table#tableStandingsTeam{side}"
    )
    if table is None:
        return ()
    players = []
    for row in table.select(selector="tbody tr"):
        link = row.select_one(selector="td.sq a")
        if link is not None:
            players.append(_player(row, link))
    return tuple(players)
