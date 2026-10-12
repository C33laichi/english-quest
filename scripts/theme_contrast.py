# -*- coding: utf-8 -*-
"""
主题配色体检工具（零依赖，Windows 下直接跑）。

用途：改配色 / 加深色主题时，先在这里量化过一遍再动手写 CSS。
本项目已经吃过两次「E2E 断言全绿但配色肉眼不对」的亏，色相与对比度
只能靠算，不能靠感觉。

检查两类问题：
  1. WCAG 对比度 —— 正文/次级/弱化文字、语义色、按钮文字是否达标
  2. 色带阶梯均匀度 —— 相邻档位相对亮度比是否落在舒适区间

用法：
    python scripts/theme_contrast.py
"""

# ---------------------------------------------------------------- 色值工具


def _srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(hex_str):
    """相对亮度（WCAG 2.x 定义，0=黑 1=白）"""
    h = hex_str.lstrip('#')
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _srgb_to_lin(r) + 0.7152 * _srgb_to_lin(g) + 0.0722 * _srgb_to_lin(b)


def contrast(fg, bg):
    a, b = lum(fg), lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def grade(v):
    if v >= 7:
        return 'AAA'
    if v >= 4.5:
        return 'AA'
    if v >= 3:
        return 'AA-large'
    return '✗ 不达标'


# ---------------------------------------------------------------- 被检色板
#
# 与 styles/global.css 中的 token 保持一致。改 CSS 时同步改这里，
# 否则这份体检报告就会说谎。

LIGHT = {
    'surface': '#ffffff',
    'bg': '#f4f6f8',
    'text': '#10151c',
    'text_sub': '#5b6472',
    'text_mute': '#8b94a3',
    'accent': '#4338ca',
    'primary': '#4f46e5',
    'success': '#15803d',
    'danger': '#b91c1c',
    'warning': '#a16207',
}

DARK = {
    'surface': '#161b23',
    'bg': '#0e1117',
    'text': '#e7ebf2',
    'text_sub': '#a5aebd',
    'text_mute': '#7c8698',
    'accent': '#a5b4fc',
    'primary': '#4f46e5',
    'primary_hover': '#5b52e8',
    'success': '#4cc38a',
    'danger': '#ef6b6b',
    'warning': '#e0b341',
}

# 热力图色带：同一色相的等比亮度阶梯
HEAT_LIGHT = ['#e2e3ea', '#c7c6f2', '#a09aee', '#7b73e9', '#5f55e6', '#4f46e5']
HEAT_LIGHT_EMPTY = '#f1f2f6'
HEAT_DARK = ['#232a36', '#2e3357', '#3d3f7d', '#4d4aa8', '#5f57d4', '#7470ef']
HEAT_DARK_EMPTY = '#1a1f27'


# ---------------------------------------------------------------- 报表


def report_contrast(title, palette, pairs):
    print('=' * 62)
    print(title)
    print('=' * 62)
    worst = 99.0
    for key, label, back_key in pairs:
        fg, bg = palette[key], palette[back_key]
        r = contrast(fg, bg)
        worst = min(worst, r)
        print(f'  {label:30s} {fg:9s} vs {bg:9s} = {r:5.2f}:1  {grade(r)}')
    return worst


def report_band(title, cols, empty, surface):
    print()
    print('=' * 62)
    print(title + '（目标：相邻比 1.3-1.8x，末档最活跃）')
    print('=' * 62)
    lums = [lum(c) for c in cols]
    ok = True
    for i, c in enumerate(cols):
        note = ''
        if i:
            # 浅色主题的色带是「浅 → 深」，深色主题是「暗 → 亮」，
            # 方向相反，所以统一取 max/min 而不是后除以前
            a, b = lums[i], lums[i - 1]
            rr = max(a, b) / min(a, b)
            if rr > 2.0:
                note = f'  相邻比 {rr:4.2f}x  ⚠ 阶梯跳变'
                ok = False
            elif rr < 1.15:
                note = f'  相邻比 {rr:4.2f}x  ⚠ 两档难分辨'
                ok = False
            else:
                note = f'  相邻比 {rr:4.2f}x  ok'
        print(f'  [{i}] {c}  L={lums[i]:.4f}{note}')
    print(f'  空档 {empty} 与最浅档可区分度 : {contrast(empty, cols[0]):.2f}:1 (>1.10 即可)')
    print(f'  最浅档 对卡片底 {surface}    : {contrast(cols[0], surface):.2f}:1')
    print(f'  最活跃档 对卡片底 {surface}  : {contrast(cols[-1], surface):.2f}:1')
    return ok


def main():
    print()
    w1 = report_contrast('浅色主题 · WCAG 对比度（基准，改动后不应变差）', LIGHT, [
        ('text', '正文 text', 'surface'),
        ('text_sub', '次级 text_sub', 'surface'),
        ('text_mute', '弱化 text_mute', 'surface'),
        ('accent', '强调文字 accent', 'surface'),
        ('text', '正文 text（对页底）', 'bg'),
        ('success', '成功 success', 'surface'),
        ('danger', '危险 danger', 'surface'),
        ('warning', '警告 warning', 'surface'),
    ])

    print()
    w2 = report_contrast('深色主题 · WCAG 对比度', DARK, [
        ('text', '正文 text', 'surface'),
        ('text_sub', '次级 text_sub', 'surface'),
        ('text_mute', '弱化 text_mute', 'surface'),
        ('accent', '强调文字 accent', 'surface'),
        ('success', '成功 success', 'surface'),
        ('danger', '危险 danger', 'surface'),
        ('warning', '警告 warning', 'surface'),
        ('text', '正文 text（对页底）', 'bg'),
    ])
    white_on_primary = contrast('#ffffff', DARK['primary'])
    white_on_hover = contrast('#ffffff', DARK['primary_hover'])
    print(f'  {"白字于主色填充":30s} #ffffff  vs {DARK["primary"]:9s} = {white_on_primary:5.2f}:1  {grade(white_on_primary)}')
    print(f'  {"白字于主色 hover":30s} #ffffff  vs {DARK["primary_hover"]:9s} = {white_on_hover:5.2f}:1  {grade(white_on_hover)}')

    b1 = report_band('浅色主题 · 热力图色带', HEAT_LIGHT, HEAT_LIGHT_EMPTY, LIGHT['surface'])
    b2 = report_band('深色主题 · 热力图色带', HEAT_DARK, HEAT_DARK_EMPTY, DARK['surface'])

    print()
    print('=' * 62)
    print('结论')
    print('=' * 62)
    print(f'  浅色主题最差对比度 {w1:.2f}:1')
    print(f'  深色主题最差对比度 {w2:.2f}:1（不含按钮文字 {min(white_on_primary, white_on_hover):.2f}:1）')
    print(f'  浅色色带阶梯 {"均匀" if b1 else "存在问题"}')
    print(f'  深色色带阶梯 {"均匀" if b2 else "存在问题"}')
    print()


if __name__ == '__main__':
    main()
