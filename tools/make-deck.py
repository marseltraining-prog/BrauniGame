# -*- coding: utf-8 -*-
"""Презентация для коллег: «Хлебная карта» 1.0. Собирает PPTX и PDF из скриншотов игры."""
import os, subprocess
from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'presentation')
TMP = os.path.join(ROOT, 'tmp', 'deck')
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)

CREAM = RGBColor(0xF6, 0xEF, 0xE3); PAPER = RGBColor(0xFF, 0xFA, 0xF2)
INK = RGBColor(0x2C, 0x27, 0x21); MUTED = RGBColor(0x7B, 0x6F, 0x60)
CRUST = RGBColor(0xB5, 0x65, 0x3C); LINE = RGBColor(0xE3, 0xD6, 0xC2)
GREEN = RGBColor(0x5A, 0x7D, 0x5A)

prs = Presentation()
prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]

def bg(slide, color=CREAM):
    r = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    r.fill.solid(); r.fill.fore_color.rgb = color; r.line.fill.background(); r.shadow.inherit = False
    return r

def text(slide, x, y, w, h, s, size=18, color=INK, bold=False, font='Arial', align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, spacing=1.0, italic=False):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); tf = tb.text_frame
    tf.word_wrap = True; tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    lines = s.split('\n')
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align; p.line_spacing = spacing
        r = p.add_run(); r.text = line
        r.font.name = font; r.font.size = Pt(size); r.font.bold = bold; r.font.italic = italic
        r.font.color.rgb = color
    return tb

def rect(slide, x, y, w, h, fill=PAPER, line=LINE, radius=False):
    sh = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE,
                                Inches(x), Inches(y), Inches(w), Inches(h))
    sh.fill.solid(); sh.fill.fore_color.rgb = fill
    if line is None: sh.line.fill.background()
    else: sh.line.color.rgb = line; sh.line.width = Pt(1)
    sh.shadow.inherit = False
    if radius:
        try: sh.adjustments[0] = 0.08
        except Exception: pass
    return sh

def pill(slide, x, y, w, s, color=CRUST):
    r = rect(slide, x, y, w, 0.34, PAPER, LINE, True)
    text(slide, x + 0.14, y + 0.055, w - 0.28, 0.24, s, 11, color, True)
    return r

