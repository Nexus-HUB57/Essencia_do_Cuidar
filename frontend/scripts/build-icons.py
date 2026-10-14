"""
Gera os ícones da PWA a partir do favicon (forma do logo).
- icon-192.png / icon-512.png: ícones padrão
- icon-maskable-512.png: ícone com padding 20% (Android máscara redonda)

Executar uma vez: python3 public/build-icons.py
"""
from PIL import Image, ImageDraw
import os

OUT = os.path.dirname(os.path.abspath(__file__))

BG = (74, 144, 226, 255)     # brand-blue
ACCENT = (80, 227, 194, 255) # brand-green

def draw_icon(size, maskable=False):
    # maskable: 20% safe-zone, então o desenho principal fica em 60% central
    pad_ratio = 0.20 if maskable else 0.0
    canvas = Image.new('RGBA', (size, size), BG)
    draw = ImageDraw.Draw(canvas)

    inner = int(size * (1 - 2 * pad_ratio))
    inset = (size - inner) // 2
    # cabeça (círculo)
    head_r = int(inner * 0.16)
    head_cx = size // 2
    head_cy = inset + head_r + int(inner * 0.05)
    draw.ellipse([head_cx - head_r, head_cy - head_r, head_cx + head_r, head_cy + head_r], fill=ACCENT)
    # corpo (silhueta de pessoa cuidadora)
    body_top = head_cy + int(head_r * 0.85)
    body_bottom = inset + int(inner * 0.92)
    # ombros
    shoulder_w = int(inner * 0.55)
    draw.pieslice(
        [head_cx - shoulder_w, body_top - int(shoulder_w * 0.4),
         head_cx + shoulder_w, body_top + shoulder_w],
        start=180, end=360, fill=ACCENT
    )
    # retângulo do corpo
    draw.rectangle(
        [head_cx - int(shoulder_w * 0.75), body_top + int(shoulder_w * 0.25),
         head_cx + int(shoulder_w * 0.75), body_bottom],
        fill=ACCENT
    )
    # arredondar cantos do canvas
    mask = Image.new('L', (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    corner = int(size * 0.18)
    mdraw.rounded_rectangle([0, 0, size, size], radius=corner, fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(canvas, (0, 0), mask=mask)
    return out

# 192
draw_icon(192, maskable=False).save(os.path.join(OUT, 'icon-192.png'), 'PNG', optimize=True)
# 512
draw_icon(512, maskable=False).save(os.path.join(OUT, 'icon-512.png'), 'PNG', optimize=True)
# maskable 512
draw_icon(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'), 'PNG', optimize=True)
# apple-touch 180
draw_icon(180, maskable=False).save(os.path.join(OUT, 'apple-touch-icon.png'), 'PNG', optimize=True)
# favicon 32 (substitui o svg para compatibilidade)
draw_icon(32, maskable=False).save(os.path.join(OUT, 'favicon-32.png'), 'PNG', optimize=True)

print('ícones gerados em', OUT)
