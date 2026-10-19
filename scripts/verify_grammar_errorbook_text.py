#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
校验「错题本里的语法题显示答案内容而不是 A/B/C/D」。

覆盖三条路径：
  1. 旧记录：库里遗留的字母记录，读取时被就地翻译成选项内容（且不回写库）
  2. 重练：输入选项内容判对；输入字母也判对；输入错误内容判错
  3. 新写入：走一遍真实答题，错题本里存的直接就是选项内容

卫生：全程只用 student 自己的数据；答题环节刻意挑「已经通过的关卡」，
      全选错也不会把成绩改低；结束时把造出来的错题/学习记录删干净。

用法：python scripts/verify_grammar_errorbook_text.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import eq_util as U  # noqa: E402

STU_ID = "(SELECT id FROM t_user WHERE username='student')"
LETTERS = list('ABCD')

U.section('准备')
token = U.login(U.STUDENT, U.STUDENT_PWD)
U.check('学生登录成功', bool(token))

# 挑一个「已经通过且带题」的关卡：全选错也不会覆盖已有成绩
row = U.q1(
    "SELECT q.id, q.lesson_id, l.day_no, q.answer, q.option_a, q.option_b, q.option_c, q.option_d "
    "FROM t_grammar_question q "
    "JOIN t_grammar_lesson l ON l.id = q.lesson_id "
    "JOIN t_user_lesson ul ON ul.lesson_id = l.id AND ul.user_id = %s "
    "WHERE q.type='CHOICE' AND ul.score >= l.pass_score "
    "ORDER BY q.id LIMIT 1" % STU_ID)
if not row:
    U.check('存在已通过的语法关卡（用于无损测试）', False, '查不到，先跑一遍语法关卡')
    print(U.summary())
    sys.exit(U.exit_code())

p = row.strip().split('\t')
qid, lesson_id, day = int(p[0]), int(p[1]), int(p[2])
answer = p[3].strip().upper()
opts = {k: p[i].strip() for i, k in zip(range(4, 8), LETTERS)}
correct_text = opts[answer]
wrong_key = next(k for k in LETTERS if k != answer)
wrong_text = opts[wrong_key]
print(f'  题目 qid={qid} 第{day}天 正确答案={answer}. {correct_text} / 错答={wrong_key}. {wrong_text}')

# ---------------------------------------------------------------- 路径 1
U.section('路径 1 · 历史字母记录的读时翻译')
U.sql("DELETE FROM t_error_book WHERE user_id=%s AND module='GRAMMAR' AND question_id=%d"
      % (STU_ID, qid))
U.sql("INSERT INTO t_error_book (user_id, module, question_id, knowledge_point, stem, "
      "correct_answer, wrong_answer, analysis, wrong_times, status, create_time, update_time) "
      "SELECT id, 'GRAMMAR', %d, '测试考点', 'legacy stem', '%s', '%s', '测试解析', 1, 0, NOW(), NOW() "
      "FROM t_user WHERE username='student'" % (qid, answer, wrong_key))

eid = int(U.q1("SELECT id FROM t_error_book WHERE user_id=%s AND module='GRAMMAR' "
               "AND question_id=%d ORDER BY id DESC LIMIT 1" % (STU_ID, qid)))
U.check('插入了一条字母版的历史错题', eid > 0, f'id={eid}')

_, resp = U.http('GET', '/api/error-book/list?module=GRAMMAR', token=token)
items = (resp or {}).get('data') or []
target = next((x for x in items if x.get('id') == eid), None)
U.check('列表接口返回这条记录', target is not None, f'共 {len(items)} 条')

if target:
    got_c, got_w = target.get('correctAnswer'), target.get('wrongAnswer')
    U.check('正确答案由字母翻成选项内容', got_c == correct_text, f'{got_c!r} 期望 {correct_text!r}')
    U.check('错答由字母翻成选项内容', got_w == wrong_text, f'{got_w!r} 期望 {wrong_text!r}')
    U.check('列表里不再出现裸字母', got_c not in LETTERS and got_w not in LETTERS)

stored = U.q1("SELECT correct_answer FROM t_error_book WHERE id=%d" % eid).strip()
U.check('读时翻译没有偷偷回写数据库', stored.upper() == answer, f'库内={stored!r}')

