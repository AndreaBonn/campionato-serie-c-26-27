from typing import Any

import pytest

from fip_calendar.ics import build_ics, escape_text, fold_line, round_label

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


def test_fold_line_exactly_75_octets_is_unchanged() -> None:
    line = "X" * 75

    assert fold_line(line) == line


def test_fold_line_76_octets_moves_last_char_to_continuation() -> None:
    assert fold_line("X" * 76) == "X" * 75 + "\r\n X"


@pytest.mark.parametrize(
    ("raw", "escaped"),
    [
        ("a\\b", "a\\\\b"),
        ("a;b", "a\\;b"),
        ("a,b", "a\\,b"),
        ("a\nb", "a\\nb"),
        ("Sant’Elena: ore 18", "Sant’Elena: ore 18"),
    ],
)
def test_escape_text_escapes_rfc5545_special_characters(raw: str, escaped: str) -> None:
    assert escape_text(raw) == escaped


@pytest.mark.parametrize(
    ("code", "label"),
    [("A1", "1ª giornata di andata"), ("R11", "11ª giornata di ritorno")],
)
def test_round_label_names_round_and_half(code: str, label: str) -> None:
    assert round_label(code) == label


def test_build_ics_without_games_is_a_valid_empty_calendar() -> None:
    ics = build_ics(games=[], dtstamp=STAMP, page_url=PAGE_URL)

    assert "BEGIN:VEVENT" not in ics
    assert ics.endswith("END:VTIMEZONE\r\nEND:VCALENDAR\r\n")


def test_build_ics_one_event_per_game_with_distinct_uids() -> None:
    games = [game(), game(n=18, round="A4", date="2026-10-25")]

    lines = unfold(build_ics(games=games, dtstamp=STAMP, page_url=PAGE_URL))

    assert [line for line in lines if line.startswith("UID:")] == [
        "UID:cus-gara17@campionato-serie-c-26-27",
        "UID:cus-gara18@campionato-serie-c-26-27",
    ]


def test_build_ics_every_physical_line_fits_75_octets() -> None:
    long_venue = {"name": "Palazzetto dello Sport", "address": "Via Palladio " * 10}

    ics = build_ics(games=[game(venue=long_venue)], dtstamp=STAMP, page_url=PAGE_URL)

    assert max(len(line.encode("utf-8")) for line in ics.split("\r\n")) <= 75
    assert "Via Palladio Via Palladio" in "".join(unfold(ics))


def test_build_ics_location_without_address_has_no_trailing_separator() -> None:
    bare = game(venue={"name": "PALACUS", "address": ""})

    lines = unfold(build_ics(games=[bare], dtstamp=STAMP, page_url=PAGE_URL))

    assert "LOCATION:PALACUS" in lines


def test_build_ics_description_is_one_escaped_line_with_every_part_in_order() -> None:
    referees = ["ROSSI MARIO di CAGLIARI (CA)", "BIANCHI LUCA di SASSARI (SS)"]
    changed = game(changes=["time"], referees=referees)

    lines = unfold(build_ics(games=[changed], dtstamp=STAMP, page_url=PAGE_URL))

    assert (
        "DESCRIPTION:Serie C regionale\\, 3ª giornata di andata\\, gara n. 17"
        "\\nArbitri: ROSSI MARIO di CAGLIARI (CA)\; BIANCHI LUCA di SASSARI (SS)"
        "\\nModificata dalla FIP rispetto al comunicato ufficiale"
        f"\\nAggiornamenti: {PAGE_URL}"
    ) in lines
