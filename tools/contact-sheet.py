"""Labelled contact sheet of the journey shots: one row per device and seed.

Usage: python3 tools/contact-sheet.py <shots directory>  (needs Pillow)
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

COLUMNS = ["follow-1", "follow-2", "follow-3", "follow-4", "travel", "underwater", "surface"]
DEVICES = ["desktop", "mobile"]
SEEDS = [42, 7, 1234]
CELL_HEIGHT = 240
LABEL = 22
GAP = 6


def main() -> None:
    directory = Path(sys.argv[1])
    rows = [(device, seed) for device in DEVICES for seed in SEEDS]
    widths = {device: 0 for device in DEVICES}
    for device in DEVICES:
        sample = next(directory.glob(f"{device}-seed*-follow-1.png"), None)
        if sample:
            with Image.open(sample) as image:
                widths[device] = round(image.width * CELL_HEIGHT / image.height)
    cell_width = max(widths.values()) or CELL_HEIGHT
    sheet = Image.new("RGB", (GAP + len(COLUMNS) * (cell_width + GAP), GAP + len(rows) * (CELL_HEIGHT + LABEL + GAP)), (18, 22, 28))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for r, (device, seed) in enumerate(rows):
        for c, column in enumerate(COLUMNS):
            x = GAP + c * (cell_width + GAP)
            y = GAP + r * (CELL_HEIGHT + LABEL + GAP)
            draw.text((x + 2, y + 4), f"{device} seed {seed} {column}", fill=(220, 226, 232), font=font)
            path = directory / f"{device}-seed{seed}-{column}.png"
            if not path.exists():
                draw.rectangle((x, y + LABEL, x + cell_width, y + LABEL + CELL_HEIGHT), outline=(160, 60, 60))
                continue
            with Image.open(path) as image:
                thumb = image.convert("RGB").resize((round(image.width * CELL_HEIGHT / image.height), CELL_HEIGHT), Image.LANCZOS)
            sheet.paste(thumb, (x + (cell_width - thumb.width) // 2, y + LABEL))
    sheet.save(directory / "contact-sheet.png")


if __name__ == "__main__":
    main()
