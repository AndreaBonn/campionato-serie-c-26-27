from collections import Counter
from dataclasses import dataclass
from typing import TypedDict

from fip_calendar.config import PLAYBASKET_TEAM_ALIASES
from fip_calendar.playbasket import PbHeader

TEAM_ALIASES = {name.casefold(): team.casefold() for name, team in PLAYBASKET_TEAM_ALIASES.items()}


class FipScore(TypedDict):
    home: int
    away: int


class FipGame(TypedDict):
    n: int
    home: str
    away: str
    score: FipScore | None


@dataclass(frozen=True)
class MatchResult:
    matches: dict[int, int]
    unmatched: dict[int, str]


def _alias_errors(game: FipGame, page: PbHeader, mn: int) -> list[str]:
    errors = []
    for name, expected in ((page.home, game["home"]), (page.away, game["away"])):
        actual = TEAM_ALIASES.get(name.casefold())
        if actual != expected.casefold():
            errors.append(f"mn={mn}: alias for {name!r} maps to {actual!r}, expected {expected!r}")
    return errors


def _candidates(game: FipGame, pages: dict[int, PbHeader]) -> tuple[list[int], str]:
    score = game["score"]
    if score is None:
        return [], "missing FIP score: game is unplayed"
    candidates, reasons = [], []
    expected = (score["home"], score["away"])
    for mn, page in pages.items():
        if page.score != expected:
            reasons.append(f"mn={mn}: score {page.score!r} differs from FIP score {expected!r}")
            continue
        errors = _alias_errors(game, page, mn)
        if errors:
            reasons.extend(errors)
        else:
            candidates.append(mn)
    if len(candidates) > 1:
        return candidates, "ambiguous pages: " + ", ".join(f"mn={mn}" for mn in candidates)
    return candidates, "; ".join(reasons) or "no Playbasket pages available"


def _resolve_shared(matches: dict[int, int], unmatched: dict[int, str]) -> MatchResult:
    usage = Counter(matches.values())
    unique = {n: mn for n, mn in matches.items() if usage[mn] == 1}
    conflicts = {
        n: f"mn={mn}: page shared by multiple FIP games"
        for n, mn in matches.items()
        if usage[mn] > 1
    }
    return MatchResult(matches=unique, unmatched={**unmatched, **conflicts})


def match_round(fip_games: list[FipGame], pages: dict[int, PbHeader]) -> MatchResult:
    """Match oriented scores and aliases, rejecting ambiguous or shared pages.

    Parameters
    ----------
    fip_games : list[FipGame]
        Round games with integer n, home/away names and a home/away score dict or None.
    pages : dict[int, PbHeader]
        Parsed Playbasket pages indexed by mn; neither argument is mutated.

    Returns
    -------
    MatchResult
        matches maps FIP n to Playbasket mn. unmatched maps every remaining n to
        a reason naming involved pages and, for alias failures, Playbasket names.
        Unplayed FIP games are unmatched even when a page also has no score.
    """
    matches: dict[int, int] = {}
    unmatched: dict[int, str] = {}
    for game in fip_games:
        candidates, reason = _candidates(game, pages)
        if len(candidates) == 1:
            matches[game["n"]] = candidates[0]
        else:
            unmatched[game["n"]] = reason
    return _resolve_shared(matches, unmatched)
