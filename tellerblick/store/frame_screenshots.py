"""Frame raw app screenshots (raw_1..4.png, 1200x2340) with captions in the store sizes.

Usage: python frame_screenshots.py <dir-with-raw-pngs>
Output: screenshots/ios-6.9-N.png (1320x2868), ios-6.5-N.png (1242x2688), android-N.png (1080x1920)
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

RAW = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
CAPTIONS = {
    1: ("Kalorien & Eiweiß", "auf einen Blick"),
    2: ("Fortschritt sehen", "Gewichtstrend & Streaks"),
    3: ("Schnell eintragen", "Foto, Suche oder Favoriten"),
    4: ("Dein persönliches Ziel", "in 30 Sekunden berechnet"),
}
FONT_B = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
FONT_R = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
if not os.path.exists(FONT_R):
    FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def frame(shot: Image.Image, title: str, sub: str) -> Image.Image:
    c = Image.new("RGB", (1320, 2868), "#0f9d58")
    d = ImageDraw.Draw(c)
    d.text((660, 250), title, font=ImageFont.truetype(FONT_B, 104), fill="white", anchor="mm")
    d.text((660, 380), sub, font=ImageFont.truetype(FONT_R, 64), fill="#d9f5e6", anchor="mm")
    sw = 1080
    shot = shot.resize((sw, int(shot.height * sw / shot.width)), Image.LANCZOS)
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *shot.size), 70, fill=255)
    c.paste(shot, ((1320 - sw) // 2, 520), mask)
    return c


os.makedirs(OUT, exist_ok=True)
for i, (t, s) in CAPTIONS.items():
    big = frame(Image.open(os.path.join(RAW, f"raw_{i}.png")).convert("RGB"), t, s)
    big.save(f"{OUT}/ios-6.9-{i}.png")
    big.resize((1242, 2698), Image.LANCZOS).crop((0, 0, 1242, 2688)).save(f"{OUT}/ios-6.5-{i}.png")
    big.resize((1080, 2347), Image.LANCZOS).crop((0, 0, 1080, 1920)).save(f"{OUT}/android-{i}.png")
print("ok:", sorted(os.listdir(OUT)))
