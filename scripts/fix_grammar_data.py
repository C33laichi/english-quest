# -*- coding: utf-8 -*-
"""
修复语法讲义源数据 data_raw.json 中的已知缺陷，并重新生成 03_init_grammar.sql

背景（2026-09-11 用户反馈"语法内容有乱码"）：
经逐条排查，DB / 接口 / 前端渲染链路都是干净的 UTF-8，
真正的缺陷在**上游源数据 data_raw.json**，共三类：

  A. 残句污染 —— 一条知识点尾部粘了**另一句**的片段
     例：'⑤ 比较级 + and + 比较级：越来越...（better and better） longer.'
     末尾的 ' longer.' 是上一句 'Days are getting longer and longer.' 的残段
  B. 空字符 —— PDF 解析时把"划掉/删除"的标记写成了 U+0000
     例：'（Because...\u0000 so...\u0000）'
  C. 内容错误 —— 'good→worse→worst' 应为 'bad→worse→worst'

本脚本只做**确定性修复**（删除残句、去空字符、改错词），不改写讲义语义。
修完重新生成 SQL，并在末尾打印变更清单。

用法：
    python scripts/fix_grammar_data.py            # 生成到 sql/03_init_grammar.sql
    python scripts/fix_grammar_data.py --check    # 只检查不写文件
"""
import json
import re
import sys
import shutil
from pathlib import Path

RAW = Path(r"D:\WorkBuddy\WorkPlace\grammar-quest\js\data_raw.json")
OUT = Path(r"D:\WorkBuddy\WorkPlace\english-quest\sql\03_init_grammar.sql")
GEN = Path(r"D:\WorkBuddy\WorkPlace\english-quest\scripts\gen_grammar_sql.py")

# ---------------------------------------------------------------
# 精确修复表：(day, point_index) -> (字段, 原始值, 修复值)
# 只列出经人工核对确认属于"残句污染"的条目，不做批量模糊替换。
# ---------------------------------------------------------------
EXACT_FIXES = {
    # A. 残句污染：全角括号已闭合，括号外还挂着上一句的英文残段
    (3, 22): {
        "text": (
            "⑤ 比较级 + and + 比较级：越来越...（better and better） longer.",
            "⑤ 比较级 + and + 比较级：越来越...（better and better）",
        ),
        "example": (
            "He is as tall as his brother. The harder you work, the luckier you get. Days are getting longer and",
            "He is as tall as his brother. The harder you work, the luckier you get. Days are getting longer and longer.",
        ),
    },
    (3, 30): {
        "text": (
            "③ enough to do = 足够...可以（old enough to vote） the box.",
            "③ enough to do = 足够...可以（old enough to vote）",
        ),
        "example": (
            "He is too young to go to school. It was so cold that the river froze. He is strong enough to lift",
            "He is too young to go to school. It was so cold that the river froze. He is strong enough to lift the box.",
        ),
    },
    (18, 20): {
        "text": (
            "（did he study 是倒装，he also helped 不倒装） beautifully.",
            "（did he study 是倒装，he also helped 不倒装）",
        ),
    },
    (27, 13): {
        "text": (
            "注意：because 不能和 so 连用！（Because...\u0000 so...\u0000） home. It must be late, for the sun has set.",
            "注意：because 不能和 so 连用！（Because... so...）",
        ),
        "example": (
            None,
            "It must be late, for the sun has set. I was late because I missed the bus. Since you are here, let's start. As it was raining, we stayed at home.",
        ),
    },
    (27, 23): {
        "text": (
            "注意：although/though 不能和 but 连用！（Although...\u0000 but...\u0000） opinion, I disagree.",
            "注意：although/though 不能和 but 连用！（Although... but...）",
        ),
        "example": (
            None,
            "In my opinion, I disagree. Although he is poor, he is happy. Even though it was raining, we went out. While I respect your opinion, I disagree.",
        ),
    },
    # C. 内容错误
    (3, 12): {
        "text": ("good→worse→worst（坏/差）", "bad→worse→worst（坏/差）"),
    },
}

# B. 空字符：全部条目统一清除（PDF 解析残留的删除线标记）
NULL_CHAR = "\u0000"


def fix_point(day_no, idx, point):
    """返回 (新 point, 变更说明列表)"""
    changes = []
    fixes = EXACT_FIXES.get((day_no, idx))
    for field in ("text", "example"):
        old = point.get(field)
        if old is None:
            continue
        new = old

        # A/C. 先套精确修复（顺序很重要：残句表里给的是**含空字符的原文**，
        # 所以必须在清空字符之前匹配，否则就匹配不上了）
        if fixes and field in fixes:
            expect, repl = fixes[field]
            if expect is not None and new == expect:
                new = repl
                changes.append(f"[{day_no}.{idx}].{field} 修复残句/错词")
            elif expect is not None and new != repl:
                # 源数据与预期不符：不误改，但记录出来人工确认
                changes.append(
                    f"[{day_no}.{idx}].{field} ⚠ 未按预期匹配，跳过（当前={new[:60]!r}）"
                )

        # B. 再清空字符（兜底：覆盖未在精确表里列出的条目）
        if NULL_CHAR in new:
            new = new.replace(f" {NULL_CHAR} ", " ").replace(NULL_CHAR, "").strip()
            changes.append(f"[{day_no}.{idx}].{field} 清除 U+0000 空字符")

        if new != old:
            point[field] = new
    return point, changes


def main():
    check_only = "--check" in sys.argv
    if not RAW.exists():
        print(f"源文件不存在: {RAW}")
        return 1

    data = json.loads(RAW.read_text(encoding="utf-8"))
    days = [d for stage in data for d in stage["days"]]
    assert len(days) == 28, f"天数异常: {len(days)}"

    all_changes = []
    for d in days:
        day_no = d["globalDay"]
        for idx, p in enumerate(d.get("points", [])):
            _, ch = fix_point(day_no, idx, p)
            all_changes.extend(ch)

    print("=" * 62)
    print(f"修复清单（共 {len(all_changes)} 项）")
    print("=" * 62)
    for c in all_changes:
        print(" ", c)

    if check_only:
        print("\n--check 模式：不写文件")
        return 0

    # 写回源数据（先备份）
    if all_changes:
        bak = RAW.with_suffix(".json.bak")
        shutil.copy2(RAW, bak)
        print(f"\n已备份源数据 → {bak}")
        RAW.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"已写回源数据 → {RAW}")

    # 复用原生成器逻辑重新生成 SQL
    print("\n重新生成 SQL ...")
    import subprocess

    r = subprocess.run(
        [sys.executable, str(GEN)], capture_output=True, text=True, encoding="utf-8"
    )
    if r.returncode != 0:
        print("生成失败:", r.stderr)
        return 1
    print(r.stdout.strip() or "生成完成")
    print(f"输出 → {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
