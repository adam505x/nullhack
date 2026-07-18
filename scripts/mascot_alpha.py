"""Convert the cleaned mascot JPGs to transparent PNGs.

Flood-fills from the borders across near-white pixels (the background) and sets
them fully transparent; everything else keeps its colour. Writes *.png next to
the source *.jpg files.
"""

from collections import deque
from pathlib import Path

from PIL import Image

ARTEM = Path(__file__).resolve().parent.parent / "public" / "artem"


def is_bg(px) -> bool:
    r, g, b = px[:3]
    return min(r, g, b) > 235 and max(r, g, b) - min(r, g, b) < 12


def convert(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    pix = im.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))
    cleared = 0
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_bg(pix[x, y]):
            continue
        r, g, b, _ = pix[x, y]
        pix[x, y] = (r, g, b, 0)
        cleared += 1
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    out = path.with_suffix(".png")
    im.save(out)
    print(f"{out.name}: {cleared}/{w*h} px transparent ({100*cleared/(w*h):.0f}%)")


if __name__ == "__main__":
    for f in sorted(ARTEM.glob("*.jpg")):
        convert(f)
