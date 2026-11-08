import json
import re
from pathlib import Path

from fip_calendar import config

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"


def test_playbasket_team_aliases_match_all_fip_standings_teams() -> None:
    # frozen copy: the live standings are checked by the alias-check job of the workflow
    teams = set(json.loads((FIXTURES / "standings-teams.json").read_text(encoding="utf-8")))

    assert set(config.PLAYBASKET_TEAM_ALIASES.values()) == teams


def test_playbasket_team_aliases_cover_all_first_round_fixture_teams() -> None:
    teams: set[str] = set()
    for mn in range(1, 7):
        html = (FIXTURES / f"playbasket-a1-m{mn}.html").read_text(encoding="utf-8")
        match = re.search(pattern=r"<title>(.+?) - (.+?) \d+-\d+ \[", string=html)
        assert match is not None
        teams.update(match.groups())

    assert set(config.PLAYBASKET_TEAM_ALIASES) == teams


def test_config_fip_request_delay_is_one_second() -> None:
    assert config.REQUEST_DELAY_S == 1.0


def test_config_crest_side_is_128_pixels() -> None:
    assert config.LOGO_MAX_SIDE_PX == 128


def test_config_page_url_points_to_published_calendar() -> None:
    assert config.PAGE_URL == "https://andreabonn.github.io/campionato-serie-c-26-27/"
