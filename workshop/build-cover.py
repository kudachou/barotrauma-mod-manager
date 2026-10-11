#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Generate the Steam Workshop cover images (800x800) for the Workshop edition.

Why Pillow: the repo's Node side has no image/drawing library (only electron-builder's
jpeg-js), and drawing text needs a real font engine. The bundled Python ships Pillow.

Design: dark navy card matching the app, title + edition label, then the app's own
English screenshot inset at the bottom so the cover shows the actual product rather
than abstract art.

Run:
    python workshop/build-cover.py
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SHOTS = os.path.join(REPO, "shots")
SHOT_DIR = os.path.join(HERE, "screenshots")
OUT_DIR = os.path.join(HERE, "cover")

SIZE = 800
# 与应用同一套配色（深海底色 + 青色强调）
BG_TOP = (8, 14, 26)
BG_BOTTOM = (13, 30, 46)
ACCENT = (77, 208, 225)
TITLE_COLOR = (233, 242, 248)
SUB_COLOR = (138, 164, 184)

FONT_ZH_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_ZH = r"C:\Windows\Fonts\msyh.ttc"
FONT_EN_BOLD = r"C:\Windows\Fonts\seguisb.ttf"
FONT_EN = r"C:\Windows\Fonts\segoeui.ttf"


def font(path: str, size: int, fallback: str | None = None) -> ImageFont.FreeTypeFont:
    for candidate in (path, fallback):
        if candidate and os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default()


def load_cover_source(lang: str) -> Image.Image:
    """
    封面里的截图用**按了「基础框架」标签的 Mod 库那一屏**
    （由 scripts/shots-workshop.cjs 生成，见 workshop/screenshots/）。
    按语言取对应那一张；都没有时退回旧的通用截图。
    """
    candidates = [
        os.path.join(SHOT_DIR, f"{lang}-library-tag.png"),
        os.path.join(SHOTS, "workshop-en-01-library.png"),
        os.path.join(SHOTS, "workshop-en-02-settings.png"),
    ]
    for p in candidates:
        if os.path.exists(p):
            return Image.open(p).convert("RGB")
    raise SystemExit(
        "找不到截图。先生成：\n"
        "  $env:BMM_VARIANT='workshop'; pnpm run build\n"
        "  $env:BMM_SHOT_LANG='zh'; pnpm exec electron scripts/shots-workshop.cjs\n"
        "  $env:BMM_SHOT_LANG='en'; pnpm exec electron scripts/shots-workshop.cjs"
    )


def vertical_gradient(size: int, top, bottom) -> Image.Image:
    img = Image.new("RGB", (size, size), top)
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line(
            [(0, y), (size, y)],
            fill=(
                round(top[0] + (bottom[0] - top[0]) * t),
                round(top[1] + (bottom[1] - top[1]) * t),
                round(top[2] + (bottom[2] - top[2]) * t),
            ),
        )
    return img


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def centered(d: ImageDraw.ImageDraw, y: int, text: str, f, fill) -> None:
    w = d.textlength(text, font=f)
    d.text(((SIZE - w) / 2, y), text, font=f, fill=fill)


def build(lang: str) -> str:
    zh = lang == "zh"
    img = vertical_gradient(SIZE, BG_TOP, BG_BOTTOM)
    d = ImageDraw.Draw(img)

    # 顶部细强调线
    d.rectangle([0, 0, SIZE, 5], fill=ACCENT)

    f_title = font(FONT_ZH_BOLD if zh else FONT_EN_BOLD, 66 if not zh else 62)
    f_sub = font(FONT_ZH if zh else FONT_EN, 30)
    f_note = font(FONT_ZH if zh else FONT_EN, 24)

    centered(d, 58, "潜渊症 Mod 管理器" if zh else "Barotrauma Mod", f_title, TITLE_COLOR)
    if not zh:
        # 英文标题两行，读起来更稳
        centered(d, 132, "Manager", f_title, TITLE_COLOR)

    label = "创意工坊版" if zh else "Workshop Edition"
    w = d.textlength(label, font=f_sub)
    d.rounded_rectangle(
        [(SIZE - w) / 2 - 22, 210, (SIZE + w) / 2 + 22, 258],
        radius=24,
        outline=ACCENT,
        width=2,
    )
    centered(d, 218, label, f_sub, ACCENT)

    note = "中英双语界面 · 开源" if zh else "Chinese & English UI · Open source"
    centered(d, 278, note, f_note, SUB_COLOR)

    # 应用真实截图（裁成 16:10 再缩放），带一圈描边和圆角
    shot = load_cover_source(lang)
    target_w, target_h = SIZE - 96, 360
    ratio = max(target_w / shot.width, target_h / shot.height)
    resized = shot.resize((round(shot.width * ratio), round(shot.height * ratio)), Image.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    crop = resized.crop((left, top, left + target_w, top + target_h))

    x0, y0 = (SIZE - target_w) // 2, 336
    img.paste(rounded(crop, 14), (x0, y0), rounded(crop, 14))
    d.rounded_rectangle(
        [x0 - 1, y0 - 1, x0 + target_w, y0 + target_h], radius=15, outline=(40, 66, 88), width=2
    )

    footer = (
        "合集排序 · 版本对比 · 同步进游戏 · 备份回滚"
        if zh
        else "Collections · version compare · sync · backup"
    )
    centered(d, y0 + target_h + 34, footer, f_note, SUB_COLOR)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"cover.{lang}.png")
    img.save(out, "PNG", optimize=True)
    return out


if __name__ == "__main__":
    for lang in ("zh", "en"):
        p = build(lang)
        print(f"{os.path.relpath(p, REPO)}  ({os.path.getsize(p) // 1024} KB)")
    sys.exit(0)
