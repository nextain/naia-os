#!/usr/bin/env python3
"""PNG → Clean → SVG pipeline for Naia character vectorization."""

import sys
from pathlib import Path
from PIL import Image, ImageFilter
import vtracer

def clean_and_trace(input_path: str, color_count: int = 12):
    src = Path(input_path)
    stem = src.stem
    out_dir = src.parent

    img = Image.open(src).convert("RGBA")

    # 1. Remove noisy alpha (threshold semi-transparent pixels)
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 30:
                pixels[x, y] = (0, 0, 0, 0)
            elif a < 200:
                pixels[x, y] = (r, g, b, 255)

    # 2. Slight blur to smooth AI noise, then sharpen edges
    rgb = img.convert("RGB")
    rgb = rgb.filter(ImageFilter.MedianFilter(size=3))
    rgb = rgb.filter(ImageFilter.SMOOTH)

    # 3. Color quantization — reduce to N colors for clean vector regions
    quantized = rgb.quantize(colors=color_count, method=Image.Quantize.MEDIANCUT)
    rgb_clean = quantized.convert("RGB")

    # 4. Re-apply original alpha mask
    alpha = img.split()[3]
    clean = Image.merge("RGBA", (*rgb_clean.split()[:3], alpha))

    # Save cleaned PNG
    clean_path = out_dir / f"{stem}-clean.png"
    clean.save(clean_path)
    print(f"Cleaned PNG: {clean_path}")

    # 5. Trace to SVG with vtracer
    svg_path = out_dir / f"{stem}-traced.svg"
    vtracer.convert_image_to_svg_py(
        str(clean_path),
        str(svg_path),
        colormode="color",
        hierarchical="stacked",
        mode="spline",
        filter_speckle=4,
        color_precision=6,
        layer_difference=16,
        corner_threshold=60,
        length_threshold=4.0,
        max_iterations=10,
        splice_threshold=45,
        path_precision=3,
    )
    print(f"Traced SVG:  {svg_path}")

    # Also try with more aggressive simplification
    svg_simple_path = out_dir / f"{stem}-traced-simple.svg"
    vtracer.convert_image_to_svg_py(
        str(clean_path),
        str(svg_simple_path),
        colormode="color",
        hierarchical="stacked",
        mode="spline",
        filter_speckle=8,
        color_precision=4,
        layer_difference=24,
        corner_threshold=90,
        length_threshold=6.0,
        max_iterations=10,
        splice_threshold=60,
        path_precision=2,
    )
    print(f"Simple SVG:  {svg_simple_path}")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "naia-default-character.png"
    colors = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    clean_and_trace(target, colors)
