# The colours carousel: five pictures of 1080 x 1350 for TikTok and Instagram.
# The first shows the four looks together, the others one each. No words on
# them, like a product shot.   python build.py
from PIL import Image, ImageDraw, ImageFilter

W, H = 1080, 1350
GROUND = (232, 232, 234)
PICKS = ["pink-black", "amoled-pink", "sage-graphite", "paper"]


def phone(name, width):
    """The screen in a dark body with round corners, on a see-through ground."""
    screen = Image.open(f"screens/{name}.png").convert("RGB")
    rim = round(width * 0.022)
    sw = width - 2 * rim
    sh = round(sw * screen.height / screen.width)
    screen = screen.resize((sw, sh), Image.LANCZOS)
    k = 4  # drawn large and brought down, for smooth corners
    body = Image.new("RGBA", (width * k, (sh + 2 * rim) * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.rounded_rectangle([0, 0, body.width - 1, body.height - 1], radius=round(width * 0.105) * k, fill=(17, 17, 20, 255))
    body = body.resize((width, sh + 2 * rim), Image.LANCZOS)
    mask = Image.new("L", (sw * k, sh * k), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw * k - 1, sh * k - 1], radius=round(width * 0.085) * k, fill=255)
    body.paste(screen, (rim, rim), mask.resize((sw, sh), Image.LANCZOS))
    return body


def place(canvas, img, cx, cy, angle=0):
    if angle:
        img = img.rotate(angle, resample=Image.BICUBIC, expand=True)
    x, y = round(cx - img.width / 2), round(cy - img.height / 2)
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 70), (x + 10, y + 26), img.split()[3])
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(26)))
    canvas.alpha_composite(img, (x, y))


def slide():
    return Image.new("RGBA", (W, H), GROUND + (255,))


# 1: the four together, two by two.
s = slide()
spots = [(370, 372), (710, 372), (370, 978), (710, 978)]
for name, (cx, cy) in zip(PICKS, spots):
    place(s, phone(name, 280), cx, cy)
s.convert("RGB").save("mptree-colours-1.png")

# 2 to 5: one each.
for i, name in enumerate(PICKS):
    s = slide()
    place(s, phone(name, 520), W / 2, H / 2)
    s.convert("RGB").save(f"mptree-colours-{i + 2}.png")

# 6 and 7: two more. Every ground and every card colour is there once; pairs
# that only differed by black against graphite were taken out.
MORE = ["stone-black", "graphite-sage"]
for i, name in enumerate(MORE):
    s = slide()
    place(s, phone(name, 520), W / 2, H / 2)
    s.convert("RGB").save(f"mptree-colours-{i + 6}.png")

# All six on one picture.
s = slide()
for i, name in enumerate(PICKS + MORE):
    place(s, phone(name, 270), 210 + (i % 3) * 330, 375 + (i // 3) * 600)
s.convert("RGB").save("mptree-colours-all.png")

print("done")
