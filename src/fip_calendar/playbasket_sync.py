import logging
from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import date
from http.client import HTTPException

from fip_calendar.boxscores import (
    BoxscoreEntry,
    MatchResult,
    PendingGame,
    PlayerDict,
    RoundDict,
    TeamBoxscore,
    classify,
    match_round,
    select_pending,
)
from fip_calendar.config import (
    BOXSCORE_RETRY_DAYS,
    BOXSCORE_STATUS_INCOMPLETE,
    BOXSCORE_STATUS_PARTIAL,
    PLAYBASKET_DELAY_S,
    PLAYBASKET_FIRST_HALF,
    PLAYBASKET_MATCHES_PER_ROUND,
    PLAYBASKET_MAX_PAGES_PER_RUN,
    PLAYBASKET_SECOND_HALF,
)
from fip_calendar.fetch import playbasket_match_url
from fip_calendar.playbasket import PbHeader, PlaybasketParseError, parse_header, parse_players

logger = logging.getLogger(__name__)
HOME_SIDE = 0
AWAY_SIDE = 1
ROUND_HALVES = {"A": PLAYBASKET_FIRST_HALF, "R": PLAYBASKET_SECOND_HALF}
# OSError covers URLError and the read timeouts urlopen raises outside it; HTTPException a
# truncated body; UnicodeDecodeError a page that is not UTF-8
PAGE_ERRORS = (OSError, HTTPException, UnicodeDecodeError, PlaybasketParseError)


@dataclass(frozen=True)
class PlaybasketClient:
    fetch: Callable[[int, int, int], str]
    sleep: Callable[[float], None]


@dataclass(frozen=True)
class _Page:
    header: PbHeader
    home: TeamBoxscore
    away: TeamBoxscore

    def totals(self) -> tuple[int, int]:
        return (
            sum(player["pts"] or 0 for player in self.home["players"]),
            sum(player["pts"] or 0 for player in self.away["players"]),
        )


@dataclass
class _Run:
    client: PlaybasketClient
    requested: int = 0

    def read_page(self, code: str, mn: int) -> _Page:
        half, round_number = parse_round(code=code)
        if self.requested:
            self.client.sleep(PLAYBASKET_DELAY_S)
        self.requested += 1
        html = self.client.fetch(half, round_number, mn)
        header = parse_header(html=html)
        return _Page(
            header=header,
            home=_read_team(html=html, team=header.home, side=HOME_SIDE),
            away=_read_team(html=html, team=header.away, side=AWAY_SIDE),
        )


@dataclass
class _RoundAttempt:
    pending: list[PendingGame]
    candidates: list[int]
    pages: dict[int, _Page] = field(default_factory=dict)
    failed: bool = False
    # the first page matched to a game wins: a duplicate read later, while another game of
    # the round is searched, must not undo it, or the outcome would depend on the search order
    locked: dict[int, int] = field(default_factory=dict)

    def match_result(self) -> MatchResult:
        return match_round(
            fip_games=[item.game for item in self.pending],
            pages={mn: page.header for mn, page in self.pages.items()},
        )

    def lock_matches(self, result: MatchResult) -> dict[int, int]:
        """Lock every game of result the first time it matches; return all locked matches."""
        for n, mn in result.matches.items():
            self.locked.setdefault(n, mn)
        return dict(self.locked)


def parse_round(code: str) -> tuple[int, int]:
    """Map a schedule code such as A5 or R3 to Playbasket half and round number."""
    return ROUND_HALVES[code[0]], int(code[1:])


def _read_team(html: str, team: str, side: int) -> TeamBoxscore:
    players: list[PlayerDict] = [
        {
            "id": player.id,
            "number": player.number,
            "name": player.name,
            "role": player.role,
            "age": player.age,
            "pts": player.pts,
        }
        for player in parse_players(html=html, side=side)
    ]
    return {"team": team, "players": players}


def _freeze_expired(
    rounds: list[RoundDict],
    previous: dict[str, BoxscoreEntry],
    today: date,
) -> dict[str, BoxscoreEntry]:
    result = deepcopy(x=previous)
    for round_ in rounds:
        for game in round_["games"]:
            entry = result.get(str(game["n"]))
            expired = (today - date.fromisoformat(game["date"])).days > BOXSCORE_RETRY_DAYS
            if (
                entry
                and entry["status"] == BOXSCORE_STATUS_PARTIAL
                and expired
                and game["score"] == entry["fip_score"]
            ):
                result[str(game["n"])] = {**entry, "status": BOXSCORE_STATUS_INCOMPLETE}
                _log_incomplete(code=round_["round"], n=game["n"])
    return result


def _log_incomplete(code: str, n: int) -> None:
    logger.warning("playbasket: %s n=%d frozen as incomplete, points never matched FIP", code, n)


