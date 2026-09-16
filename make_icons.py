# -*- coding: utf-8 -*-
"""Generate favicon.ico and PNG icons from the overlapping-card mark."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
NAVY = (11, 16, 32, 255)
PINK = (255, 92, 138, 255)
CYAN = (110, 168, 255, 255)


def draw_mark(size, *, pad=0.06, round_bg=True, full_bleed=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0) if round_bg else NAVY)
    d = ImageDraw.Draw(img)
    if full_bleed:
        d.rectangle([0, 0, size - 1, size - 1], fill=NAVY)
    else:
        bg_r = max(1, int(size * (0.22 if round_bg else 0)))
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=bg_r, fill=NAVY)

    inner = size * (1 - 2 * pad)
    origin = size * pad
    card = inner * 0.58
    radius = max(1, int(card * 0.28))
    # magenta: lower-left; cyan: upper-right (same overlap as the site logo)
    pink_xy = [
        origin + inner * 0.02,
        origin + inner * 0.28,
        origin + inner * 0.02 + card,
        origin + inner * 0.28 + card,
    ]
    cyan_xy = [
        origin + inner * 0.40,
        origin + inner * 0.08,
        origin + inner * 0.40 + card,
        origin + inner * 0.08 + card,
    ]
    d.rounded_rectangle(pink_xy, radius=radius, fill=PINK)
    d.rounded_rectangle(cyan_xy, radius=radius, fill=CYAN)
    return img


def save_png(path, size, **kwargs):
    scale = 4
    hi = draw_mark(size * scale, **kwargs)
    out = hi.resize((size, size), Image.Resampling.LANCZOS)
    out.save(path, "PNG", optimize=True)
    return out


def main():
    pngs = {
        16: ROOT / "favicon-16.png",
        32: ROOT / "favicon-32.png",
        48: ROOT / "favicon-48.png",
        180: ROOT / "apple-touch-icon.png",
        192: ROOT / "icon-192.png",
        512: ROOT / "icon-512.png",
    }
    images = {}
    for size, path in pngs.items():
        full = size >= 180
        images[size] = save_png(path, size, round_bg=not full, full_bleed=full, pad=0.08 if size >= 48 else 0.05)

    save_png(ROOT / "icon-512-maskable.png", 512, round_bg=False, full_bleed=True, pad=0.22)

    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    images[48].save(ROOT / "favicon.ico", format="ICO", sizes=ico_sizes)
    print("wrote", ", ".join(p.name for p in sorted(ROOT.glob("favicon*")) + [ROOT / "apple-touch-icon.png", ROOT / "icon-192.png", ROOT / "icon-512.png", ROOT / "icon-512-maskable.png"]))


if __name__ == "__main__":
    main()
