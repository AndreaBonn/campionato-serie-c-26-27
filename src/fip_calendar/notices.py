from html import unescape
from typing import Any

TOPIC_WORDS = ("formula", "playoff", "playout", "play-off", "play-out")
COMPETITION_WORDS = ("serie c", "c regionale", "campionati regionali")
SITE_PREFIX = "https://sardegna.fip.it/"


def _is_relevant(title: str) -> bool:
    lowered = title.casefold()
    return any(w in lowered for w in TOPIC_WORDS) and any(w in lowered for w in COMPETITION_WORDS)


def select_notices(posts: list[dict[str, Any]], since: str) -> list[dict[str, str]]:
    """Keep FIP Sardegna posts about the Serie C format published after `since`.

    Parameters
    ----------
    posts : list of dict
        Items from the WordPress REST API (`date`, `title.rendered`, `link`).
    since : str
        ISO timestamp; older posts belong to the previous season.

    Returns
    -------
    list of dict
        `date` (YYYY-MM-DD), `title`, `link`, newest first, one per link.
    """
    notices: dict[str, dict[str, str]] = {}
    for item in posts:
        title = unescape(item["title"]["rendered"]).strip()
        # the page renders `link` as an href: accept only FIP Sardegna permalinks
        on_site = item["link"].startswith(SITE_PREFIX)
        if item["date"] >= since and on_site and _is_relevant(title):
            notices[item["link"]] = {
                "date": item["date"][:10],
                "title": title,
                "link": item["link"],
            }
    return sorted(notices.values(), key=lambda n: n["date"], reverse=True)
