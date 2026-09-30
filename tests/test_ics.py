from typing import Any

from fip_calendar.ics import build_ics, fold_line

PAGE_URL = "https://example.org/calendario/"
STAMP = "20261001T080000Z"


def game(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "round": "A3",
        "n": 17,
        "home": "Olimpia Cagliari",
        "away": "CUS Cagliari",
        "date": "2026-10-18",
        "time": "19:00",
        "venue": {"name": "Palestra Esperia", "address": "Via Pessagno snc 09126 CAGLIARI (CA)"},
        "changes": [],
        "referees": [],
        "score": None,
    }
    return {**base, **overrides}


def unfold(ics: str) -> list[str]:
    return ics.replace("\r\n ", "").split("\r\n")


def test_build_ics_event_has_stable_uid_and_local_times() -> None:
    lines = unfold(build_ics(games=[game()], dtstamp=STAMP, page_url=PAGE_URL))

    assert "UID:cus-gara17@campionato-serie-c-26-27" in lines
    assert "DTSTART;TZID=Europe/Rome:20261018T190000" in lines
    assert "DTEND;TZID=Europe/Rome:20261018T210000" in lines
    assert f"DTSTAMP:{STAMP}" in lines


def test_build_ics_late_game_end_rolls_over_to_next_day() -> None:
    lines = unfold(build_ics(games=[game(time="22:30")], dtstamp=STAMP, page_url=PAGE_URL))

    assert "DTEND;TZID=Europe/Rome:20261019T003000" in lines


def test_build_ics_declares_rome_timezone_and_refresh_hint() -> None:
    ics = build_ics(games=[game()], dtstamp=STAMP, page_url=PAGE_URL)

    assert "BEGIN:VTIMEZONE\r\nTZID:Europe/Rome" in ics
    assert "REFRESH-INTERVAL;VALUE=DURATION:PT4H" in ics
    assert ics.startswith("BEGIN:VCALENDAR\r\n")
    assert ics.endswith("END:VCALENDAR\r\n")


def test_build_ics_escapes_commas_and_semicolons() -> None:
    lines = unfold(build_ics(games=[game()], dtstamp=STAMP, page_url=PAGE_URL))

    assert "LOCATION:Palestra Esperia\\, Via Pessagno snc 09126 CAGLIARI (CA)" in lines


def test_build_ics_summary_carries_score_when_played() -> None:
    played = game(score={"home": 64, "away": 71})

    lines = unfold(build_ics(games=[played], dtstamp=STAMP, page_url=PAGE_URL))

    assert "SUMMARY:Olimpia Cagliari - CUS Cagliari 64-71" in lines


def test_build_ics_description_lists_referees_and_change() -> None:
    changed = game(changes=["date"], referees=["ROSSI MARIO di CAGLIARI (CA)"])

    ics = "".join(unfold(build_ics(games=[changed], dtstamp=STAMP, page_url=PAGE_URL)))

    assert "3ª giornata di andata\\, gara n. 17" in ics
    assert "Arbitri: ROSSI MARIO di CAGLIARI (CA)" in ics
    assert "Modificata dalla FIP rispetto al comunicato ufficiale" in ics


def test_build_ics_description_omits_referees_when_not_designated() -> None:
    ics = build_ics(games=[game()], dtstamp=STAMP, page_url=PAGE_URL)

    assert "Arbitri" not in ics
    assert "Serie C regionale" in ics


def test_fold_line_splits_long_lines_under_75_octets() -> None:
    folded = fold_line("DESCRIPTION:" + "à" * 60)

    parts = folded.split("\r\n")
    assert len(parts) > 1
    assert all(len(p.encode("utf-8")) <= 75 for p in parts)
    assert all(p.startswith(" ") for p in parts[1:])
    assert "".join(p.removeprefix(" ") for p in parts) == "DESCRIPTION:" + "à" * 60


def test_fold_line_short_line_is_unchanged() -> None:
    assert fold_line("SUMMARY:breve") == "SUMMARY:breve"
