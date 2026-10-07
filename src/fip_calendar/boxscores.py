from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import TypedDict

from fip_calendar.config import (
    BOXSCORE_RETRY_DAYS,
    BOXSCORE_STATUS_COMPLETE,
    BOXSCORE_STATUS_INCOMPLETE,
    BOXSCORE_STATUS_PARTIAL,
    BOXSCORE_STATUS_UNMATCHED,
    PLAYBASKET_TEAM_ALIASES,
)
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


class ScheduledGame(FipGame):
    date: str


class RoundDict(TypedDict):
    round: str
    games: list[ScheduledGame]


class PlayerDict(TypedDict):
    id: str
    number: str
    name: str
    role: str
    age: str
    pts: int | None


class TeamBoxscore(TypedDict):
    team: str
    players: list[PlayerDict]


class BoxscoreEntry(TypedDict):
    round: str
    status: str
    fip_score: FipScore
    mn: int | None
    url: str | None
    home: TeamBoxscore | None
    away: TeamBoxscore | None


@dataclass(frozen=True)
class PendingGame:
    round: str
    game: ScheduledGame
    mn: int


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


def classify(
    totals: tuple[int, int] | None, fip_score: FipScore, game_date: date, today: date,
) -> str:
    """Classify a fresh attempt; None totals mean no matched page."""
    if totals is None:
        return BOXSCORE_STATUS_UNMATCHED
    if totals == (fip_score["home"], fip_score["away"]):
        return BOXSCORE_STATUS_COMPLETE
    if (today - game_date).days <= BOXSCORE_RETRY_DAYS:
        return BOXSCORE_STATUS_PARTIAL
    return BOXSCORE_STATUS_INCOMPLETE


def _needs_attempt(game: ScheduledGame, entry: BoxscoreEntry | None, today: date) -> bool:
    if game["score"] is None:
        return False
    if entry is None or entry["fip_score"] != game["score"]:
        return True
    return entry["status"] in (BOXSCORE_STATUS_PARTIAL, BOXSCORE_STATUS_UNMATCHED) and (
        today - date.fromisoformat(game["date"])
    ).days <= BOXSCORE_RETRY_DAYS


def select_pending(
    rounds: list[RoundDict], previous: dict[str, BoxscoreEntry], today: date,
) -> list[PendingGame]:
    """Select played games in retry priority, without changing either input.

    Parameters
    ----------
    rounds : list[RoundDict]
        Schedule in natural round order; expected mn follows game number order.
    previous : dict[str, BoxscoreEntry]
        Saved attempts. Expired partial entries are frozen by collect_boxscores.
    today : date
        Current local date used for the inclusive retry window.

    Returns
    -------
    list[PendingGame]
        In-window games ordered oldest first, then old first attempts and score
        corrections in schedule order. No budget is applied here.
    """
    pending = [
        PendingGame(round=round_["round"], game=game, mn=mn)
        for round_ in rounds
        for mn, game in enumerate(sorted(round_["games"], key=lambda game: game["n"]), start=1)
        if _needs_attempt(game=game, entry=previous.get(str(game["n"])), today=today)
    ]
    return sorted(pending, key=lambda item: _pending_priority(item=item, today=today))


def _pending_priority(item: PendingGame, today: date) -> tuple[bool, date]:
    game_date = date.fromisoformat(item.game["date"])
    expired = (today - game_date).days > BOXSCORE_RETRY_DAYS
    return expired, date.min if expired else game_date