def crop(path, w_in, h_in, name):
    im = Image.open(path).convert('RGB'); tw, th = w_in, h_in
    ar = tw / th; iw, ih = im.size
    if iw / ih > ar:
        nw = int(ih * ar); box = ((iw - nw)//2, 0, (iw + nw)//2, ih)
    else:
        nh = int(iw / ar); box = (0, (ih - nh)//2, iw, (ih + nh)//2)
    im = im.crop(box).resize((int(tw*220), int(th*220)), Image.LANCZOS)
    p = os.path.join(TMP, name); im.save(p, 'JPEG', quality=90); return p

def pic(slide, path, x, y, w, h, border=True):
    p = crop(path, w, h, os.path.basename(path) + f'-{w}x{h}.jpg')
    if border: rect(slide, x-0.03, y-0.03, w+0.06, h+0.06, PAPER, LINE, True)
    slide.shapes.add_picture(p, Inches(x), Inches(y), Inches(w), Inches(h))

def footer(slide, n, label='Хлебная карта · 1.0'):
    text(slide, 0.7, 7.08, 6.0, 0.22, label, 9, MUTED)
    text(slide, 11.9, 7.08, 0.7, 0.22, str(n), 9, MUTED, align=PP_ALIGN.RIGHT)

SHOTS = {
    'start': 'qa/shots/desk-0-start.png',
    'map': 'qa/shots/full/map-d1440.png',
    'story': 'qa/shots/prologue/d1440-02-scene-p01.png',
    'mobile': 'qa/shots/mob-0-start.png',
}

# 1. Обложка
s = prs.slides.add_slide(BLANK); bg(s)
rect(s, 0, 0, 0.12, 7.5, CRUST, None)
text(s, 0.75, 0.75, 6.4, 0.3, 'ИГРА ПРО НАШУ ПЕКАРНЮ', 12, CRUST, True)
text(s, 0.72, 1.25, 6.6, 1.7, 'Хлебная\nкарта', 58, INK, True, spacing=0.92)
text(s, 0.75, 3.35, 6.2, 1.0, 'От одной точки до сети\nв 19 городах России', 24, MUTED, spacing=1.05)
pill(s, 0.75, 4.72, 1.75, '19 городов')
pill(s, 2.62, 4.72, 1.9, '5 способов начать')
pill(s, 4.64, 4.72, 2.7, 'Работает на телефоне')
text(s, 0.75, 5.9, 5.8, 0.7, 'Экономическая игра по мотивам нашей пекарни.\nБез установки: открыл ссылку — и играешь.', 14, MUTED, spacing=1.1)
pic(s, SHOTS['start'], 7.35, 1.25, 5.25, 3.28)
text(s, 7.35, 4.85, 5.2, 0.5, 'Выбор старта: пролог, кофейня, сеть, Россия, холдинг', 10, MUTED, italic=True)
text(s, 0.75, 7.06, 6.0, 0.22, 'Версия 1.0 · октябрь 2026', 9, MUTED)

# 2. Что это
s = prs.slides.add_slide(BLANK); bg(s)
text(s, 0.7, 0.55, 7.0, 0.3, 'ЧТО ЭТО', 11, CRUST, True)
text(s, 0.7, 0.95, 7.0, 0.7, 'Пекарня без риска', 34, INK, True)
text(s, 0.7, 1.78, 5.6, 1.0, 'Вы начинаете с одной точки и строите сеть: люди, поставки, кризисы, конкуренты, новые города.', 17, MUTED, spacing=1.15)
rows = [
    ('01', 'Одна точка → сеть в Уфе', 'Первый акт: найм, цех, поставки, ремонты, события.'),
    ('02', 'Россия и холдинг', 'Города, директора, федеральная сеть; затем биржа, зарубежье или франшиза.'),
    ('03', 'История и люди', 'Герои, семейные линии, развилки и семь разных финалов.'),
]
y = 3.05
for num, title, sub in rows:
    text(s, 0.7, y, 0.55, 0.35, num, 12, CRUST, True)
    text(s, 1.25, y-0.03, 4.9, 0.32, title, 16, INK, True)
    text(s, 1.25, y+0.32, 4.9, 0.45, sub, 12, MUTED, spacing=1.05)
    y += 1.05
pic(s, SHOTS['map'], 6.6, 0.8, 6.05, 5.75)
text(s, 6.6, 6.62, 6.0, 0.3, 'Уфа: 45 точек, карта города и панель решений', 10, MUTED, italic=True)
footer(s, 2)

# 3. Что внутри
s = prs.slides.add_slide(BLANK); bg(s)
text(s, 0.7, 0.55, 7.0, 0.3, 'ЧТО ВНУТРИ', 11, CRUST, True)
text(s, 0.7, 0.95, 10.0, 0.7, 'Больше, чем «открыть точку»', 32, INK, True)
cards = [
    ('19 городов', 'Подробные карты: районы, улицы, реки, мосты, реальные места.'),
    ('5 способов начать', 'Пролог, своя кофейня, сеть, сразу Россия, сразу холдинг.'),
    ('100+ событий', 'Кризисы, проверки, конкуренты, семейные дела и сюжетные сцены.'),
    ('Люди и команда', 'Найм, обучение, настроение, управляющие и директора городов.'),
    ('Три акта', 'Уфа → Россия → холдинг. Три пути и три финала в третьем акте.'),
    ('Своя музыка', 'Тёплая тема «Тёплый хлеб», которая меняется по актам.'),
]
cw, ch = 3.85, 1.78; x0, y0 = 0.7, 1.95
for i, (h, d) in enumerate(cards):
    x = x0 + (i % 3) * (cw + 0.28); y = y0 + (i // 3) * (ch + 0.28)
    rect(s, x, y, cw, ch, PAPER, LINE, True)
    text(s, x+0.25, y+0.2, cw-0.5, 0.3, h, 16, INK, True)
    text(s, x+0.25, y+0.66, cw-0.45, 0.9, d, 12, MUTED, spacing=1.1)
text(s, 0.7, 6.15, 11.8, 0.5, 'Всё в одном HTML-файле: без установки, без интернета, на телефоне и компьютере.', 13, CRUST, True)
footer(s, 3)

# 4. Как поиграть + QR
s = prs.slides.add_slide(BLANK); bg(s)
text(s, 0.7, 0.55, 7.0, 0.3, 'КАК ПОИГРАТЬ', 11, CRUST, True)
text(s, 0.7, 0.95, 7.0, 0.7, 'Пять минут до первой точки', 32, INK, True)
steps = [
    ('1', 'Открой ссылку', 'С телефона или компьютера — устанавливать ничего не нужно.'),
    ('2', 'Выбери старт', 'Для первого раза — «Пролог «Бариста»» или «Сразу кофейня».'),
    ('3', 'Открой первую точку', 'Выбери место, набери команду, запусти производство.'),
    ('4', 'Дойди до России', 'Когда сеть перерастёт город — откроется второй акт.'),
]
y = 1.95
for n, h, d in steps:
    rect(s, 0.7, y, 0.44, 0.44, CRUST, None, True)
    text(s, 0.7, y+0.08, 0.44, 0.28, n, 13, PAPER, True, align=PP_ALIGN.CENTER)
    text(s, 1.35, y-0.03, 5.2, 0.32, h, 16, INK, True)
    text(s, 1.35, y+0.31, 5.4, 0.5, d, 12, MUTED, spacing=1.05)
    y += 1.15
rect(s, 7.65, 1.55, 4.85, 4.35, PAPER, LINE, True)
s.shapes.add_picture(os.path.join(OUT, 'qr.png'), Inches(8.62), Inches(1.8), Inches(2.9), Inches(2.9))
text(s, 7.9, 4.82, 4.35, 0.3, 'Наведи камеру телефона', 12, MUTED, align=PP_ALIGN.CENTER)
text(s, 7.9, 5.13, 4.35, 0.55, 'marseltraining-prog.github.io/\nBrauniGame/play/', 12, CRUST, True, align=PP_ALIGN.CENTER, spacing=1.05)
text(s, 0.7, 6.35, 11.8, 0.4, 'Звук включается после первого касания — так устроены браузеры.', 11, MUTED, italic=True)
footer(s, 4)

# 5. Скриншоты
s = prs.slides.add_slide(BLANK); bg(s)
text(s, 0.7, 0.55, 7.0, 0.3, 'КАК ЭТО ВЫГЛЯДИТ', 11, CRUST, True)
text(s, 0.7, 0.95, 10.0, 0.7, 'Три взгляда на игру', 32, INK, True)
pic(s, SHOTS['story'], 0.7, 1.9, 5.95, 3.7)
text(s, 0.7, 5.75, 5.9, 0.5, 'Пролог: смена в кофейне, герои и первые решения', 10, MUTED, italic=True)
pic(s, SHOTS['mobile'], 7.0, 1.55, 2.25, 4.4)
text(s, 7.0, 6.1, 2.3, 0.4, 'Телефон', 10, MUTED, italic=True)
pic(s, SHOTS['start'], 9.55, 1.9, 3.1, 2.55)
text(s, 9.55, 4.55, 3.1, 0.7, 'Старт: пять вариантов,\nбез установки', 10, MUTED, italic=True)
text(s, 9.55, 5.55, 3.1, 1.0, 'Один HTML-файл.\nРаботает офлайн.\nСохраняется в браузере.', 12, INK, True, spacing=1.1)
footer(s, 5)

# 6. Приглашение
s = prs.slides.add_slide(BLANK); bg(s)
rect(s, 0, 0, 0.12, 7.5, CRUST, None)
text(s, 0.75, 0.7, 6.5, 0.3, 'ПРИГЛАШЕНИЕ', 12, CRUST, True)
text(s, 0.72, 1.15, 7.1, 1.5, 'Поиграйте\nна досуге', 46, INK, True, spacing=0.98)
text(s, 0.75, 3.0, 6.4, 1.6, 'Это игра по мотивам нашей пекарни, а не рабочий инструмент. Здесь можно ошибаться, спорить с командой и пробовать странные решения — без последствий для настоящей сети.', 15, MUTED, spacing=1.15)
text(s, 0.75, 4.75, 6.2, 1.2, 'Если найдёте ошибку или появится идея — напишите мне. Я собираю отзывы к пост-релизным версиям.', 15, INK, True, spacing=1.15)
text(s, 0.75, 6.35, 6.2, 0.5, 'Спасибо, что попробуете.', 13, CRUST, True)
rect(s, 7.85, 1.2, 4.65, 5.0, PAPER, LINE, True)
s.shapes.add_picture(os.path.join(OUT, 'qr.png'), Inches(8.75), Inches(1.55), Inches(2.85), Inches(2.85))
text(s, 8.0, 4.55, 4.35, 0.3, 'Ссылка на игру', 11, MUTED, align=PP_ALIGN.CENTER)
text(s, 8.0, 4.88, 4.35, 0.55, 'marseltraining-prog.github.io/\nBrauniGame/play/', 11, CRUST, True, align=PP_ALIGN.CENTER, spacing=1.05)
text(s, 8.0, 5.7, 4.35, 0.3, 'Версия 1.0 · октябрь 2026', 10, MUTED, align=PP_ALIGN.CENTER)
footer(s, 6)

pptx_path = os.path.join(OUT, 'khlebnaya-karta-1.0.pptx')
prs.save(pptx_path)
print('saved', pptx_path)
