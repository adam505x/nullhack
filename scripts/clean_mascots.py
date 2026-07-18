"""Replace the baked-in transparency checkerboard behind the mascot with white.

Flood-fills from the image borders across "checker-like" pixels (light, near-grey)
and paints them white. The character art has darker outlines, so the fill stops
at the figure. Enclosed pockets stay untouched, which is acceptable.
"""

from collections import deque
from pathlib import Path

from PIL import Image

ARTEM = Path(__file__).resolve().parent.parent / "public" / "artem"


def is_checker(px) -> bool:
    r, g, b = px[:3]
    return min(r, g, b) > 185 and max(r, g, b) - min(r, g, b) < 14


def clean(path: Path) -> None:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    pix = im.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    filled = 0
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_checker(pix[x, y]):
            continue
        pix[x, y] = (255, 255, 255)
        filled += 1
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    im.save(path, quality=92)
    print(f"{path.name}: repainted {filled}/{w*h} px ({100*filled/(w*h):.0f}%)")


if __name__ == "__main__":
    for f in sorted(ARTEM.glob("*.jpg")):
        clean(f)
