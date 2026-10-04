from io import BytesIO
from pathlib import Path
from urllib.error import URLError

import pytest
from PIL import Image

from fip_calendar.config import LOGO_MAX_SIDE_PX
from fip_calendar.logos import LogoError, logo_sources, shrink_logo, sync_logos, team_slug
from fip_calendar.parse import FipMatch

CUS_URL = "https://backend.fip.it/blobs/cus.jpg"
DINAMO_URL = "https://backend.fip.it/blobs/dinamo.jpg"


def match(home: str, away: str, home_logo: str = "", away_logo: str = "") -> FipMatch:
    return FipMatch(
        number=1,
        home=home,
        away=away,
        date="2026-10-03",
        time="18:00",
        venue="",
        status="",
        status_text="",
        referees=(),
        score=None,
        home_logo=home_logo,
        away_logo=away_logo,
    )


def image_bytes(size: tuple[int, int], box: tuple[int, int, int, int], fmt: str = "JPEG") -> bytes:
    """A white page with one blue rectangle, like the A4 scans FIP stores as crests."""
    image = Image.new("RGB", size, (255, 255, 255))
    image.paste((28, 63, 122), box)
    out = BytesIO()
    image.save(out, format=fmt)
    return out.getvalue()


def test_team_slug_turns_fip_name_into_file_name() -> None:
    assert team_slug("C.M.B. PORTO TORRES") == "c-m-b-porto-torres"
    assert team_slug("BASKET S. ORSOLA") == "basket-s-orsola"


def test_team_slug_name_without_letters_raises() -> None:
    with pytest.raises(LogoError):
        team_slug(" ... ")


def test_logo_sources_maps_each_team_to_its_crest() -> None:
    rounds = {
        "A1": [match("CUS CAGLIARI", "POL. DINAMO", home_logo=CUS_URL, away_logo=DINAMO_URL)],
        "A2": [match("PALL. NUORO", "CUS CAGLIARI", away_logo=CUS_URL)],
    }

    assert logo_sources(rounds) == {"CUS CAGLIARI": CUS_URL, "POL. DINAMO": DINAMO_URL}


def test_logo_sources_ignores_crests_outside_fip_backend() -> None:
    rounds = {"A1": [match("CUS CAGLIARI", "POL. DINAMO", home_logo="https://evil.example/x.png")]}

    assert logo_sources(rounds) == {}


def test_shrink_logo_crops_white_margin_and_fits_longest_side() -> None:
    scan = image_bytes(size=(1240, 1754), box=(420, 610, 820, 1140))

    logo = Image.open(BytesIO(shrink_logo(scan)))

    assert logo.format == "PNG"
    assert max(logo.size) == LOGO_MAX_SIDE_PX
    # the 400x530 crest keeps its proportions once the page margin is gone
    assert logo.size == (round(LOGO_MAX_SIDE_PX * 400 / 530), LOGO_MAX_SIDE_PX)


def test_shrink_logo_small_crest_is_not_enlarged() -> None:
    scan = image_bytes(size=(200, 200), box=(50, 50, 110, 90), fmt="PNG")

    logo = Image.open(BytesIO(shrink_logo(scan)))

    assert logo.size == (60, 40)


def test_shrink_logo_blank_page_raises() -> None:
    with pytest.raises(LogoError, match="blank"):
        shrink_logo(image_bytes(size=(100, 100), box=(0, 0, 0, 0)))


def test_shrink_logo_unsupported_format_raises() -> None:
    with pytest.raises(LogoError, match="GIF"):
        shrink_logo(image_bytes(size=(50, 50), box=(10, 10, 20, 20), fmt="GIF"))


def test_shrink_logo_not_an_image_raises() -> None:
    with pytest.raises(OSError):
        shrink_logo(b"<html>not found</html>")


def crest() -> bytes:
    return image_bytes(size=(300, 300), box=(100, 100, 200, 220))


def test_sync_logos_downloads_new_crest_and_records_its_source(tmp_path: Path) -> None:
    downloads: list[str] = []

    def download(url: str) -> bytes:
        downloads.append(url)
        return crest()

    logos = sync_logos(
        sources={"CUS CAGLIARI": CUS_URL}, previous={}, directory=tmp_path, download=download
    )

    assert logos == {"CUS CAGLIARI": {"file": "logos/cus-cagliari.png", "source": CUS_URL}}
    assert downloads == [CUS_URL]
    assert Image.open(tmp_path / "cus-cagliari.png").format == "PNG"


def test_sync_logos_same_source_and_file_on_disk_is_not_downloaded_again(tmp_path: Path) -> None:
    (tmp_path / "cus-cagliari.png").write_bytes(shrink_logo(crest()))
    previous = {"CUS CAGLIARI": {"file": "logos/cus-cagliari.png", "source": CUS_URL}}

    def no_network(url: str) -> bytes:
        raise AssertionError(f"unexpected download of {url}")

    logos = sync_logos(
        sources={"CUS CAGLIARI": CUS_URL},
        previous=previous,
        directory=tmp_path,
        download=no_network,
    )

    assert logos == previous


def test_sync_logos_changed_source_downloads_the_new_crest(tmp_path: Path) -> None:
    (tmp_path / "cus-cagliari.png").write_bytes(b"old")
    previous = {"CUS CAGLIARI": {"file": "logos/cus-cagliari.png", "source": DINAMO_URL}}

    logos = sync_logos(
        sources={"CUS CAGLIARI": CUS_URL},
        previous=previous,
        directory=tmp_path,
        download=lambda url: crest(),
    )

    assert logos["CUS CAGLIARI"]["source"] == CUS_URL
    assert (tmp_path / "cus-cagliari.png").read_bytes() != b"old"


