from html import unescape
from typing import Any

TOPIC_WORDS = ("formula", "playoff", "playout", "play-off", "play-out")
COMPETITION_WORDS = ("serie c", "c regionale", "campionati regionali")
SITE_PREFIX = "https://sardegna.fip.it/"

# Where a notice comes from, which also decides how its title is filtered
KIND_FORMULA = "formula"  # keyword search: format, playoff or playout of the Serie C
KIND_LEAGUE = "serie-c"  # "C REGIONALE" category: the category already names the league
KIND_COMUNICATO = "comunicato"  # official comunicati (e.g. Giudice Sportivo): Serie C ones only


def _has_any(title: str, words: tuple[str, ...]) -> bool:
    lowered = title.casefold()
    return any(w in lowered for w in words)


def _is_relevant(title: str, kind: str) -> bool:
    if kind == KIND_LEAGUE:
        return True
    if kind == KIND_COMUNICATO:
        return _has_any(title, COMPETITION_WORDS)
    return _has_any(title, TOPIC_WORDS) and _has_any(title, COMPETITION_WORDS)


def select_notices(
    posts: list[dict[str, Any]], since: str, kind: str = KIND_FORMULA
) -> list[dict[str, str]]:
    """Keep FIP Sardegna items about the Serie C published after `since`.

    Parameters
    ----------
    posts : list of dict
        Items from the WordPress REST API (`date`, `title.rendered`, `link`).
    since : str
        ISO timestamp; older items belong to the previous season.
    kind : str
        Source of the items (`KIND_*`): sets the title filter and is copied to each notice.

    Returns
    -------
    list of dict
        `date` (YYYY-MM-DD), `title`, `link`, `kind`, newest first, one per link.
    """
    notices: dict[str, dict[str, str]] = {}
    for item in posts:
        title = unescape(item["title"]["rendered"]).strip()
        # the page renders `link` as an href: accept only FIP Sardegna permalinks
        on_site = item["link"].startswith(SITE_PREFIX)
        if item["date"] >= since and on_site and _is_relevant(title, kind):
            notices[item["link"]] = {
                "date": item["date"][:10],
                "title": title,
                "link": item["link"],
                "kind": kind,
            }
    return sorted(notices.values(), key=lambda n: n["date"], reverse=True)


def merge_notices(*sources: list[dict[str, str]]) -> list[dict[str, str]]:
    """Join notices of several sources; a link found twice keeps the earlier source's kind."""
    merged: dict[str, dict[str, str]] = {}
    for notices in sources:
        for notice in notices:
            merged.setdefault(notice["link"], notice)
    return sorted(merged.values(), key=lambda n: n["date"], reverse=True)