# ---------------------------------------------------------------- 路径 2
U.section('路径 2 · 重练按内容比对')
U.sql("UPDATE t_error_book SET status=0 WHERE id=%d" % eid)
_, r1 = U.http('POST', '/api/error-book/%d/retry' % eid, token=token,
               body={'userAnswer': correct_text})
U.check('输入选项内容 → 判对', ((r1 or {}).get('data') or {}).get('correct') is True, f'resp={r1}')

after = U.q1("SELECT correct_answer FROM t_error_book WHERE id=%d" % eid).strip()
U.check('答对后库里顺带自愈成文本', after == correct_text, f'库内={after!r}')

U.sql("UPDATE t_error_book SET status=0 WHERE id=%d" % eid)
_, r2 = U.http('POST', '/api/error-book/%d/retry' % eid, token=token,
               body={'userAnswer': answer})
U.check('输入字母 → 也判对（兼容老习惯）',
        ((r2 or {}).get('data') or {}).get('correct') is True, f'resp={r2}')

U.sql("UPDATE t_error_book SET status=0 WHERE id=%d" % eid)
_, r3 = U.http('POST', '/api/error-book/%d/retry' % eid, token=token,
               body={'userAnswer': 'definitely-wrong-answer'})
U.check('输入错误内容 → 判错',
        ((r3 or {}).get('data') or {}).get('correct') is False, f'resp={r3}')

wa = U.q1("SELECT wrong_answer FROM t_error_book WHERE id=%d" % eid).strip()
U.check('答错后存下来的错答是文本不是字母', wa == 'definitely-wrong-answer', f'库内={wa!r}')

U.sql("DELETE FROM t_error_book WHERE id=%d" % eid)

# ---------------------------------------------------------------- 路径 3
U.section('路径 3 · 答题时写入的就是选项内容')
qs = U.sql("SELECT id, answer FROM t_grammar_question WHERE lesson_id=%d AND status=1 LIMIT 5"
           % lesson_id)
rows = [ln.split('\t') for ln in (qs or '').splitlines() if ln.strip()]
answers = [{'questionId': int(r[0]), 'userAnswer': next(k for k in LETTERS if k != r[1].strip().upper())}
           for r in rows]
qids = [a['questionId'] for a in answers]

_, sub = U.http('POST', '/api/grammar/lessons/%d/submit' % day, token=token,
                body={'answers': answers, 'costTime': 30})
U.check('提交语法测验（故意全选错）', (sub or {}).get('code') == 200, f'resp code={(sub or {}).get("code")}')

if qids:
    w = U.q1("SELECT q.answer, e.correct_answer, e.wrong_answer "
             "FROM t_error_book e JOIN t_grammar_question q ON q.id = e.question_id "
             "WHERE e.user_id=%s AND e.module='GRAMMAR' AND e.question_id=%d "
             "ORDER BY e.id DESC LIMIT 1" % (STU_ID, qids[0]))
    if w:
        cols = w.strip().split('\t')
        letter, ca, wa = cols[0].strip(), cols[1].strip(), cols[2].strip()
        U.check('新记录的正确答案是选项内容',
                ca not in LETTERS and len(ca) > 1, f'correct_answer={ca!r} 题面字母={letter}')
        U.check('新记录的错答是选项内容',
                wa not in LETTERS and len(wa) > 1, f'wrong_answer={wa!r}')
    else:
        U.check('新写入的错题记录存在', False, '未查到')

# ---------------------------------------------------------------- 清理
U.section('清理测试数据')
ids = ','.join(str(q) for q in qids) or '0'
U.sql("DELETE FROM t_error_book WHERE user_id=%s AND module='GRAMMAR' AND question_id IN (%s)"
      % (STU_ID, ids))
U.sql("DELETE FROM t_study_record WHERE user_id=%s AND module='GRAMMAR' AND question_id IN (%s)"
      % (STU_ID, ids))
left = U.q1("SELECT COUNT(*) FROM t_error_book WHERE user_id=%s AND knowledge_point='测试考点'"
            % STU_ID).strip()
U.check('临时错题已清空', left in ('0', ''), f'残留 {left} 条')

print(U.summary())
sys.exit(U.exit_code())