def test_sync_logos_failed_download_keeps_previous_crest(tmp_path: Path) -> None:
    (tmp_path / "cus-cagliari.png").write_bytes(b"old")
    previous = {"CUS CAGLIARI": {"file": "logos/cus-cagliari.png", "source": DINAMO_URL}}

    def offline(url: str) -> bytes:
        raise URLError("offline")

    logos = sync_logos(
        sources={"CUS CAGLIARI": CUS_URL}, previous=previous, directory=tmp_path, download=offline
    )

    assert logos == previous
    assert (tmp_path / "cus-cagliari.png").read_bytes() == b"old"


def test_sync_logos_failed_first_download_leaves_team_without_crest(tmp_path: Path) -> None:
    logos = sync_logos(
        sources={"CUS CAGLIARI": CUS_URL},
        previous={},
        directory=tmp_path,
        download=lambda url: b"<html>error page</html>",
    )

    assert logos == {}
    assert list(tmp_path.iterdir()) == []


def test_sync_logos_removes_crests_no_team_uses_any_more(tmp_path: Path) -> None:
    (tmp_path / "old-sponsor-name.png").write_bytes(b"old")

    logos = sync_logos(
        sources={"CUS CAGLIARI": CUS_URL},
        previous={},
        directory=tmp_path,
        download=lambda u: crest(),
    )

    assert sorted(p.name for p in tmp_path.iterdir()) == ["cus-cagliari.png"]
    assert list(logos) == ["CUS CAGLIARI"]


def test_sync_logos_team_missing_from_sources_keeps_its_crest(tmp_path: Path) -> None:
    # fip.it changing only the crest markup must not wipe docs/logos
    (tmp_path / "cus-cagliari.png").write_bytes(b"png")
    previous = {"CUS CAGLIARI": {"file": "logos/cus-cagliari.png", "source": CUS_URL}}

    logos = sync_logos(sources={}, previous=previous, directory=tmp_path, download=lambda u: b"")

    assert logos == previous
    assert (tmp_path / "cus-cagliari.png").read_bytes() == b"png"


def test_sync_logos_missing_team_whose_file_is_gone_is_dropped(tmp_path: Path) -> None:
    previous = {"CUS CAGLIARI": {"file": "logos/cus-cagliari.png", "source": CUS_URL}}

    logos = sync_logos(sources={}, previous=previous, directory=tmp_path, download=lambda u: b"")

    assert logos == {}


def test_sync_logos_leaves_no_temporary_file_behind(tmp_path: Path) -> None:
    sync_logos(
        sources={"CUS CAGLIARI": CUS_URL},
        previous={},
        directory=tmp_path,
        download=lambda u: crest(),
    )

    assert sorted(p.name for p in tmp_path.iterdir()) == ["cus-cagliari.png"]


def test_sync_logos_same_source_but_file_gone_is_downloaded_again(tmp_path: Path) -> None:
    previous = {"CUS CAGLIARI": {"file": "logos/cus-cagliari.png", "source": CUS_URL}}
    downloads: list[str] = []

    def download(url: str) -> bytes:
        downloads.append(url)
        return crest()

    logos = sync_logos(
        sources={"CUS CAGLIARI": CUS_URL}, previous=previous, directory=tmp_path, download=download
    )

    assert (downloads, logos) == ([CUS_URL], previous)
    assert Image.open(tmp_path / "cus-cagliari.png").format == "PNG"


def test_sync_logos_failed_download_with_previous_file_gone_drops_the_team(tmp_path: Path) -> None:
    previous = {"CUS CAGLIARI": {"file": "logos/cus-cagliari.png", "source": DINAMO_URL}}

    def offline(url: str) -> bytes:
        raise URLError("offline")

    logos = sync_logos(
        sources={"CUS CAGLIARI": CUS_URL}, previous=previous, directory=tmp_path, download=offline
    )

    assert logos == {}


def test_sync_logos_decompression_bomb_leaves_team_without_crest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Pillow refuses images over twice MAX_IMAGE_PIXELS with an error that is not an OSError
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1_000)

    logos = sync_logos(
        sources={"CUS CAGLIARI": CUS_URL},
        previous={},
        directory=tmp_path,
        download=lambda u: crest(),
    )

    assert logos == {}


def test_shrink_logo_applies_exif_orientation_before_cropping() -> None:
    # a wide crest stored sideways: EXIF orientation 6 means "rotate 90 degrees to display"
    image = Image.new("RGB", (300, 100), (255, 255, 255))
    image.paste((28, 63, 122), (50, 20, 250, 80))
    exif = Image.Exif()
    exif[0x0112] = 6
    out = BytesIO()
    image.save(out, format="JPEG", exif=exif)

    with Image.open(BytesIO(shrink_logo(out.getvalue()))) as shrunk:
        assert shrunk.height > shrunk.width


def test_shrink_logo_transparent_background_counts_as_white_page() -> None:
    # transparent pixels often hold black RGB: without the alpha mask they would be the crest
    image = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
    image.paste((28, 63, 122, 255), (100, 100, 200, 220))
    out = BytesIO()
    image.save(out, format="PNG")

    with Image.open(BytesIO(shrink_logo(out.getvalue()))) as shrunk:
        assert shrunk.size == (100, 120)
