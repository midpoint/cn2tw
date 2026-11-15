#!/usr/bin/env python3
"""產生 extension/icons/*.png：沿用 favicon.svg 的幾何與配色。

用法：python3 tools/make-extension-icons.py
需要 Pillow。輸出檔會提交進版控，平常不必重跑。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "extension" / "icons"
SIZES = (16, 32, 48, 128)
SS = 4  # 超取樣倍率
MASTER = 512
SIZE = MASTER * SS

JADE = (31, 122, 99, 255)      # #1f7a63
WHITE = (255, 255, 255, 255)
MINT = (143, 211, 189, 255)    # #8fd3bd
GOLD = (243, 201, 75, 255)     # #f3c94b


def circle(size, cx, cy, r, fill):
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill)
    return layer


def make_master():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(bg).rounded_rectangle(
        (0, 0, SIZE - 1, SIZE - 1), radius=round(14 / 64 * SIZE), fill=JADE
    )
    img.alpha_composite(bg)

    def px(v):
        return round(v / 64 * SIZE)

    left_cx, cy, r = px(23), px(32), px(17)
    right_cx = px(41)

    img.alpha_composite(circle(SIZE, left_cx, cy, r, WHITE))
    img.alpha_composite(circle(SIZE, right_cx, cy, r, MINT))

    # 兩圓交集上金色：先畫右圓，再用左圓遮罩
    gold = circle(SIZE, right_cx, cy, r, GOLD)
    gold.putalpha(ImageChops.multiply(gold.getchannel("A"), circle(SIZE, left_cx, cy, r, WHITE).getchannel("A")))
    img.alpha_composite(gold)
    return img.resize((MASTER, MASTER), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    master = make_master()
    for size in SIZES:
        icon = master.resize((size, size), Image.LANCZOS)
        path = OUT / f"icon{size}.png"
        icon.save(path, "PNG", optimize=True)
        print(f"  ✔ {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
