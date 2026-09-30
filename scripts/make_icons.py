#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["pillow>=11"]
# ///
"""Generate the web app icons in docs/icons from the CUS crest in docs/logo-cus.png.

Run from the repository root: uv run --script scripts/make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageChops

DOCS = Path(__file__).resolve().parents[1] / "docs"
SOURCE = DOCS / "logo-cus.png"
ICONS = DOCS / "icons"
WHITE = (255, 255, 255)
# pixels closer than this to pure white count as the crest's background
BACKGROUND_TOLERANCE = 24
# share of the icon height the crest fills on plain icons
PLAIN_FILL = 0.84
# maskable icons: launchers may crop to a circle of radius 40%, keep the crest's corners inside
MASKABLE_DIAGONAL = 0.76
FAVICON_SIZES = [(16, 16), (32, 32), (48, 48)]


def crop_crest(image: Image.Image) -> Image.Image:
    """Cut the crest out of its white margin."""
    rgb = image.convert("RGB")
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, WHITE)).convert("L")
    mask = diff.point(lambda value: 255 if value > BACKGROUND_TOLERANCE else 0)
    box = mask.getbbox()
    if box is None:
        raise ValueError(f"{SOURCE} has no content on its white background")
    return rgb.crop(box)


def place(crest: Image.Image, size: int, scale: float) -> Image.Image:
    """Center the crest, resized by `scale`, on an opaque white square of `size` px."""
    width, height = round(crest.width * scale), round(crest.height * scale)
    canvas = Image.new("RGB", (size, size), WHITE)
    resized = crest.resize((width, height), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - width) // 2, (size - height) // 2))
    return canvas


def plain_icon(crest: Image.Image, size: int) -> Image.Image:
    return place(crest=crest, size=size, scale=size * PLAIN_FILL / crest.height)


def maskable_icon(crest: Image.Image, size: int) -> Image.Image:
    diagonal = (crest.width**2 + crest.height**2) ** 0.5
    return place(crest=crest, size=size, scale=size * MASKABLE_DIAGONAL / diagonal)


def main() -> None:
    crest = crop_crest(Image.open(SOURCE))
    ICONS.mkdir(exist_ok=True)
    plain_icon(crest=crest, size=192).save(ICONS / "icon-192.png", optimize=True)
    plain_icon(crest=crest, size=512).save(ICONS / "icon-512.png", optimize=True)
    maskable_icon(crest=crest, size=512).save(ICONS / "icon-maskable-512.png", optimize=True)
    # iOS ignores the manifest icons and fills transparency with black: this one is opaque
    plain_icon(crest=crest, size=180).save(ICONS / "apple-touch-icon.png", optimize=True)
    plain_icon(crest=crest, size=48).save(DOCS / "favicon.ico", sizes=FAVICON_SIZES)


if __name__ == "__main__":
    main()
