#!/usr/bin/env python3
"""endcard.py — gera um end-card (PNG) com CTA legível, na paleta da marca.

Por quê: IA de vídeo embola texto na tela. O end-card de CTA tem que ser feito por fora.
ffmpeg sem libfreetype não tem drawtext — por isso renderizamos com Pillow (PIL).

Uso:
  endcard.py --out card.png \
    --cta "CLIQUE AQUI|E SAIBA MAIS" \
    --brand "ACME CLIMA" \
    --sub "Auditoria de PMOC gratuita" \
    --slogan "Quem assina é engenheiro." \
    [--logo /caminho/logo.png] [--bg 0A0A0A --fg FAF8F3 --accent C81D25] [--w 720 --h 1280]

--cta aceita múltiplas linhas separadas por "|". Cores em hex sem '#'.
"""
import argparse
from PIL import Image, ImageDraw, ImageFont

def hexrgb(s): s=s.lstrip("#"); return tuple(int(s[i:i+2],16) for i in (0,2,4))

def font(sz, bold=True):
    base="/System/Library/Fonts/Supplemental/Arial"
    for p in (f"{base}{' Bold' if bold else ''}.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try: return ImageFont.truetype(p, sz)
        except Exception: continue
    return ImageFont.load_default()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--cta", default="CLIQUE AQUI|E SAIBA MAIS")
    ap.add_argument("--brand", default="")
    ap.add_argument("--sub", default="")
    ap.add_argument("--slogan", default="")
    ap.add_argument("--logo", default="")
    ap.add_argument("--bg", default="0A0A0A"); ap.add_argument("--fg", default="FAF8F3")
    ap.add_argument("--accent", default="C81D25")
    ap.add_argument("--w", type=int, default=720); ap.add_argument("--h", type=int, default=1280)
    a=ap.parse_args()
    W,H=a.w,a.h; BG=hexrgb(a.bg); FG=hexrgb(a.fg); RED=hexrgb(a.accent); MUTE=(168,163,151)
    img=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(img)
    def center(y,txt,f,fill):
        w=d.textlength(txt,font=f); d.text(((W-w)/2,y),txt,font=f,fill=fill)
    y=H*0.13
    if a.logo:
        try:
            lg=Image.open(a.logo).convert("RGBA"); lg.thumbnail((int(W*0.30),int(W*0.30)))
            img.paste(lg,((W-lg.width)//2,int(y)),lg); y+=lg.height+40
        except Exception as e: print("logo skip:",e)
    d.rectangle([(W/2-40,y),(W/2+40,y+8)],fill=RED); y+=70           # accent bar
    for line in a.cta.split("|"):
        center(y,line.strip(),font(int(W*0.108)),FG); y+=int(W*0.12)
    y+=30
    if a.brand or a.sub:
        d.rectangle([(W/2-120,y),(W/2+120,y+4)],fill=(90,90,84)); y+=46
    if a.brand: center(y,a.brand,font(int(W*0.061)),FG); y+=int(W*0.095)
    if a.sub:   center(y,a.sub,font(int(W*0.047),bold=False),MUTE); y+=int(W*0.09)
    if a.slogan: center(H*0.81,a.slogan,font(int(W*0.042),bold=False),RED)
    img.save(a.out); print("✅",a.out,f"({W}x{H})")

if __name__=="__main__": main()
