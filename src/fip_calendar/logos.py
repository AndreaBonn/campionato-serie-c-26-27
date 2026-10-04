import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

from fip_calendar.config import LOGO_MAX_SIDE_PX, LOGO_SOURCE_PREFIX
from fip_calendar.parse import FipMatch

logger = logging.getLogger("fip_calendar")

ACCEPTED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})
WHITE = (255, 255, 255)
# pixels closer than this to pure white count as the scanned page around the crest
BACKGROUND_TOLERANCE = 24
# the page reads crests at logos/<file>, relative to docs/
PUBLIC_PREFIX = "logos/"
LOGO_SUFFIX = ".png"

Logos = dict[str, dict[str, str]]


class LogoError(ValueError):
    """A crest cannot be turned into a usable image."""


@dataclass(frozen=True)
class LogoStore:
    """Where crest copies are written and how their sources are downloaded."""

    directory: Path
    download: Callable[[str], bytes]

    def has(self, name: str) -> bool:
        return (self.directory / name).exists()

    def write(self, name: str, data: bytes) -> None:
        """Replace a crest atomically: a job killed mid-write must not commit half a PNG."""
        tmp = self.directory / (name + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(self.directory / name)


def team_slug(team: str) -> str:
    """File name stem for a FIP team name: 'C.M.B. PORTO TORRES' -> 'c-m-b-porto-torres'."""
    slug = re.sub(r"[^a-z0-9]+", "-", team.casefold()).strip("-")
    if not slug:
        raise LogoError(f"team name gives an empty file name: {team!r}")
    return slug


def logo_sources(rounds: dict[str, list[FipMatch]]) -> dict[str, str]:
    """Crest URL of every team that has one, keeping only FIP backend addresses."""
    sources: dict[str, str] = {}
    for games in rounds.values():
        for m in games:
            for team, url in ((m.home, m.home_logo), (m.away, m.away_logo)):
                if url.startswith(LOGO_SOURCE_PREFIX):
                    sources[team] = url
    return sources


def shrink_logo(data: bytes) -> bytes:
    """Cut the crest out of its white page and fit it in LOGO_MAX_SIDE_PX, as PNG.

    Raises
    ------
    LogoError
        Unsupported format or a page with nothing on it.
    OSError
        The bytes are not an image Pillow can read.
    """
    with Image.open(BytesIO(data)) as image:
        if image.format not in ACCEPTED_FORMATS:
            raise LogoError(f"unsupported crest format {image.format}")
        upright = ImageOps.exif_transpose(image.convert("RGBA"))
    page = Image.new("RGB", upright.size, WHITE)
    page.paste(upright, mask=upright.getchannel("A"))
    diff = ImageChops.difference(page, Image.new("RGB", page.size, WHITE)).convert("L")
    box = diff.point(lambda value: 255 if value > BACKGROUND_TOLERANCE else 0).getbbox()
    if box is None:
        raise LogoError("blank crest: nothing on the white page")
    crest = page.crop(box)
    crest.thumbnail((LOGO_MAX_SIDE_PX, LOGO_MAX_SIDE_PX), Image.Resampling.LANCZOS)
    out = BytesIO()
    crest.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _refresh(
    team: str, url: str, previous: dict[str, str] | None, store: LogoStore
) -> dict[str, str] | None:
    """Entry for one team: reuse the copy on disk, else download it; None if unavailable."""
    name = team_slug(team) + LOGO_SUFFIX
    entry = {"file": PUBLIC_PREFIX + name, "source": url}
    if previous == entry and store.has(name):
        return entry
    try:
        store.write(name=name, data=shrink_logo(store.download(url)))
    except (OSError, ValueError, Image.DecompressionBombError) as err:
        # OSError covers network errors and unreadable images: a crest is never worth a failed sync
        logger.warning("crest of %s not updated from %s: %s", team, url, err)
        on_disk = previous is not None and store.has(Path(previous["file"]).name)
        return previous if on_disk else None
    logger.info("crest of %s copied from %s", team, url)
    return entry


def sync_logos(
    sources: dict[str, str], previous: Logos, directory: Path, download: Callable[[str], bytes]
) -> Logos:
    """Keep a copy of every team crest in `directory`, downloading only new or changed ones.

    Parameters
    ----------
    sources : dict
        Crest URL per FIP team name (`logo_sources`).
    previous : dict
        Entries published last time, `{team: {"file", "source"}}`.
    directory : Path
        Where the PNG copies live (docs/logos).
    download : callable
        Returns the bytes at a URL.

    Returns
    -------
    dict
        Entries for the teams that have a crest on disk, including teams missing from
        `sources` whose previous copy is still there; files no entry uses are deleted.
    """
    directory.mkdir(parents=True, exist_ok=True)
    store = LogoStore(directory=directory, download=download)
    logos: Logos = {}
    for team, url in sorted(sources.items()):
        entry = _refresh(team=team, url=url, previous=previous.get(team), store=store)
        if entry is not None:
            logos[team] = entry
    # a team fip.it stops showing a crest for keeps its copy: a markup change on fip.it
    # would otherwise empty `sources` and delete every crest
    for team, entry in previous.items():
        if team not in sources and store.has(Path(entry["file"]).name):
            logos[team] = entry
    used = {Path(e["file"]).name for e in logos.values()}
    for path in directory.glob("*" + LOGO_SUFFIX):
        if path.name not in used:
            path.unlink()
    return logos
