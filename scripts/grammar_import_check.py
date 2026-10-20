#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
语法题库「批量导入」回归（真实 HTTP + 真实 DB）

与词汇导入共用 eq_util 的 HTTP / multipart / MySQL 工具；差异集中在三处业务规则上，
所以本脚本的重点也就放在这三处：
  1) 「天数」列：留空落到默认 Day / 序号 / Day N / 第N天 / 讲义标题 / 认不出的值要拦下
  2) 4 个选项**必须填全**（语法不做自动生成），缺哪个要点名说
  3) 知识点与解析的兜底（知识点缺省 = 该 Day 的讲义标题）

设计要点：
  * 全程在**两个临时 Day**（dayNo 98 / 99）里跑，跑完删干净并断言题库总题数回到开跑前。
    ★ 清理必须**倒序**：语法 Day 只允许删"最后一天"，所以先删 99，再删 98。
  * 覆盖 CSV（UTF-8 BOM / GBK / 制表符 / 引号内逗号）与 XLSX 两条解析路径。
  * dryRun 必须**不写库** —— 这是"先预览再确认"能成立的前提，单独断言。

用法：python scripts/grammar_import_check.py [base_url]
默认 base_url = http://127.0.0.1:8090
"""

import os
import shutil
import sys
import tempfile

import eq_util as U

BASE = U.preflight(sys.argv)
ADMIN_TOKEN = None
STUDENT_TOKEN = None

DAY_A, DAY_B = 98, 99
NAME_A = '导入自检讲义A（可删）'
NAME_B = '导入自检讲义B（可删）'

TMP = tempfile.mkdtemp(prefix='eq_gimp_')

# --------------------------------------------------------------- 造测试文件

# 只填 6 个必需列（最省事的写法）
CSV_BASIC = (
    '题干,选项A,选项B,选项C,选项D,正确答案\n'
    'He is good ______ English.,at,in,on,for,B\n'
    'I have lived here ______ 2010.,for,since,in,from,B\n'
    'She asked me ______ I had finished the work.,that,if,what,which,B\n'
)

# 带「天数」列，且四种写法混在一起（一份文件同时导入多天）
CSV_WITH_DAY = (
    '天数,题干,选项A,选项B,选项C,选项D,正确答案\n'
    f'{DAY_B},I ______ him yesterday.,see,saw,seen,seeing,B\n'
    f'Day {DAY_A},He ______ to school every day.,go,goes,going,gone,B\n'
    f'第{DAY_A}天,There ______ some milk in the glass.,is,are,be,were,A\n'
    f'{NAME_B},They are interested ______ music.,in,on,at,for,A\n'
)

# 题干里带英文逗号（必须被引号包住，考验 CSV 解析器）
CSV_QUOTED = (
    '题干,选项A,选项B,选项C,选项D,正确答案\n'
    '"Well, ______ you like it.",do,does,did,doing,A\n'
)

# 表头带空格 / 全角写法，考验归一化（末列故意写成"/"这种单字符选项）
CSV_MESSY_HEADER = (
    '  题干 ,  选项A  ,选项B,选项C,选项D,正确答案\n'
    'This is ______ book.,a,an,the,/,A\n'
)

TAB_SEP = '题干\t选项A\t选项B\t选项C\t选项D\t正确答案\nIt ______ raining now.\tis\tare\tbe\twere\tA\n'

# 逐类错误行（这几行必须**全部**被拦下，一行都不能入库）
CSV_ERRORS = (
    '题干,选项A,选项B,选项C,选项D,正确答案\n'
    ',at,in,on,for,B\n'                    # 题干为空
    'Missing option C.,at,in,,for,B\n'     # 缺选项 C
    'Missing B and D.,at,,on,,B\n'         # 缺选项 B、D
    'No answer.,at,in,on,for,\n'           # 答案为空
    'Bad letter.,at,in,on,for,E\n'         # 答案非 A~D
)

# 认不出的天数（单独一份，便于精准断言）
CSV_BAD_DAY = (
    '天数,题干,选项A,选项B,选项C,选项D,正确答案\n'
    'Day 500,Unknown day.,at,in,on,for,B\n'
)

# 题型列写了"填空"（系统目前只支持单选）
CSV_BAD_TYPE = (
    '题型,题干,选项A,选项B,选项C,选项D,正确答案\n'
    '填空,Type not supported.,at,in,on,for,B\n'
)

# 大小写去重：题干只有大小写/空格差异
CSV_CASE = (
    '题干,选项A,选项B,选项C,选项D,正确答案\n'
    'he is good at english ,at,in,on,for,B\n'
    '  He Is Good At English  ,at,in,on,for,C\n'
)

# 清理用：中途异常时靠它兜底，保证不把临时 Day 留在真实数据里
CREATED_IDS = []


def force_cleanup():
    """兜底清理：不依赖 API（也不需要"只能删最后一天"这条规则），直接按 id 删干净"""
    ids = [i for i in CREATED_IDS if i]
    if not ids:
        return
    inlist = ','.join(str(i) for i in ids)
    U.sql(f'DELETE FROM t_grammar_question WHERE lesson_id IN ({inlist})')
    U.sql(f'DELETE FROM t_grammar_lesson WHERE id IN ({inlist})')


def write(name, data, encoding=None):
    p = os.path.join(TMP, name)
    with open(p, 'wb') as f:
        f.write(data.encode(encoding) if encoding else data)
    return p


def read(name):
    with open(os.path.join(TMP, name), 'rb') as f:
        return f.read()


def make_xlsx():
    """用 openpyxl 造一个 xlsx：两行落到两个不同的 Day，一行留空天数"""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.append(['天数', '题干', '选项A', '选项B', '选项C', '选项D', '正确答案', '知识点', '解析'])
    ws.append([DAY_B, 'Xlsx row one ______.', 'at', 'in', 'on', 'for', 'B', '', ''])
    ws.append([f'Day {DAY_A}', 'Xlsx row two ______.', 'at', 'in', 'on', 'for', 'C', '自检考点', '手写解析'])
    ws.append(['', 'Xlsx row three ______.', 'at', 'in', 'on', 'for', 'D', '', ''])
    p = os.path.join(TMP, 'mix.xlsx')
    wb.save(p)
    return p


# --------------------------------------------------------------- 主流程

def main():
    global ADMIN_TOKEN, STUDENT_TOKEN
    print('=' * 68)
    print('语法题库批量导入回归')
    print('=' * 68)

    ADMIN_TOKEN = U.login(U.ADMIN, U.ADMIN_PWD)
    STUDENT_TOKEN = U.login(U.STUDENT, U.STUDENT_PWD)
    U.check('管理员登录', bool(ADMIN_TOKEN))
    U.check('学生登录（用于越权测试）', bool(STUDENT_TOKEN))
    if not ADMIN_TOKEN:
        return

    # ---------- 建两个临时 Day ----------
    existing_max = int(U.q1('SELECT IFNULL(MAX(day_no),0) FROM t_grammar_lesson'))
    U.check(f'可用的临时 Day 序号（{DAY_A}/{DAY_B}）没被真实数据占用',
            existing_max < DAY_A, f'库里最大 day_no = {existing_max}')
    if existing_max >= DAY_A:
        print('  [!!] 临时 Day 序号被占用，终止')
        return

    for day, name in ((DAY_A, NAME_A), (DAY_B, NAME_B)):
        _, r = U.http('POST', '/api/admin/grammar/lessons', ADMIN_TOKEN, {
            'dayNo': day, 'title': name, 'stage': '导入自检',
            'mode': '学习', 'content': '[]', 'questionCount': 3, 'passScore': 60
        })
        if r.get('code') != 200:
            print(f'  [!!] 临时 Day {day} 创建失败：{r}')
            return
    _, r = U.http('GET', '/api/admin/grammar/lessons', ADMIN_TOKEN)
    by_title = {x['title']: x for x in (r.get('data') or [])}
    lesson_a = by_title.get(NAME_A, {}).get('id')
    lesson_b = by_title.get(NAME_B, {}).get('id')
    CREATED_IDS.extend([x for x in (lesson_a, lesson_b) if x])   # 尽早登记，异常时也能清掉
    if not lesson_a or not lesson_b:
        print('  [!!] 临时 Day 查不到，终止')
        return
    print(f'  临时 Day：A(dayNo={DAY_A}, id={lesson_a})  B(dayNo={DAY_B}, id={lesson_b})')

    base_total = U.q1('SELECT COUNT(*) FROM t_grammar_question')
    base_in_temp = U.q1(f'SELECT COUNT(*) FROM t_grammar_question WHERE lesson_id IN ({lesson_a},{lesson_b})')
    print(f'  开跑前：题库共 {base_total} 题，临时 Day 里 {base_in_temp} 题')

    def imp(filename, content, ctype, dry=True, lesson=None, timeout=60):
        q = f'?lessonId={lesson if lesson is not None else lesson_a}&dryRun={"true" if dry else "false"}'
        return U.post_file('/api/admin/grammar/import' + q, ADMIN_TOKEN, filename, content, ctype, timeout)

    # ============================================================ A. 鉴权与参数
    U.section('A. 鉴权与参数校验')
    # 未登录必须直接构造请求：不能借封装好的 imp()（它固定带 admin_token，
    # 会把"未登录"悄悄变成"已登录"——词汇脚本第一版就踩过这个）
    st, r = U.post_file(f'/api/admin/grammar/import?lessonId={lesson_a}&dryRun=true', None,
                        'a.csv', CSV_BASIC.encode('utf-8'), 'text/csv')
    U.check('未登录 -> 401', st == 401 or (isinstance(r, dict) and r.get('code') == 401), f'{st} {r}')

    st, r = U.post_file(f'/api/admin/grammar/import?lessonId={lesson_a}&dryRun=true', STUDENT_TOKEN,
                        'a.csv', CSV_BASIC.encode('utf-8'), 'text/csv')
    U.check('学生 token 越权 -> 403', st == 403 or (isinstance(r, dict) and r.get('code') == 403), f'{st} {r}')

    st, r = U.post_file('/api/admin/grammar/import?dryRun=true', ADMIN_TOKEN,
                        'a.csv', CSV_BASIC.encode('utf-8'), 'text/csv')
    U.check('缺 lessonId -> 400（不是 500 系统繁忙）', r.get('code') == 400, f'{st} {r}')
    U.check('缺 lessonId 的提示点名了参数名', 'lessonId' in str(r.get('msg')), r.get('msg'))

    st, r = imp('a.csv', b'', 'text/csv')
    U.check('空文件 -> 400', r.get('code') == 400, f'{st} {r}')

    st, r = imp('a.csv', CSV_BASIC.encode('utf-8'), 'text/csv', lesson=999999)
    U.check('Day 不存在 -> 400 且提示可读',
            r.get('code') == 400 and 'Day' in str(r.get('msg')), f'{st} {r}')

    st, r = imp('a.png', b'\x89PNG\r\n\x1a\n whatever', 'image/png')
    U.check('不支持的扩展名 -> 400', r.get('code') == 400 and 'xlsx' in str(r.get('msg')), f'{st} {r}')

    st, r = imp('noheader.csv', '甲,乙\n丙,丁\n'.encode('utf-8'), 'text/csv')
    U.check('表头缺列 -> 400', r.get('code') == 400, f'{st} {r}')
    U.check('缺列表头提示点名了列名',
            '题干' in str(r.get('msg')) and '正确答案' in str(r.get('msg')), r.get('msg'))

    # ============================================================ B. CSV 解析
    U.section('B. CSV 解析（编码 / 分隔符 / 引号）')
    st, r = imp('basic_bom.csv', ('\ufeff' + CSV_BASIC).encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    U.check('UTF-8 BOM csv 解析出 3 行', d.get('total') == 3, d)
    U.check('dryRun 标记为真', d.get('dryRun') is True)
    U.check('3 行都可导入', d.get('insertable') == 3, d)
    U.check('无失败行', d.get('failed') == 0, d.get('errors'))

    st, r = imp('basic_gbk.csv', CSV_BASIC.encode('gbk'), 'text/csv')
    d = r.get('data') or {}
    pv = (d.get('preview') or [{}])[0]
    U.check('GBK csv 能解析出 3 行', d.get('total') == 3, d)
    U.check('GBK 中文被正确还原（无乱码）',
            pv.get('stem') == 'He is good ______ English.',
            pv.get('stem'))

    st, r = imp('quoted.csv', CSV_QUOTED.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    pv = (d.get('preview') or [{}])[0]
    U.check('题干里带逗号的引号字段被完整解析', pv.get('stem') == 'Well, ______ you like it.', pv)
    U.check('引号字段后面的列没有错位', d.get('failed') == 0 and pv.get('answer') == 'A', pv)

    st, r = imp('tab.txt', TAB_SEP.encode('utf-8'), 'text/plain')
    d = r.get('data') or {}
    U.check('制表符分隔的文件被正确嗅探', d.get('total') == 1 and d.get('failed') == 0, d)

    st, r = imp('messy.csv', CSV_MESSY_HEADER.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    U.check('表头带空格/全角也能识别', d.get('total') == 1 and d.get('failed') == 0, d)

    # ============================================================ C. 天数解析
    U.section('C. 「天数」列解析（本功能与词汇导入最大的差异）')
    st, r = imp('basic_bom.csv', ('\ufeff' + CSV_BASIC).encode('utf-8'), 'text/csv', lesson=lesson_a)
    d = r.get('data') or {}
    rows = d.get('preview') or []
    U.check('没有「天数」列时全部落到所选 Day',
            rows and all(x.get('dayNo') == DAY_A for x in rows), [x.get('dayNo') for x in rows])
    U.check('预览里说明了"沿用所选 Day"',
            any('沿用所选 Day' in (x.get('note') or '') for x in rows),
            [x.get('note') for x in rows])

    st, r = imp('withday.csv', CSV_WITH_DAY.encode('utf-8'), 'text/csv', lesson=lesson_a)
    d = r.get('data') or {}
    rows = {x['stem']: x for x in (d.get('preview') or [])}
    U.check('一份文件解析出 4 行', d.get('total') == 4, d)
    U.check('4 行全部可导入', d.get('insertable') == 4 and d.get('failed') == 0, d.get('errors'))
    U.check('天数列写纯序号能解析', rows.get('I ______ him yesterday.', {}).get('dayNo') == DAY_B,
            rows.get('I ______ him yesterday.'))
    U.check('天数列写「Day N」能解析',
            rows.get('He ______ to school every day.', {}).get('dayNo') == DAY_A,
            rows.get('He ______ to school every day.'))
    U.check('天数列写「第N天」能解析',
            rows.get('There ______ some milk in the glass.', {}).get('dayNo') == DAY_A,
            rows.get('There ______ some milk in the glass.'))
    U.check('天数列写讲义标题能解析',
            rows.get('They are interested ______ music.', {}).get('dayNo') == DAY_B,
            rows.get('They are interested ______ music.'))
    U.check('识别出这份文件涉及 2 个 Day', d.get('lessonCount') == 2, d.get('lessonCount'))
    U.check('预览里带上了所属讲义标题',
            all(x.get('lessonTitle') in (NAME_A, NAME_B) for x in (d.get('preview') or [])),
            [x.get('lessonTitle') for x in (d.get('preview') or [])])

    st, r = imp('badday.csv', CSV_BAD_DAY.encode('utf-8'), 'text/csv', lesson=lesson_a)
    d = r.get('data') or {}
    errs = {e['rowNo']: e['message'] for e in (d.get('errors') or [])}
    U.check('认不出的天数被拦下（不会静默落到默认 Day）',
            d.get('insertable') == 0 and d.get('failed') == 1, d)
    U.check('认不出的天数给出了可读原因',
            '找不到对应的 Day' in errs.get(2, '') and 'Day 500' in errs.get(2, ''), errs.get(2))

    # ============================================================ D. 逐行校验
    U.section('D. 逐行校验（选项必须填全 / 答案 / 题型）')
    st, r = imp('errors.csv', CSV_ERRORS.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    errs = {e['rowNo']: e['message'] for e in (d.get('errors') or [])}
    U.check('题干为空被拦', '题干' in errs.get(2, ''), errs.get(2))
    U.check('缺选项 C 被拦且点名 C',
            '选项 C' in errs.get(3, '') and '全部填写' in errs.get(3, ''), errs.get(3))
    U.check('同时缺 B、D 时两个都点名',
            '选项 B、D' in errs.get(4, ''), errs.get(4))
    U.check('答案为空被拦', '正确答案' in errs.get(5, ''), errs.get(5))
    U.check('答案不是 A~D 被拦', 'A/B/C/D' in errs.get(6, ''), errs.get(6))
    U.check('这一批里没有一行能入库', d.get('insertable') == 0, d)

    st, r = imp('badtype.csv', CSV_BAD_TYPE.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    errs = {e['rowNo']: e['message'] for e in (d.get('errors') or [])}
    U.check('题型列写了「填空」被拦下（系统只支持单选）',
            d.get('failed') == 1 and '只支持单选' in errs.get(2, ''), errs.get(2))

    st, r = imp('lower.csv',
                ('题干,选项A,选项B,选项C,选项D,正确答案\nLower case answer.,at,in,on,for,b\n').encode('utf-8'),
                'text/csv')
    d = r.get('data') or {}
    U.check('答案小写 b 被归一成大写 B',
            (d.get('preview') or [{}])[0].get('answer') == 'B', (d.get('preview') or [{}])[0])

    # ============================================================ E. 兜底
    U.section('E. 知识点 / 解析 的兜底')
    st, r = imp('withday.csv', CSV_WITH_DAY.encode('utf-8'), 'text/csv', lesson=lesson_a)
    d = r.get('data') or {}
    rows = {x['stem']: x for x in (d.get('preview') or [])}
    U.check('知识点留空时按该 Day 的讲义标题补全',
            rows.get('I ______ him yesterday.', {}).get('knowledgePoint') == NAME_B,
            rows.get('I ______ him yesterday.', {}).get('knowledgePoint'))
    U.check('补全知识点时在备注里说明了',
            '讲义标题' in (rows.get('I ______ him yesterday.', {}).get('note') or ''),
            rows.get('I ______ him yesterday.').get('note'))
    U.check('解析留空时补了一句兜底文案',
            '本题考查' in (rows.get('I ______ him yesterday.', {}).get('analysis') or ''),
            rows.get('I ______ him yesterday.', {}).get('analysis'))

    st, r = imp('hand.csv',
                ('题干,选项A,选项B,选项C,选项D,正确答案,知识点,解析\n'
                 'Handwritten.,at,in,on,for,B,手写考点,这是我手写的解析。\n').encode('utf-8'),
                'text/csv')
    d = r.get('data') or {}
    pv = (d.get('preview') or [{}])[0]
    U.check('手写的知识点与解析被原样保留',
            pv.get('knowledgePoint') == '手写考点' and pv.get('analysis') == '这是我手写的解析。', pv)

    # ============================================================ F. XLSX
    U.section('F. XLSX 解析')
    xlsx = make_xlsx()
    st, r = imp('mix.xlsx', open(xlsx, 'rb').read(),
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', lesson=lesson_a)
    d = r.get('data') or {}
    rows = {x['stem']: x for x in (d.get('preview') or [])}
    U.check('xlsx 解析出 3 行', d.get('total') == 3, d)
    U.check('xlsx 三行全部可导入', d.get('insertable') == 3, d.get('errors'))
    U.check('xlsx 里的天数列同样生效',
            rows.get('Xlsx row one ______.', {}).get('dayNo') == DAY_B
            and rows.get('Xlsx row two ______.', {}).get('dayNo') == DAY_A, [x.get('dayNo') for x in rows.values()])
    U.check('xlsx 里留空天数的行落到所选 Day',
            rows.get('Xlsx row three ______.', {}).get('dayNo') == DAY_A,
            rows.get('Xlsx row three ______.'))

    # ============================================================ G. 上限
    U.section('G. 规模上限')
    big = ('题干,选项A,选项B,选项C,选项D,正确答案\n'
           + ''.join(f'Stem {i} ______.,at,in,on,for,B\n' for i in range(501)))
    st, r = imp('big.csv', big.encode('utf-8'), 'text/csv')
    U.check('501 行 -> 400', r.get('code') == 400, f'{st} {r}')
    U.check('超限提示里写了 500', '500' in str(r.get('msg')), r.get('msg'))

    # ============================================================ H. 写库
    U.section('H. dryRun 不写库 / 真导入写库 / 去重')
    cnt_now = U.q1(f'SELECT COUNT(*) FROM t_grammar_question WHERE lesson_id IN ({lesson_a},{lesson_b})')
    U.check('预览（dryRun）没有写库', cnt_now == '0', cnt_now)

    st, r = imp('withday.csv', CSV_WITH_DAY.encode('utf-8'), 'text/csv', dry=False, lesson=lesson_a)
    d = r.get('data') or {}
    U.check('真导入写入 4 条', d.get('inserted') == 4, d)
    U.check('这 4 条按天分到了两个 Day',
            U.q1(f'SELECT COUNT(*) FROM t_grammar_question WHERE lesson_id={lesson_a}') == '2'
            and U.q1(f'SELECT COUNT(*) FROM t_grammar_question WHERE lesson_id={lesson_b}') == '2',
            (U.q1(f'SELECT COUNT(*) FROM t_grammar_question WHERE lesson_id={lesson_a}'),
             U.q1(f'SELECT COUNT(*) FROM t_grammar_question WHERE lesson_id={lesson_b}')))
    U.check('落库的题状态为启用',
            U.q1(f'SELECT COUNT(*) FROM t_grammar_question WHERE lesson_id IN ({lesson_a},{lesson_b}) AND status=1') == '4')
    U.check('落库的题题型都是 CHOICE',
            U.q1(f"SELECT COUNT(*) FROM t_grammar_question WHERE lesson_id IN ({lesson_a},{lesson_b}) AND type='CHOICE'") == '4')
    U.check('知识点确实按讲义标题写进了库',
            U.q1(f"SELECT knowledge_point FROM t_grammar_question WHERE lesson_id={lesson_b} LIMIT 1") == NAME_B,
            U.q1(f"SELECT knowledge_point FROM t_grammar_question WHERE lesson_id={lesson_b} LIMIT 1"))
    U.check('解析兜底文案也进了库',
            '本题考查' in U.q1(f"SELECT analysis FROM t_grammar_question WHERE lesson_id={lesson_b} LIMIT 1"),
            U.q1(f"SELECT analysis FROM t_grammar_question WHERE lesson_id={lesson_b} LIMIT 1"))

    st, r = imp('withday.csv', CSV_WITH_DAY.encode('utf-8'), 'text/csv', dry=False, lesson=lesson_a)
    d = r.get('data') or {}
    U.check('同一份文件再导一次 -> 4 条全部按"已存在"跳过',
            d.get('inserted') == 0 and d.get('skipped') == 4, d)
    U.check('跳过原因写清了是同一天里已有',
            '已经有这道题了' in str((d.get('skippedRows') or [{}])[0].get('message')), d.get('skippedRows'))

    st, r = imp('case.csv', CSV_CASE.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    U.check('同一天里题干只有大小写/空格差异也算重复（只留第一条）',
            d.get('insertable') == 1 and d.get('skipped') == 1, d)

    # ============================================================ I. 后台列表
    U.section('I. 导入结果在后台列表可见')
    _, r = U.http('GET', f'/api/admin/grammar/questions?pageNum=1&pageSize=50&lessonId={lesson_b}', ADMIN_TOKEN)
    lst = (r.get('data') or {}).get('list') or []
    U.check('按 Day 过滤能查到导入的题', len(lst) == 2, len(lst))
    U.check('查到的题选项与答案完整',
            all(x.get('optionA') and x.get('optionD') and x.get('answer') in 'ABCD' for x in lst),
            [(x.get('stem'), x.get('answer')) for x in lst])

    # ============================================================ 清理
    U.section('清理临时数据')
    U.sql(f'DELETE FROM t_grammar_question WHERE lesson_id IN ({lesson_a},{lesson_b})')
    U.check('临时 Day 下的题目已清空',
            U.q1(f'SELECT COUNT(*) FROM t_grammar_question WHERE lesson_id IN ({lesson_a},{lesson_b})') == '0')
    # ★ 必须倒序删：语法 Day 只允许删"最后一天"，先删 99 才能删 98
    st, r = U.http('DELETE', f'/api/admin/grammar/lessons/{lesson_b}', ADMIN_TOKEN)
    U.check('倒序删除临时 Day B（dayNo=99）', r.get('code') == 200, r)
    st, r = U.http('DELETE', f'/api/admin/grammar/lessons/{lesson_a}', ADMIN_TOKEN)
    U.check('再删除临时 Day A（dayNo=98）', r.get('code') == 200, r)
    U.check('讲义表里也没留下这两条',
            U.q1(f'SELECT COUNT(*) FROM t_grammar_lesson WHERE id IN ({lesson_a},{lesson_b})') == '0')
    now_total = U.q1('SELECT COUNT(*) FROM t_grammar_question')
    U.check('题库总题数回到开跑前（没有误写进别的 Day）', now_total == base_total,
            f'{base_total} -> {now_total}')
    U.check('讲义总数回到 28',
            U.q1('SELECT COUNT(*) FROM t_grammar_lesson') == '28',
            U.q1('SELECT COUNT(*) FROM t_grammar_lesson'))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        import traceback
        # 一律打到 stdout：stderr 无缓冲会插到整个输出的最前面，
        # 一旦被 tail/head 截断就只剩"1 项失败"而看不到真因（本站踩过）。
        print(f'未捕获异常：{e!r}')
        traceback.print_exc(file=sys.stdout)
        U.failed += 1
    finally:
        # 无论成功、断言失败还是抛异常，都保证不把临时 Day 留在真实数据里
        force_cleanup()
        shutil.rmtree(TMP, ignore_errors=True)
    print(U.summary())
    sys.exit(U.exit_code())
