"""Generate extension icons (16/48/128) and the FAB image from the genie's head."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "artem" / "idle.webp"
OUT = ROOT / "extension" / "icons"

# square crop around the head + turban of the idle pose (853x1280 source)
HEAD_BOX = (170, 30, 610, 470)

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    head = Image.open(SRC).convert("RGBA").crop(HEAD_BOX)
    for size, name in [(16, "icon16.png"), (48, "icon48.png"), (128, "icon128.png"), (256, "fab.png")]:
        head.resize((size, size), Image.LANCZOS).save(OUT / name)
        print(f"{name}: {size}x{size}")
