#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
词汇题库「批量导入」回归（真实 HTTP + 真实 DB）

设计要点：
  * 全程在**临时关卡**里跑，跑完把该关卡的题目与关卡本身都删掉，
    不污染真实题库（脚本末尾会断言库里没剩测试数据）。
  * 覆盖 CSV（UTF-8 BOM / GBK / 制表符 / 带引号含逗号）与 XLSX 两条解析路径。
  * 覆盖「选项留空自动生成」与「手填选项」两种用法，以及各自的错误分支。
  * dryRun 必须**不写库**，这是"先预览再确认"能成立的前提，单独断言。

用法：python scripts/vocab_import_check.py [base_url]
默认 base_url = http://127.0.0.1:8090
"""
import os
import shutil
import sys
import tempfile

import eq_util as U

# HTTP / multipart / MySQL / 断言 都走公共工具（与 grammar_import_check.py 同一份实现）
# 这里只做**局部别名**，下面所有调用点（check/http/post_file/sql/q1/login）保持原样
BASE = U.preflight(sys.argv)
ADMIN, ADMIN_PWD = U.ADMIN, U.ADMIN_PWD
STUDENT, STUDENT_PWD = U.STUDENT, U.STUDENT_PWD
LEVEL_NAME = '导入自检关卡（可删）'

check = U.check
http = U.http
post_file = U.post_file
sql = U.sql
q1 = U.q1
login = U.login

TMP = tempfile.mkdtemp(prefix='eq_import_')


# ================================================================= 造测试文件

# 只填「单词 + 中文释义」-> 选项由系统自动生成
CSV_BASIC = (
    '单词,中文释义\n'
    'nurture,培养；养育\n'
    'obscure,模糊的；费解的\n'
    'tremendous,巨大的；极好的\n'
)

# 释义里带英文逗号（必须被引号包住，考验 CSV 解析器）
CSV_QUOTED = (
    '单词,中文释义,音标\n'
    'vigilant,"警觉的,警惕的",/ˈvɪdʒɪlənt/\n'
)

# 12 行专门用来验证「正确项位置随机」。
# 为什么不用上面 3 行的那份：只有 3 题时，4 个位置全撞在一起的
# 概率是 4*(1/4)^3 = 6.25%，断言会以约 1/16 的概率偶发失败。
# 12 题时这个概率降到约 1e-7，才能当断言用。
CSV_RANDOM = (
    '单词,中文释义\n'
    'radiant,光芒四射的\n'
    'tedious,冗长乏味的\n'
    'vivid,生动的；鲜明的\n'
    'reluctant,不情愿的\n'
    'genuine,真正的；真诚的\n'
    'hollow,中空的；空洞的\n'
    'solemn,严肃的；庄重的\n'
    'brittle,易碎的；脆弱的\n'
    'modest,谦虚的；适度的\n'
    'fierce,凶猛的；激烈的\n'
    'vacant,空的；空缺的\n'
    'humble,谦逊的；卑微的\n'
)

# 表头带空格/全角写法，考验归一化
CSV_MESSY_HEADER = (
    '  单词 ,  中文释义  ,题型,正确答案\n'
    'pragmatic,务实的；实用的,单选,\n'
)

# 手填选项（正确答案那项文字 == 释义）
CSV_MANUAL = (
    '单词,中文释义,题型,选项A,选项B,选项C,选项D,正确答案\n'
    'arbitrary,任意的；武断的,单选,任意的；武断的,精确的；准确的,明显的；显然的,临时的；暂时的,A\n'
)

# 拼写题：不需要选项，答案固定为单词
CSV_SPELL = (
    '单词,中文释义,题型,正确答案\n'
    'concede,承认；让步,拼写,\n'
)

# 各种错误行
CSV_ERRORS = (
    '单词,中文释义,题型,选项A,选项B,选项C,选项D,正确答案\n'
    ',没有单词的释义,单选,,,,,\n'
    'silentword,,单选,,,,,\n'
    'badtype,某个释义,选择题abcd,,,,,\n'
    'partial,只填了一个选项,单选,任意的；武断的,,,,\n'
    'noanswer,填了选项没填答案,单选,填了选项没填答案,别的释义,第三个,第四个,\n'
    'badletter,答案写了E,单选,答案写了E,别的释义,第三个,第四个,E\n'
    'mismatch,正确答案对不上,单选,别的释义,别的释义二,别的释义三,别的释义四,A\n'
)

TAB_SEP = '单词\t中文释义\nubiquitous\t无处不在的\n'

LEVEL_SORT_NO = 99

# 会被写进库的测试词。判定"没残留"必须看**增量**而不是绝对值：
# 像 lucid / concede / verdict 这种专升本高频词，很可能本来就躺在真实题库里，
# 直接断言 COUNT(*)=0 会变成误报。
TEST_WORDS = ('nurture', 'obscure', 'tremendous', 'stagnant', 'tally',
              'lucid', 'concede', 'verdict')
TEST_WORDS_SQL = ','.join("'" + w + "'" for w in TEST_WORDS)


def make_xlsx():
    """用 openpyxl 造一个 xlsx：只填两列 / 填满选项 / 拼写题 混在一起"""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.append(['单词', '中文释义', '音标', '题型', '选项A', '选项B', '选项C', '选项D', '正确答案', '解析'])
    ws.append(['lucid', '清晰的；明白易懂的', '', '', '', '', '', '', '', ''])
    ws.append(['benevolent', '仁慈的；慈善的', '/bəˈnevələnt/', '单选',
               '仁慈的；慈善的', '暴躁的；易怒的', '沉默寡言的', '奢侈的；华丽的', 'A', ''])
    ws.append(['scrutinize', '仔细检查', '', '拼写', '', '', '', '', '', ''])
    p = os.path.join(TMP, 'mixed.xlsx')
    wb.save(p)
    return p


# ================================================================= 主流程

def main():
    print('=' * 68)
    print('词汇题库批量导入回归')
    print('=' * 68)

    admin_token = login(ADMIN, ADMIN_PWD)
    student_token = login(STUDENT, STUDENT_PWD)
    check('管理员登录', bool(admin_token))
    check('学生登录（用于越权测试）', bool(student_token))
    if not admin_token:
        return

    # ---------- 建临时关卡 ----------
    http('POST', '/api/admin/vocab/levels', admin_token, {
        'name': LEVEL_NAME, 'sortNo': LEVEL_SORT_NO, 'difficulty': 'BASIC',
        'questionCount': 10, 'passScore': 60, 'status': 1
    })
    _, r = http('GET', '/api/admin/vocab/levels', admin_token)
    lv = next((x for x in (r.get('data') or []) if x['name'] == LEVEL_NAME), None)
    if not lv:
        print('  [!!] 临时关卡创建失败，终止')
        return
    lid = lv['id']
    print(f'  临时关卡 id={lid}（脚本结束会删除）')

    base_cnt = int(q1(f'SELECT COUNT(*) FROM t_vocab_question WHERE level_id={lid}'))
    base_total = q1('SELECT COUNT(*) FROM t_vocab_question')
    base_word_cnt = q1(f'SELECT COUNT(*) FROM t_vocab_question WHERE word IN ({TEST_WORDS_SQL})')
    print(f'  开跑前：题库共 {base_total} 题，其中测试词 {base_word_cnt} 条')
    all_meanings = set(
        (sql('SELECT DISTINCT meaning FROM t_vocab_question WHERE status=1') or '').splitlines()
    )

    def imp(filename, content, ctype, dry=True, level=None, default_type=None):
        params = f'?levelId={level if level is not None else lid}&dryRun={"true" if dry else "false"}'
        if default_type:
            params += f'&defaultType={default_type}'
        return post_file('/api/admin/vocab/import' + params, admin_token, filename, content, ctype)

    # ============================================================ A. 鉴权与参数
    print('\n--- A. 鉴权与参数校验 ---')
    # 注意：这里必须直接调 post_file 并显式传 token=None。
    # 不能借用 imp() —— 它固定带 admin_token，那样"未登录"用例实际上是有身份的，
    # 会静默退化成一次正常的解析预览（本脚本第一版就踩了这个坑）。
    st, r = post_file(f'/api/admin/vocab/import?levelId={lid}&dryRun=true', None,
                      'a.csv', CSV_BASIC.encode(), 'text/csv')
    check('未登录 -> 401', st == 401 or (isinstance(r, dict) and r.get('code') == 401), f'{st} {r}')

    st, r = post_file(f'/api/admin/vocab/import?levelId={lid}&dryRun=true',
                      student_token, 'a.csv', CSV_BASIC.encode(), 'text/csv')
    check('学生 token 越权 -> 403', st == 403 or (isinstance(r, dict) and r.get('code') == 403), f'{st} {r}')

    st, r = post_file('/api/admin/vocab/import?dryRun=true', admin_token,
                      'a.csv', CSV_BASIC.encode(), 'text/csv')
    check('缺 levelId -> 400（不是 500 系统繁忙）', r.get('code') == 400, f'{st} {r}')
    check('缺 levelId 的提示点名了参数名', 'levelId' in str(r.get('msg')), r.get('msg'))

    st, r = post_file('/api/admin/vocab/import?levelId=abc&dryRun=true', admin_token,
                      'a.csv', CSV_BASIC.encode(), 'text/csv')
    check('levelId 传非数字 -> 400 且提示参数名',
          r.get('code') == 400 and 'levelId' in str(r.get('msg')), f'{st} {r}')

    st, r = imp('a.csv', b'', 'text/csv')
    check('空文件 -> 400', r.get('code') == 400, f'{st} {r}')

    st, r = imp('a.csv', CSV_BASIC.encode(), 'text/csv', level=999999)
    check('关卡不存在 -> 400', r.get('code') == 400 and '关卡' in str(r.get('msg')), f'{st} {r}')

    st, r = imp('a.pdf', b'%PDF-1.4 whatever', 'application/pdf')
    check('不支持的扩展名 -> 400', r.get('code') == 400 and 'xlsx' in str(r.get('msg')), f'{st} {r}')

    st, r = imp('noheader.csv', '甲,乙\n丙,丁\n'.encode(), 'text/csv')
    check('表头缺列 -> 400', r.get('code') == 400, f'{st} {r}')
    check('缺列表头提示点名了两列', '单词' in str(r.get('msg')) and '中文释义' in str(r.get('msg')), r.get('msg'))

    # ============================================================ B. CSV 解析
    print('\n--- B. CSV 解析（编码 / 分隔符 / 引号）---')
    st, r = imp('basic_bom.csv', ('\ufeff' + CSV_BASIC).encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    check('UTF-8 BOM csv 解析出 3 行', d.get('total') == 3, d)
    check('dryRun 标记为真', d.get('dryRun') is True)
    check('3 行都可导入', d.get('insertable') == 3, d)
    check('无失败行', d.get('failed') == 0, d.get('errors'))

    st, r = imp('basic_gbk.csv', CSV_BASIC.encode('gbk'), 'text/csv')
    d = r.get('data') or {}
    check('GBK csv 解析出 3 行', d.get('total') == 3, d)
    meanings = [x['meaning'] for x in (d.get('preview') or [])]
    check('GBK 中文被正确还原（无乱码）',
          '培养；养育' in meanings and not any('?' in m or '\ufffd' in m for m in meanings), meanings)

    st, r = imp('quoted.csv', CSV_QUOTED.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    pv = (d.get('preview') or [{}])[0]
    check('释义里带逗号的引号字段被完整解析', pv.get('meaning') == '警觉的,警惕的', pv)
    check('引号字段后面的列没有错位', d.get('failed') == 0, d.get('errors'))

    st, r = imp('tab.txt', TAB_SEP.encode('utf-8'), 'text/plain')
    d = r.get('data') or {}
    check('制表符分隔的文件被正确嗅探', d.get('total') == 1 and d.get('failed') == 0, d)

    st, r = imp('messy_header.csv', CSV_MESSY_HEADER.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    check('表头带空格/全角也能识别', d.get('total') == 1 and d.get('failed') == 0, d)

    # ============================================================ C. 自动生成选项
    print('\n--- C. 选项留空 -> 自动生成 ---')
    st, r = imp('basic_bom.csv', ('\ufeff' + CSV_BASIC).encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    rows = d.get('preview') or []
    check('自动生成标记为真', all(x.get('autoOptions') for x in rows), rows)
    ok_shape = True
    detail = ''
    for x in rows:
        opts = [x['optionA'], x['optionB'], x['optionC'], x['optionD']]
        if len(set(opts)) != 4:
            ok_shape, detail = False, f'{x["word"]} 选项有重复 {opts}'
            break
        if x['meaning'] not in opts:
            ok_shape, detail = False, f'{x["word"]} 选项里没有正确释义'
            break
        letter = x['answer']
        if not ('A' <= letter <= 'D'):
            ok_shape, detail = False, f'{x["word"]} 答案不是字母：{letter}'
            break
        idx = ord(letter) - ord('A')
        if opts[idx] != x['meaning']:
            ok_shape, detail = False, f'{x["word"]} 答案 {letter} 指向的选项与释义不一致'
            break
    check('每题 4 个互不相同的选项、且正确项位置与答案字母一致', ok_shape, detail)

    # 正确项位置是否随机：另取一份 12 行的文件。
    # 用上面那 3 行判断会以约 1/16 的概率偶发失败（4*(1/4)^3），不能当断言。
    st, r = imp('random.csv', CSV_RANDOM.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    rrows = d.get('preview') or []
    check('12 行样本全部可导入', d.get('insertable') == 12 and d.get('failed') == 0, d)
    rletters = {x['answer'] for x in rrows}
    check('正确项位置分散在多个字母上（不是固定 A / 固定 D）', len(rletters) >= 2, rletters)
    bad_shape = []
    for x in rrows:
        opts = (x['optionA'], x['optionB'], x['optionC'], x['optionD'])
        if (len(set(opts)) != 4
                or x['meaning'] not in opts
                or not ('A' <= x['answer'] <= 'D')
                or opts[ord(x['answer']) - ord('A')] != x['meaning']):
            bad_shape.append(x['word'])
    check('12 行样本的选项与答案全部自洽', not bad_shape, bad_shape)

    distractors = set()
    for x in rows:
        opts = [x['optionA'], x['optionB'], x['optionC'], x['optionD']]
        opts.remove(x['meaning'])
        distractors.update(opts)
    check('干扰项来自题库已有释义（不是凭空编的）',
          bool(distractors & all_meanings), list(distractors)[:4])

    # ============================================================ D. 手填选项
    print('\n--- D. 手填选项 ---')
    st, r = imp('manual.csv', CSV_MANUAL.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    pv = (d.get('preview') or [{}])[0]
    check('手填选项被原样保留（未走自动生成）',
          pv.get('autoOptions') is False and pv.get('optionB') == '精确的；准确的', pv)
    check('手填答案字母被保留', pv.get('answer') == 'A', pv)
    check('手填的那一行可导入', d.get('insertable') == 1, d)

    st, r = imp('spell.csv', CSV_SPELL.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    pv = (d.get('preview') or [{}])[0]
    check('拼写题答案 = 单词本身', pv.get('type') == 'SPELL' and pv.get('answer') == 'concede', pv)
    check('拼写题不带选项', not pv.get('optionA'), pv)

    # 拼写题填了别的答案 -> 按单词算，并在 note 里说明
    st, r = imp('spell.csv',
                ('单词,中文释义,题型,正确答案\nconcede,承认；让步,拼写,concedes\n').encode('utf-8'),
                'text/csv')
    d = r.get('data') or {}
    pv = (d.get('preview') or [{}])[0]
    check('拼写题强行填了别的答案 -> 以单词为准且带提示',
          pv.get('answer') == 'concede' and '固定为单词本身' in (pv.get('note') or ''), pv)

    # ============================================================ E. 错误行
    print('\n--- E. 错误行逐类拦截 ---')
    st, r = imp('errors.csv', CSV_ERRORS.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    msgs = {e['rowNo']: e['message'] for e in (d.get('errors') or [])}
    check('7 行全部被拦下（一行都没入库）', d.get('insertable') == 0 and d.get('failed') == 7, d)
    check('单词为空被拦', '单词' in msgs.get(2, ''), msgs.get(2))
    check('释义为空被拦', '释义' in msgs.get(3, ''), msgs.get(3))
    check('题型无法识别被拦', '题型' in msgs.get(4, ''), msgs.get(4))
    check('选项只填一部分被拦', '4 个都填' in msgs.get(5, ''), msgs.get(5))
    check('填了选项却没填答案被拦', '正确答案' in msgs.get(6, ''), msgs.get(6))
    check('答案不是 A~D 被拦', 'A/B/C/D' in msgs.get(7, ''), msgs.get(7))
    check('答案项文字与释义不一致被拦', '不一致' in msgs.get(8, ''), msgs.get(8))

    # ============================================================ F. XLSX
    print('\n--- F. XLSX 解析 ---')
    xlsx = make_xlsx()
    st, r = imp('mixed.xlsx', open(xlsx, 'rb').read(),
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    d = r.get('data') or {}
    check('xlsx 解析出 3 行', d.get('total') == 3, d)
    check('xlsx 三行全部可导入', d.get('insertable') == 3, d)
    types = [x['type'] for x in (d.get('preview') or [])]
    check('xlsx 里三种写法各按自己的方式处理', types == ['CHOICE', 'CHOICE', 'SPELL'], types)
    xlsx_pv = {x['word']: x for x in (d.get('preview') or [])}
    check('xlsx 自动生成的那题正确', xlsx_pv['lucid'].get('autoOptions') is True, xlsx_pv.get('lucid'))
    check('xlsx 手填的那题答案正确', xlsx_pv['benevolent'].get('answer') == 'A', xlsx_pv.get('benevolent'))

    # ============================================================ G. 规模与超限
    print('\n--- G. 规模上限 ---')
    big = '单词,中文释义\n' + ''.join(f'word{i},释义{i}\n' for i in range(501))
    st, r = imp('big.csv', big.encode('utf-8'), 'text/csv')
    check('501 行 -> 400', r.get('code') == 400, f'{st} {r}')
    check('超限提示里写了 500', '500' in str(r.get('msg')), r.get('msg'))

    # ============================================================ H. dryRun 不写库
    print('\n--- H. dryRun 不写库 / 真导入写库 ---')
    cnt_after_preview = int(q1(f'SELECT COUNT(*) FROM t_vocab_question WHERE level_id={lid}'))
    check('预览（dryRun）没有写库', cnt_after_preview == base_cnt,
          f'{base_cnt} -> {cnt_after_preview}')

    st, r = imp('basic_bom.csv', ('\ufeff' + CSV_BASIC).encode('utf-8'), 'text/csv', dry=False)
    d = r.get('data') or {}
    check('真导入写入 3 条', d.get('inserted') == 3, d)
    cnt = int(q1(f'SELECT COUNT(*) FROM t_vocab_question WHERE level_id={lid}'))
    check('库里确实多了 3 条', cnt == base_cnt + 3, f'{base_cnt} -> {cnt}')
    check('导入的行状态为启用', q1(f'SELECT COUNT(*) FROM t_vocab_question WHERE level_id={lid} AND status=1') == str(cnt))
    check('没填解析时自动补了解析文案',
          '注意与形近词' in q1(f"SELECT analysis FROM t_vocab_question WHERE level_id={lid} AND word='nurture'"),
          q1(f"SELECT analysis FROM t_vocab_question WHERE level_id={lid} AND word='nurture'"))
    check('没填音标列时，题目的音标留空（不是空字符串）',
          q1(f"SELECT COUNT(*) FROM t_vocab_question WHERE level_id={lid} AND phonetic IS NOT NULL") == '0',
          '本次文件没有音标列，应全为 NULL')

    # 同文件再导一次 -> 全部跳过
    st, r = imp('basic_bom.csv', ('\ufeff' + CSV_BASIC).encode('utf-8'), 'text/csv', dry=False)
    d = r.get('data') or {}
    check('重复导入同一文件 -> 全部跳过', d.get('inserted') == 0 and d.get('skipped') == 3, d)
    check('跳过原因写清了"已存在"', '已存在' in str((d.get('skippedRows') or [{}])[0].get('message')),
          d.get('skippedRows'))

    # 文件内重复：故意用一个**还没进过库**的词。
    # 若沿用上面已真导入的 nurture，两行都会因"关卡里已存在"被跳过（skipped=2），
    # 就测不出"文件内重复"这条分支了。
    dup = '单词,中文释义\nstagnant,停滞的；不流动的\nstagnant,停滞的；不流动的\n'
    st, r = imp('dup.csv', dup.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    check('文件内重复只保留第一条', d.get('insertable') == 1 and d.get('skipped') == 1, d)
    check('文件内重复的跳过原因写清了"只保留第一条"',
          '只保留第一条' in str((d.get('skippedRows') or [{}])[0].get('message')), d.get('skippedRows'))

    dup2 = '单词,中文释义\ntally,记录；计数\nTALLY,记录；计数\n'
    st, r = imp('dup2.csv', dup2.encode('utf-8'), 'text/csv')
    d = r.get('data') or {}
    check('去重不区分大小写', d.get('insertable') == 1 and d.get('skipped') == 1, d)

    # ============================================================ I. 默认题型
    print('\n--- I. 默认题型参数 ---')
    st, r = imp('basic_bom.csv', ('单词,中文释义\nverdict,裁决；定论\n').encode('utf-8'),
                'text/csv', default_type='SPELL')
    d = r.get('data') or {}
    pv = (d.get('preview') or [{}])[0]
    check('题型列留空时按 defaultType 走', pv.get('type') == 'SPELL' and pv.get('answer') == 'verdict', pv)

    st, r = imp('basic_bom.csv', CSV_BASIC.encode('utf-8'), 'text/csv', default_type='XXX')
    check('非法 defaultType -> 400', r.get('code') == 400, f'{st} {r}')

    # ============================================================ J. 后台列表能看到
    print('\n--- J. 导入结果在后台列表可见 ---')
    _, r = http('GET', f'/api/admin/vocab/questions?pageNum=1&pageSize=100&levelId={lid}', admin_token)
    lst = (r.get('data') or {}).get('list') or []
    check('后台题目列表能查到导入的题', any(x['word'] == 'nurture' for x in lst), len(lst))
    nur = next((x for x in lst if x['word'] == 'nurture'), {})
    check('选项确实是 4 个且包含正确释义',
          nur.get('meaning') in [nur.get('optionA'), nur.get('optionB'), nur.get('optionC'), nur.get('optionD')],
          nur)

    # ============================================================ 清理
    print('\n--- 清理临时数据 ---')
    sql(f'DELETE FROM t_vocab_question WHERE level_id={lid}')
    left_q = q1(f'SELECT COUNT(*) FROM t_vocab_question WHERE level_id={lid}')
    st, r = http('DELETE', f'/api/admin/vocab/levels/{lid}', admin_token)
    check('临时关卡的题目已清空', left_q == '0', left_q)
    check('临时关卡已删除', r.get('code') == 200, r)
    check('关卡表里也没留下这条', q1(f'SELECT COUNT(*) FROM t_vocab_level WHERE id={lid}') == '0')
    now_word_cnt = q1(f'SELECT COUNT(*) FROM t_vocab_question WHERE word IN ({TEST_WORDS_SQL})')
    check('题库里没有残留的测试题目（与开跑前一致）', now_word_cnt == base_word_cnt,
          f'开跑前 {base_word_cnt} -> 现在 {now_word_cnt}')
    now_total = q1('SELECT COUNT(*) FROM t_vocab_question')
    check('题库总题数回到开跑前', now_total == base_total, f'{base_total} -> {now_total}')

    print(U.summary())


if __name__ == '__main__':
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        U.failed += 1
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    print(U.summary())
    sys.exit(U.exit_code())
