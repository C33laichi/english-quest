# -*- coding: utf-8 -*-
"""
给词汇题库补词性（缺陷 3）。

背景
----
选择题的四个选项、拼写题的中文释义，原本都是纯中文（`记忆；回忆`），
学生看不出这个词是名词还是动词。要在专升本语境下有参考价值，必须带词性。

做法
----
**不改表结构**，把词性内联进文本：`记忆；回忆` → `n. 记忆；回忆`。
理由是选项有四个，加列就得给每个选项各配一列词性；而词性内联之后
`t_vocab_question` 的字段表不变，ER 图与说明书都不用跟着改。

选项词性怎么来的
----------------
题库里 180 个释义与 180 个单词是 **一一对应** 的（实测 720 个选项文本
100% 能在释义集合里找到），所以选项只要按释义反查单词、再查单词的词性即可，
不需要人工标注 720 次。

产出
----
1. 原地重写 `sql/02_init_vocab.sql`（新环境初始化就带词性）
2. 生成 `sql/07_vocab_pos.sql`（给已有库刷数据，幂等：已带词性的行不动）

用法：python scripts/gen_vocab_pos.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'sql', '02_init_vocab.sql')
OUT = os.path.join(ROOT, 'sql', '07_vocab_pos.sql')

# 单词 -> 词性。一词多性时用 / 连写（n./v.），不写成「名/动」——
# 学生看考研、四六级词汇书都是用英文缩写，中文缩写反而要二次翻译。
# 判断依据是「题库里给的那几条释义」本身的词性，不是这个词的全部词性：
# 例如 document 只给了「文件；文档」，就按 n. 标，不硬凑 v.。
POS = {
    'absorb': 'v.', 'acquire': 'v.', 'acute': 'adj.', 'affect': 'v.',
    'agreement': 'n.', 'ahead': 'adv.', 'ambulance': 'n.', 'amusement': 'n.',
    'ankle': 'n.', 'apartment': 'n.', 'apparent': 'adj.', 'applaud': 'v.',
    'appreciate': 'v.', 'argument': 'n.', 'arrival': 'n.', 'assist': 'v.',
    'athlete': 'n.', 'atom': 'n.', 'awake': 'adj./v.', 'award': 'n./v.',
    'battle': 'n./v.', 'belief': 'n.', 'big': 'adj.', 'biology': 'n.',
    'blackboard': 'n.', 'bleed': 'v.', 'bound': 'adj.', 'brand': 'n.',
    'bridge': 'n.', 'brochure': 'n.', 'cartoon': 'n.', 'carve': 'v.',
    'cattle': 'n.', 'chance': 'n.', 'cheat': 'v.', 'climate': 'n.',
    'coal': 'n.', 'constant': 'adj.', 'content': 'n./adj.', 'continue': 'v.',
    'conventional': 'adj.', 'corner': 'n.', 'coverage': 'n.', 'crime': 'n.',
    'critical': 'adj.', 'crossroads': 'n.', 'debt': 'n.', 'decision': 'n.',
    'declare': 'v.', 'definitely': 'adv.', 'delighted': 'adj.', 'description': 'n.',
    'despair': 'n./v.', 'directory': 'n.', 'disabled': 'adj.', 'discount': 'n.',
    'dive': 'v.', 'document': 'n.', 'doubt': 'n./v.', 'dozen': 'n.',
    'drought': 'n.', 'duck': 'n.', 'eagle': 'n.', 'electric': 'adj.',
    'embassy': 'n.', 'emphasize': 'v.', 'ending': 'n.', 'endless': 'adj.',
    'enjoyable': 'adj.', 'enthusiastic': 'adj.', 'episode': 'n.', 'equip': 'v.',
    'evolution': 'n.', 'exact': 'adj.', 'expression': 'n.', 'factor': 'n.',
    'factory': 'n.', 'familiar': 'adj.', 'fasten': 'v.', 'feather': 'n.',
    'foolish': 'adj.', 'force': 'n./v.', 'forest': 'n.', 'fountain': 'n.',
    'freeze': 'v.', 'friction': 'n.', 'frustrated': 'adj.', 'genius': 'n.',
    'gesture': 'n.', 'gifted': 'adj.', 'glance': 'v./n.', 'glory': 'n.',
    'golden': 'adj.', 'grace': 'n.', 'gravity': 'n.', 'haircut': 'n.',
    'happiness': 'n.', 'hence': 'adv.', 'honour': 'n.', 'horrible': 'adj.',
    'horse': 'n.', 'household': 'n./adj.', 'innovation': 'n.', 'inspection': 'n.',
    'irrigate': 'v.', 'island': 'n.', 'jaw': 'n.', 'jog': 'v.',
    'ladder': 'n.', 'lady': 'n.', 'launch': 'v./n.', 'lift': 'v./n.',
    'limit': 'n./v.', 'logical': 'adj.', 'mankind': 'n.', 'massive': 'adj.',
    'medal': 'n.', 'memory': 'n.', 'mend': 'v.', 'microscope': 'n.',
    'minimum': 'adj./n.', 'minister': 'n.', 'nowhere': 'adv.', 'object': 'n./v.',
    'offence': 'n.', 'organic': 'adj.', 'painful': 'adj.', 'participate': 'v.',
    'partner': 'n.', 'passive': 'adj.', 'personnel': 'n.', 'petrol': 'n.',
    'phenomenon': 'n.', 'playground': 'n.', 'plot': 'n.', 'primary': 'adj.',
    'primitive': 'adj.', 'principle': 'n.', 'rapid': 'adj.', 'realistic': 'adj.',
    'receptionist': 'n.', 'release': 'v./n.', 'resistance': 'n.', 'resource': 'n.',
    'ridiculous': 'adj.', 'rude': 'adj.', 'sacred': 'adj.', 'scientist': 'n.',
    'select': 'v.', 'show': 'v./n.', 'shower': 'n./v.', 'silent': 'adj.',
    'skilled': 'adj.', 'slightly': 'adv.', 'solar': 'adj.', 'solve': 'v.',
    'sour': 'adj.', 'souvenir': 'n.', 'square': 'n./adj.', 'stage': 'n.',
    'straightforward': 'adj.', 'stranger': 'n.', 'strength': 'n.', 'struggle': 'v./n.',
    'style': 'n.', 'successful': 'adj.', 'superb': 'adj.', 'tank': 'n.',
    'twin': 'n./adj.', 'typical': 'adj.', 'unfold': 'v.', 'uniform': 'n./adj.',
    'useful': 'adj.', 'usual': 'adj.', 'victory': 'n.', 'vision': 'n.',
    'white': 'adj.', 'withdraw': 'v.', 'wonder': 'v./n.', 'worry': 'v./n.',
}

# 一行题目的完整元组：(id, level, type, word, phonetic, meaning, a, b, c, d, answer, analysis, status)
ROW = re.compile(
    r"\((\d+),\s*(\d+),\s*'(CHOICE|SPELL)',\s*'([^']*)',\s*(NULL|'[^']*'),\s*'([^']*)',"
    r"\s*(NULL|'[^']*'),\s*(NULL|'[^']*'),\s*(NULL|'[^']*'),\s*(NULL|'[^']*'),"
    r"\s*'([^']*)',\s*'([^']*)',\s*(\d+)\)"
)

# 已带词性前缀的文本：「n. 记忆；回忆」/「adj./v. 醒着的；唤醒」
HAS_POS = re.compile(r'^[a-z]+\.(\s*/\s*[a-z]+\.)*\s')


def strip_quote(tok):
    """把 SQL 里的 NULL 或 'xxx' 统一成字符串（NULL 返回 None）"""
    if tok == 'NULL':
        return None
    return tok[1:-1]


def quote(val):
    return 'NULL' if val is None else "'" + val + "'"


def main():
    with open(SRC, encoding='utf-8') as f:
        text = f.read()

    rows = ROW.findall(text)
    if not rows:
        sys.exit('没有匹配到任何题目行，正则与文件格式可能不同步')

    words = {r[3] for r in rows}
    missing = sorted(w for w in words if w not in POS)
    if missing:
        sys.exit('这些单词还没有词性，先补齐 POS 表：' + '、'.join(missing))

    # 释义 -> 词性。释义与单词在这个题库里是一一对应的，
    # 一旦出现「一个释义对应两个单词」就说明去重逻辑有变，直接报错而不是随便挑一个。
    meaning_pos = {}
    for r in rows:
        w, m = r[3], r[5]
        if m in meaning_pos and meaning_pos[m] != POS[w]:
            sys.exit(f'释义「{m}」同时对应 {w} 与另一个词性不同的单词，无法自动回溯')
        meaning_pos[m] = POS[w]

    unknown_opt = set()
    updates = []

    def fix_word_level(raw):
        """给一条中文释义加上词性前缀；回溯不到词性时原样返回并记录"""
        if raw is None:
            return None
        if HAS_POS.match(raw):
            return raw          # 已经带过，幂等
        pos = meaning_pos.get(raw)
        if pos is None:
            unknown_opt.add(raw)
            return raw
        return pos + ' ' + raw

    def repl(m):
        (qid, lv, typ, word, phon, meaning,
         oa, ob, oc, od, ans, ana, status) = m.groups()
        new_meaning = fix_word_level(meaning)
        opts = [fix_word_level(strip_quote(x)) for x in (oa, ob, oc, od)]
        updates.append((qid, new_meaning, opts))
        return ("({}, {}, '{}', '{}', {}, {}, {}, {}, {}, {}, '{}', '{}', {})".format(
            qid, lv, typ, word, phon,
            quote(new_meaning),
            *[quote(o) for o in opts],
            ans, ana, status
        ))

    new_text = ROW.sub(repl, text)

    if unknown_opt:
        sys.exit('这些释义没有匹配到词性（请检查是否题库里新增了词）：\n  ' + '\n  '.join(sorted(unknown_opt)))

    # 1) 回写初始化脚本
    with open(SRC, 'w', encoding='utf-8', newline='\n') as f:
        f.write(new_text)

    # 2) 生成刷库脚本
    lines = [
        '-- ============================================================',
        '-- 给已有库的词汇题补词性（缺陷 3：拼写题释义 / 选择题选项没有词性）',
        '--',
        '-- 做法：把词性内联进文本，`记忆；回忆` -> `n. 记忆；回忆`，不改表结构。',
        '-- 幂等：WHERE 里排除已带词性前缀的行，重复执行不会叠成 `n. n. 记忆`。',
        '-- 由 scripts/gen_vocab_pos.py 生成，不要手改。',
        '-- ============================================================',
        'USE english_quest;',
        '',
        '-- 校验：执行后「未带词性的题目」应为 0',
        "-- SELECT COUNT(*) FROM t_vocab_question WHERE meaning NOT REGEXP '^[a-z]+\\\\.';",
        '',
    ]
    for qid, meaning, opts in updates:
        sets = ["meaning = '%s'" % meaning]
        for col, val in zip(('option_a', 'option_b', 'option_c', 'option_d'), opts):
            if val is not None:
                sets.append("%s = '%s'" % (col, val))
        lines.append("UPDATE t_vocab_question SET %s WHERE id = %s AND meaning NOT REGEXP '^[a-z]+\\\\.';"
                     % (', '.join(sets), qid))
    lines.append('')

    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))

    print('题目行：%d，单词：%d，释义：%d' % (len(rows), len(words), len(meaning_pos)))
    print('已重写 %s' % SRC)
    print('已生成 %s（%d 条 UPDATE）' % (OUT, len(updates)))
    sample = updates[0]
    print('样例：%s -> %s | %s' % (sample[0], sample[1], sample[2]))


if __name__ == '__main__':
    main()
