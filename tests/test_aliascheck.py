import json
from pathlib import Path

import pytest

from fip_calendar import aliascheck
from fip_calendar.aliascheck import AliasDrift, alias_drift

ALIASES = {"Cus Cagliari": "CUS CAGLIARI", "Olimpia Cagliari": "OLIMPIA CAGLIARI"}


def write_standings(path: Path, teams: list[str]) -> Path:
    path.write_text(json.dumps({"standings": [{"team": team} for team in teams]}))
    return path


def test_alias_drift_every_team_aliased_returns_no_drift() -> None:
    drift = alias_drift(teams={"CUS CAGLIARI", "OLIMPIA CAGLIARI"}, aliases=ALIASES)

    assert drift == AliasDrift(unaliased=frozenset(), unused=frozenset())
    assert not drift


def test_alias_drift_renamed_team_reports_new_name_and_stale_alias() -> None:
    drift = alias_drift(teams={"CUS CAGLIARI", "NEW SPONSOR OLIMPIA"}, aliases=ALIASES)

    assert drift == AliasDrift(
        unaliased=frozenset({"NEW SPONSOR OLIMPIA"}), unused=frozenset({"OLIMPIA CAGLIARI"})
    )
    assert drift


@pytest.mark.parametrize(
    argnames="teams,unaliased,unused",
    argvalues=[
        (["CUS CAGLIARI", "OLIMPIA CAGLIARI", "NEW CLUB"], {"NEW CLUB"}, set()),
        (["CUS CAGLIARI"], set(), {"OLIMPIA CAGLIARI"}),
    ],
    ids=["only-unaliased", "only-unused"],
)
def test_alias_drift_single_difference_is_truthy_and_main_exits_one(
    teams: list[str], unaliased: set[str], unused: set[str],
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str],
) -> None:
    data = write_standings(tmp_path / "data.json", teams=teams)
    monkeypatch.setattr(aliascheck, "OUTPUT_PATH", data)
    monkeypatch.setattr(aliascheck, "PLAYBASKET_TEAM_ALIASES", ALIASES)

    drift = alias_drift(teams=set(teams), aliases=ALIASES)

    assert drift == AliasDrift(unaliased=frozenset(unaliased), unused=frozenset(unused))
    assert bool(drift) is True
    assert aliascheck.main() == 1
    assert capsys.readouterr().out.startswith("::error title=PLAYBASKET_TEAM_ALIASES out of date::")


def test_main_aliases_match_published_standings_exits_zero(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    data = write_standings(tmp_path / "data.json", ["CUS CAGLIARI", "OLIMPIA CAGLIARI"])
    monkeypatch.setattr(aliascheck, "OUTPUT_PATH", data)
    monkeypatch.setattr(aliascheck, "PLAYBASKET_TEAM_ALIASES", ALIASES)

    assert aliascheck.main() == 0
    assert "::error" not in capsys.readouterr().out


def test_main_drift_prints_github_error_annotation_and_exits_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    data = write_standings(tmp_path / "data.json", ["CUS CAGLIARI", "NEW SPONSOR OLIMPIA"])
    monkeypatch.setattr(aliascheck, "OUTPUT_PATH", data)
    monkeypatch.setattr(aliascheck, "PLAYBASKET_TEAM_ALIASES", ALIASES)

    assert aliascheck.main() == 1
    out = capsys.readouterr().out
    assert out.startswith("::error title=PLAYBASKET_TEAM_ALIASES out of date::")
    assert "'NEW SPONSOR OLIMPIA'" in out and "'OLIMPIA CAGLIARI'" in out