def _warn_if_empty(item: PendingGame, page: _Page, mn: int) -> None:
    """A matched page with no points at all points to changed markup, not a late entry."""
    score = item.game["score"]
    if page.totals() == (0, 0) and score is not None and (score["home"], score["away"]) != (0, 0):
        logger.warning(
            "playbasket: %s n=%d mn=%d: no player points on a matched page, layout changed?",
            item.round, item.game["n"], mn,
        )


def _candidate_pages(
    code: str, pending: list[PendingGame], previous: dict[str, BoxscoreEntry]
) -> list[int]:
    numbers = {str(item.game["n"]) for item in pending}
    frozen = {
        entry["mn"] for n, entry in previous.items() if entry["round"] == code and n not in numbers
    }
    candidates = [item.mn for item in pending] + list(range(1, PLAYBASKET_MATCHES_PER_ROUND + 1))
    return [mn for mn in dict.fromkeys(candidates) if mn not in frozen]


def _make_entry(
    item: PendingGame, page: _Page | None, mn: int | None, today: date
) -> BoxscoreEntry:
    score = item.game["score"]
    assert score is not None
    half, round_number = parse_round(code=item.round)
    return {
        "round": item.round,
        "status": classify(
            totals=page.totals() if page else None,
            fip_score=score,
            game_date=date.fromisoformat(item.game["date"]),
            today=today,
        ),
        "fip_score": {**score},
        "mn": mn,
        "url": None
        if mn is None
        else playbasket_match_url(
            half=half,
            round_number=round_number,
            mn=mn,
        ),
        "home": page.home if page else None,
        "away": page.away if page else None,
    }


def _request_until_found(item: PendingGame, attempt: _RoundAttempt, run: _Run) -> None:
    if attempt.failed or item.game["n"] in attempt.lock_matches(result=attempt.match_result()):
        return
    for mn in attempt.candidates:
        if run.requested >= PLAYBASKET_MAX_PAGES_PER_RUN:
            return
        if mn in attempt.pages:
            continue
        try:
            attempt.pages[mn] = run.read_page(code=item.round, mn=mn)
        except PAGE_ERRORS as err:
            logger.warning("playbasket: %s mn=%d failed: %s", item.round, mn, err)
            attempt.failed = True
            return
        if item.game["n"] in attempt.lock_matches(result=attempt.match_result()):
            return


def _finish_round(attempt: _RoundAttempt, today: date) -> dict[str, BoxscoreEntry]:
    if attempt.failed:
        return {}
    result = attempt.match_result()
    matches = attempt.lock_matches(result=result)
    exhausted = len(attempt.pages) == len(attempt.candidates)
    code = attempt.pending[0].round
    for n, reason in result.unmatched.items():
        if n in matches:
            logger.warning("playbasket: %s n=%d: kept mn=%d, %s", code, n, matches[n], reason)
        elif exhausted:
            logger.warning("playbasket: %s n=%d unmatched: %s", code, n, reason)
    entries = {}
    for item in attempt.pending:
        n = item.game["n"]
        if n not in matches and not exhausted:
            continue
        page = attempt.pages[matches[n]] if n in matches else None
        if page is not None:
            _warn_if_empty(item=item, page=page, mn=matches[n])
        entries[str(n)] = _make_entry(item=item, page=page, mn=matches.get(n), today=today)
        if entries[str(n)]["status"] == BOXSCORE_STATUS_INCOMPLETE:
            _log_incomplete(code=item.round, n=n)
    return entries


def _prepare_attempts(
    pending: list[PendingGame],
    previous: dict[str, BoxscoreEntry],
) -> dict[str, _RoundAttempt]:
    grouped: dict[str, list[PendingGame]] = {}
    for item in pending:
        grouped.setdefault(item.round, []).append(item)
    return {
        code: _RoundAttempt(
            pending=items, candidates=_candidate_pages(code=code, pending=items, previous=previous)
        )
        for code, items in grouped.items()
    }


def collect_boxscores(
    *,
    rounds: list[RoundDict],
    previous: dict[str, BoxscoreEntry],
    today: date,
    client: PlaybasketClient,
) -> dict[str, BoxscoreEntry]:
    """Return deterministic box scores using the schedule, saved state and local date.

    Fetch and sleep use client boundaries. Inputs stay untouched; expired partials
    freeze without HTTP, even in a round whose pages failed; a failed round otherwise
    keeps its previous state. Budget
    exhaustion preserves unvisited entries so old first attempts remain eligible.
    """
    pending = select_pending(rounds=rounds, previous=previous, today=today)
    attempts = _prepare_attempts(pending=pending, previous=previous)
    run = _Run(client=client)
    for item in pending:
        _request_until_found(item=item, attempt=attempts[item.round], run=run)
    # freezing needs no page: a failed request elsewhere in the round must not delay it
    result = _freeze_expired(rounds=rounds, previous=previous, today=today)
    for attempt in attempts.values():
        result.update(_finish_round(attempt=attempt, today=today))
    logger.info("playbasket: %d pages requested", run.requested)
    return result
