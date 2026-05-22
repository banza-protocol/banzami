#!/usr/bin/env python3
# DEPRECATED — sandbox icons are now permanent prebuilt assets in
# apps/mobile/assets/branding/sandbox/. This script is no longer used.
"""Composite an amber 'S' badge onto the production icon → banza_icon_sandbox.png."""
import os
from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(REPO, "apps/mobile/assets/images/banza_icon.png")
DST  = os.path.join(REPO, "apps/mobile/assets/images/banza_icon_sandbox.png")

base = Image.open(SRC).convert("RGBA")
size = base.size[0]

overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
draw    = ImageDraw.Draw(overlay)

dot_r  = int(size * 0.165)
margin = int(size * 0.035)
cx     = size - margin - dot_r
cy     = margin + dot_r

draw.ellipse([cx-dot_r-6, cy-dot_r-6, cx+dot_r+6, cy+dot_r+6], fill=(0, 0, 0, 80))
draw.ellipse([cx-dot_r, cy-dot_r, cx+dot_r, cy+dot_r], fill=(255, 179, 0, 255))
draw.ellipse([cx-dot_r, cy-dot_r, cx+dot_r, cy+dot_r],
             outline=(255, 255, 255, 220), width=int(size * 0.012))

lw  = int(dot_r * 0.22)
pad = int(dot_r * 0.28)
x0, y0 = cx - dot_r + pad, cy - dot_r + pad
x1, y1 = cx + dot_r - pad, cy + dot_r - pad
mid_y   = (y0 + y1) // 2

for seg in [
    (x0, y0, x1, y0 + lw),
    (x0, y0, x0 + lw, mid_y),
    (x0, mid_y - lw//2, x1, mid_y + lw//2),
    (x1 - lw, mid_y, x1, y1),
    (x0, y1 - lw, x1, y1),
]:
    draw.rectangle(seg, fill=(255, 255, 255, 255))

result = Image.alpha_composite(base, overlay).convert("RGB")
result.save(DST, "PNG")
print(f"[make-sandbox-icon] {DST}")
