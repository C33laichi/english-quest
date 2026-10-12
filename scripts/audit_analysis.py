# -*- coding: utf-8 -*-
"""
错题解析质量审计

目的：量化"解析是否针对学生实际选中的错项"这一问题，而不是凭感觉下结论。

检查项：
  1. 解析是否引用了正确选项的文本（应当基本都有）
  2. 解析是否提及任一**干扰项**文本 —— 只有提及了，学生选那个错项时才可能被解答
  3. 解析里出现的选项字母（"选 B"/"答案是 C"）是否与 answer 字段一致 —— 不一致就是数据 bug
  4. 按 4 个选项平均估算：学生随机错一次，"解析能覆盖到他选的那个错项"的概率

用法：python scripts/audit_analysis.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL_DIR = ROOT / 'sql'


def split_rows(text):
    """
    从 INSERT ... VALUES 里切出每条记录（处理括号嵌套与 SQL 的 '' 转义）。

    ⚠ 踩坑记录（本函数第一版写错过，值得记一笔）：
    第一版在遇到 '' 转义时直接把两个引号压成一个塞进 buf，随后 split_fields 又对
    这段**已压缩**的文本做引号配对 —— 那个压缩出来的单引号在 split_fields 眼里
    就是一个字符串边界，于是状态整体错位。
      症状：内容里没有撇号的行解析正确，含撇号的行字段数忽多忽少
            （如 I''ve 那行算出 6 个字段、另一行算出 13 个）。
      修法：buf 里**保留原始文本**（两个引号都留着），
            把 '' → ' 的还原只放在 split_fields 取字段值的那一步做，各司其职。
    """
    rows = []
    buf = []
    depth = 0
    i = 0
    in_str = False
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == "'":
                if i + 1 < len(text) and text[i + 1] == "'":  # '' 转义
                    buf.append("''")  # 保留原样，交给 split_fields 还原
                    i += 2
                    continue
                in_str = False
                buf.append(ch)
            else:
                buf.append(ch)
        else:
            if ch == "'":
                in_str = True
                buf.append(ch)
            elif ch == '(':
                depth += 1
                if depth == 1:
                    buf = []
                else:
                    buf.append(ch)
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    rows.append(split_fields(''.join(buf)))
                else:
                    buf.append(ch)
            elif depth >= 1:
                buf.append(ch)
        i += 1
    return rows


def split_fields(row):
    """按逗号切分字段，跳过被引号包裹的逗号。"""
    fields = []
    buf = []
    in_str = False
    i = 0
    while i < len(row):
        ch = row[i]
        if in_str:
            if ch == "'":
                if i + 1 < len(row) and row[i + 1] == "'":
                    buf.append("'")
                    i += 2
                    continue
                in_str = False
            else:
                buf.append(ch)
        else:
            if ch == "'":
                in_str = True
            elif ch == ',':
                fields.append(''.join(buf).strip())
                buf = []
            else:
                buf.append(ch)
        i += 1
    fields.append(''.join(buf).strip())
    return fields


def split_statements(text):
    """按顶层分号切分 SQL 语句（跳过字符串内的分号）。"""
    stmts = []
    buf = []
    in_str = False
    i = 0
    while i < len(text):
        ch = text[i]
        if in_str:
            buf.append(ch)
            if ch == "'":
                if i + 1 < len(text) and text[i + 1] == "'":
                    buf.append("'")
                    i += 2
                    continue
                in_str = False
        else:
            if ch == "'":
                in_str = True
                buf.append(ch)
            elif ch == ';':
                stmts.append(''.join(buf))
                buf = []
            else:
                buf.append(ch)
        i += 1
    if ''.join(buf).strip():
        stmts.append(''.join(buf))
    return stmts


def load(file, table):
    """
    只解析目标表的 INSERT，列名从语句自身读出来。

    踩坑记录：一个 sql 文件里常有多个 INSERT（如 t_grammar_lesson + t_grammar_question）。
    早先版本从第一个 VALUES 开始整段切行、再按固定列数过滤，
    结果把讲义行和题目行混在一起、静默丢行（语法只算出 70 题，实际 112 题）。
    """
    text = (SQL_DIR / file).read_text(encoding='utf-8')
    for stmt in split_statements(text):
        head = stmt.strip()
        if not head.upper().startswith('INSERT INTO'):
            continue
        m = re.match(r'INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES', head, re.I | re.S)
        if not m or m.group(1).lower() != table.lower():
            continue
        cols = [c.strip() for c in m.group(2).split(',')]
        rows = split_rows(head[m.end():])
        out = [dict(zip(cols, r)) for r in rows if len(r) == len(cols)]
        return out
    raise SystemExit(f'在 {file} 里没找到 {table} 的 INSERT')


LETTER_RE = re.compile(r'(?:选|选\s*项|答案|应选|用|是)\s*([A-Da-d])\b')


def audit(questions, label):
    total = len(questions)
    mention_correct = 0
    mention_distractor = 0
    letter_conflict = []
    no_analysis = []
    per_option_covered = {'A': 0, 'B': 0, 'C': 0, 'D': 0}
    option_present = {'A': 0, 'B': 0, 'C': 0, 'D': 0}

    for q in questions:
        ans = (q.get('answer') or '').strip().upper()
        analysis = q.get('analysis') or ''
        opts = {}
        for L in 'ABCD':
            t = (q.get(f'option_{L.lower()}') or '').strip()
            if t:
                opts[L] = t
                option_present[L] += 1

        if not analysis.strip():
            no_analysis.append(q.get('id') or q.get('word') or q.get('stem'))
            continue

        low = analysis.lower()

        # 正确项文本是否被引用
        correct_text = opts.get(ans, '')
        if correct_text and len(correct_text) >= 2 and correct_text.lower() in low:
            mention_correct += 1

        # 干扰项文本是否被提及
        touched = False
        for L, t in opts.items():
            if L == ans:
                continue
            if len(t) >= 2 and t.lower() in low:
                per_option_covered[L] += 1
                touched = True
        if touched:
            mention_distractor += 1

        # 字母一致性
        for m in LETTER_RE.finditer(analysis):
            if m.group(1).upper() != ans:
                letter_conflict.append((q.get('id'), ans, m.group(0), analysis[:60]))
                break

    print(f'\n{"=" * 70}\n{label}  共 {total} 题\n{"=" * 70}')
    print(f'  解析为空            : {len(no_analysis)}')
    ok = total - len(no_analysis)
    if not ok:
        return
    print(f'  引用正确答案文本    : {mention_correct:>4} / {ok}  ({mention_correct / ok * 100:.0f}%)')
    print(f'  提及任一干扰项文本  : {mention_distractor:>4} / {ok}  ({mention_distractor / ok * 100:.0f}%)  ← 越低说明越"只夸正确答案"')
    print(f'  解析字母与 answer 冲突: {len(letter_conflict)}')
    for c in letter_conflict[:8]:
        print(f'      id={c[0]} answer={c[1]}  命中"{c[2]}"  … {c[3]}')

    print('\n  分选项：解析是否提到该错项（分母=题量，"选错此项时被解答"的上界）：')
    for L in 'ABCD':
        if L in option_present:
            print(f'    {L}: {per_option_covered[L]:>4} / {ok}  ({per_option_covered[L] / ok * 100:.0f}%)')

    covered = sum(v for k, v in per_option_covered.items())
    print(f'\n  → 平均每题被覆盖的干扰项数: {covered / ok:.2f} / 3')
    print(f'  → 学生选一个错项，解析恰好点到它的概率约 {covered / (ok * 3) * 100:.0f}%')


def row_stats():
    """打印每个 sql 文件里各 INSERT 的列名与行数，用于核对解析器有没有静默丢行。"""
    for f in sorted(p.name for p in SQL_DIR.glob('*.sql')):
        text = (SQL_DIR / f).read_text(encoding='utf-8')
        for stmt in split_statements(text):
            head = stmt.strip()
            if not head.upper().startswith('INSERT INTO'):
                continue
            m = re.match(r'INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES', head, re.I | re.S)
            if not m:
                continue
            cols = [c.strip() for c in m.group(2).split(',')]
            rows = split_rows(head[m.end():])
            bad = [r for r in rows if len(r) != len(cols)]
            flag = f'  ⚠ 列数不匹配 {len(bad)} 行' if bad else ''
            print(f'{f:<22} {m.group(1):<24} 列={len(cols):>2} 行={len(rows):>4}{flag}')
            if bad:
                print(f'    首个不匹配行字段数={len(bad[0])}：{bad[0][:3]}')


def main():
    if '--rows' in sys.argv:
        row_stats()
        return
    vocab = load('02_init_vocab.sql', 't_vocab_question')
    grammar = load('03_init_grammar.sql', 't_grammar_question')

    print(f'解析 SQL：词汇 {len(vocab)} 题，语法 {len(grammar)} 题')
    audit(vocab, '词汇题')
    audit(grammar, '语法题')


if __name__ == '__main__':
    main()
