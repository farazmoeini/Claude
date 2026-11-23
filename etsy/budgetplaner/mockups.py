import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
d=sys.argv[1]
P=lambda n: Image.open(f"{d}/p-{n:02d}.png").convert("RGB")
SB="/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"; S="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; SBo="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BG=(230,238,231); T=(47,58,51); G=(125,155,132)
def card(im,h):
    w=int(im.width*h/im.height); im=im.resize((w,h),Image.LANCZOS)
    sh=Image.new("RGBA",(w+60,h+60),(0,0,0,0)); dr=ImageDraw.Draw(sh)
    dr.rectangle([30,36,w+30,h+36],fill=(0,0,0,70)); sh=sh.filter(ImageFilter.GaussianBlur(14))
    sh.paste(im,(30,30)); return sh
def mock(name, title, sub, pages, bullets=None):
    W,H=2700,2025
    img=Image.new("RGB",(W,H),BG); dr=ImageDraw.Draw(img)
    dr.text((140,150),title,font=ImageFont.truetype(SB,120),fill=T)
    dr.text((145,310),sub,font=ImageFont.truetype(S,56),fill=G)
    if bullets:
        y=520
        for b in bullets:
            dr.ellipse([150,y+18,180,y+48],fill=G)
            dr.text((210,y),b,font=ImageFont.truetype(SBo,54),fill=T); y+=105
    n=len(pages); h=1400 if bullets else (1350 if n<=3 else 1150)
    xs = 1180 if bullets else 160
    span = W-xs-100
    cards=[card(P(p),h) for p in pages]
    step = 0 if n==1 else (span-cards[0].width)/(n-1)
    for i in reversed(range(n)):
        img.paste(cards[i],(int(xs+i*step), H-h-150+(i%2)*40), cards[i])
    img.save(f"bilder/{name}.jpg",quality=90)
mock("01_titelbild","Budgetplaner","Undatiert · A4 · Sofort-Download · 35 Seiten",[1,5,6],
     ["12 Monatsbudgets","12 Ausgaben-Tracker","Sparziel-Tracker","Schuldenabbau","No-Spend-Challenge","Druckbar & für GoodNotes"])
mock("02_monatsbudget","Jeden Monat im Griff","Einnahmen · Fixkosten · variable Kosten · Sparen",[5,6,4])
mock("03_sparen","Sparziele sichtbar machen","Ausmalbarer Sparziel-Tracker & Challenges",[30,33,32])
mock("04_uebersicht","Alles in einem Planer","Ziele · Jahresübersicht · Rechnungen · Notizen",[2,3,4,29,31])
