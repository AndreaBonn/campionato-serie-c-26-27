from dataclasses import asdict
from typing import Any

from fip_calendar.parse import FipMatch, Standing


class MergeError(Exception):
    """FIP data cannot be matched with the official calendar."""


def _normalise(name: str) -> str:
    return " ".join(name.casefold().split())


def _split_venue(venue: str) -> dict[str, str]:
    name, _, address = venue.partition(",")
    return {"name": name.strip(), "address": address.strip()}


def _score(match: FipMatch) -> dict[str, int] | None:
    return {"home": match.score[0], "away": match.score[1]} if match.score else None


def _changes(
    official: dict[str, Any], match: FipMatch, venue: dict[str, str], home_swapped: bool
) -> list[str]:
    changes = []
    if match.date != official["date"]:
        changes.append("date")
    if match.time != official["time"]:
        changes.append("time")
    if _normalise(venue["name"]) != _normalise(official["venue"]["name"]):
        changes.append("venue")
    if home_swapped:
        changes.append("home")
    return changes


def merge_game(
    base: dict[str, Any], venues: dict[str, dict[str, str]], match: FipMatch, fip_team: str
) -> dict[str, Any]:
    """Combine one game of the official calendar with its current fip.it state."""
    # case-insensitive like the calendar-side comparison below, so a recased FIP name still matches
    team_key = fip_team.casefold()
    if team_key not in (match.home.casefold(), match.away.casefold()):
        raise MergeError(f"game {match.number} does not involve {fip_team}")
    # the calendar is hand-transcribed: a typo in our name would silently swap the teams
    if team_key not in (base["home"].casefold(), base["away"].casefold()):
        raise MergeError(f"calendar game {base['n']} does not involve {fip_team}")
    if base["venue"] not in venues:
        raise MergeError(f"game {base['n']} uses unknown venue {base['venue']!r}")
    base_is_home = base["home"].casefold() == team_key
    team, opponent = (base["home"], base["away"]) if base_is_home else (base["away"], base["home"])
    is_home = match.home.casefold() == team_key
    official = {"date": base["date"], "time": base["time"], "venue": venues[base["venue"]]}
    # an empty venue on fip.it means "not published", not "moved": keep the official one
    venue = _split_venue(match.venue) if match.venue else official["venue"]
    changes = _changes(
        official=official, match=match, venue=venue, home_swapped=is_home != base_is_home
    )
    return {
        "round": base["round"],
        "n": base["n"],
        "home": team if is_home else opponent,
        "away": opponent if is_home else team,
        "is_home": is_home,
        "date": match.date,
        "time": match.time,
        "venue": venue,
        "official": official,
        "changes": changes,
        "status": match.status,
        "status_text": match.status_text,
        "referees": list(match.referees),
        "score": _score(match),
        "sanctions": list(match.sanctions),
        # FIP spelling, the key into standings, rounds and logos
        "fip_opponent": match.away if is_home else match.home,
    }


def _round_game(match: FipMatch) -> dict[str, Any]:
    return {
        "n": match.number,
        "home": match.home,
        "away": match.away,
        "date": match.date,
        "time": match.time,
        "status": match.status,
        "score": _score(match),
        "referees": list(match.referees),
        "sanctions": list(match.sanctions),
    }


def build_data(
    calendar: dict[str, Any], rounds: dict[str, list[FipMatch]], standings: list[Standing]
) -> dict[str, Any]:
    """Build the JSON document the page reads.

    Parameters
    ----------
    calendar : dict
        Official baseline (`fip_team`, `venues`, `games` with a `round` code each).
    rounds : dict
        Every fip.it game of each round, keyed by round code ('A1'..'R11').
    standings : list of Standing
        Official standings table.
    """
    matches = {m.number: m for games in rounds.values() for m in games}
    games = []
    for base in calendar["games"]:
        match = matches.get(base["n"])
        if match is None:
            raise MergeError(f"game {base['n']} not found on fip.it")
        games.append(
            merge_game(
                base=base, venues=calendar["venues"], match=match, fip_team=calendar["fip_team"]
            )
        )
    league = [
        {
            "round": code,
            "games": [_round_game(m) for m in sorted(round_games, key=lambda m: m.number)],
        }
        for code, round_games in rounds.items()
    ]
    return {"games": games, "rounds": league, "standings": [asdict(s) for s in standings]}
