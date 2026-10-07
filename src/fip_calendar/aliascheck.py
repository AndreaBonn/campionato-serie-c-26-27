import json
import sys
from dataclasses import dataclass

from fip_calendar.config import OUTPUT_PATH, PLAYBASKET_TEAM_ALIASES

# GitHub Actions turns this stdout prefix into an annotation on the run summary
ANNOTATION = "::error title=PLAYBASKET_TEAM_ALIASES out of date::"


@dataclass(frozen=True)
class AliasDrift:
    unaliased: frozenset[str]
    unused: frozenset[str]

    def __bool__(self) -> bool:
        return bool(self.unaliased or self.unused)


def alias_drift(teams: set[str], aliases: dict[str, str]) -> AliasDrift:
    """Compare the FIP standings teams with the FIP side of the playbasket aliases.

    Parameters
    ----------
    teams : set[str]
        FIP team names as published in the standings.
    aliases : dict[str, str]
        Playbasket name to FIP name.

    Returns
    -------
    AliasDrift
        Teams with no alias (their box scores never match) and aliases whose FIP
        name is gone (typically the old name of a team that changed sponsor).
    """
    known = set(aliases.values())
    return AliasDrift(unaliased=frozenset(teams - known), unused=frozenset(known - teams))


def main() -> int:
    data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    drift = alias_drift(
        teams={row["team"] for row in data["standings"]}, aliases=PLAYBASKET_TEAM_ALIASES
    )
    if not drift:
        print("PLAYBASKET_TEAM_ALIASES matches the FIP standings")
        return 0
    print(
        f"{ANNOTATION}FIP teams without alias: {sorted(drift.unaliased)}; "
        f"aliases with no FIP team: {sorted(drift.unused)}"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
