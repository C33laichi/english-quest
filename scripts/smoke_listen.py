# -*- coding: utf-8 -*-
"""
听力听写模块 接口冒烟测试

覆盖：
  1. 关卡列表（语料规模 / 进度字段）
  2. 简单模式抽句（下发 wordLens，且不含英文原文）
  3. 困难模式抽句（连 wordCount / wordLens 都不下发）
  4. 单句判分口径（全对 / 漏词 / 多词 / 大小写标点差异 / 空输入）
  5. 整关提交结算（重判分、积分、进度、逐句回顾）
  6. 放弃题目（revealed）不计分
  7. 错题本收录（module=LISTENING）
  8. 每日任务 LISTEN_COUNT 进度
  9. 未登录访问被拒

用法：python scripts/smoke_listen.py
前置：后端已在 8090 端口运行
"""
import datetime
import json
import subprocess
import sys
import urllib.error
import urllib.request

import eq_util as U

BASE = "http://127.0.0.1:8090/api"
MYSQL = U.MYSQL

passed = 0
failed = 0

# 重定向到文件时 Python 默认全缓冲，跑几分钟都不出字，很容易误判成卡死
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

# 本机设置了 http_proxy，本地请求必须绕开，否则会得到假 502
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
urllib.request.install_opener(opener)


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"[PASS] {name}" + (f"  -> {detail}" if detail else ""))
    else:
        failed += 1
        print(f"[FAIL] {name}" + (f"  -> {detail}" if detail else ""))


def call(method, path, token=None, body=None):
    url = BASE + path
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode("utf-8"))


def sql(query):
    """查库：连接参数统一走 eq_util。

    这里原先是裸的 `-p`，mysql 见不到密码值就会**交互式要密码** ——
    在脚本/CI 里没有终端，直接挂死（本机实测 8 分钟零输出）。
    顺带补上 `-h ::1`：本机 127.0.0.1:3306 被 VMware NAT 转发占着，直连报 2013。
    """
    out = subprocess.run(
        [MYSQL] + U.DB_ARGS + ["-e", query],
        capture_output=True, text=True, encoding="utf-8")
    rows = []
    for line in out.stdout.splitlines():
        if line.strip():
            rows.append(line.split("\t"))
    return rows


def main():
    global passed, failed

    print("=" * 60)
    print("听力听写模块 冒烟测试")
    print("=" * 60)

    # ---------- 登录 ----------
    r = call("POST", "/auth/login", body={"username": "student", "password": os.environ.get('EQ_PASS', '')})
    check("学生登录", r.get("code") == 200, r.get("msg", ""))
    if r.get("code") != 200:
        sys.exit(1)
    token = r["data"]["token"]

    # ---------- 1. 关卡列表 ----------
    r = call("GET", "/listen/levels", token)
    levels = r.get("data") or []
    check("听力关卡列表", r.get("code") == 200 and len(levels) == 6,
          f"{len(levels)} 个关卡")
    check("关卡含语料规模字段",
          all(l.get("bankSize") == 25 for l in levels),
          f"每关 {levels[0].get('bankSize') if levels else 0} 句")

    # ---------- 2. 简单模式抽句 ----------
    r = call("GET", "/listen/levels/1/sentences?mode=EASY", token)
    data = r.get("data") or {}
    easy_list = data.get("sentences") or []
    check("简单模式抽句", r.get("code") == 200 and len(easy_list) == 10,
          f"{len(easy_list)} 句")
    first = easy_list[0] if easy_list else {}
    check("简单模式下发长度提示",
          isinstance(first.get("wordLens"), list) and len(first["wordLens"]) > 0,
          f"wordLens={first.get('wordLens')}")
    check("简单模式不下发英文原文", "english" not in first)
    check("简单模式 WordLen 与词数一致",
          len(first.get("wordLens") or []) == first.get("wordCount"),
          f"{len(first.get('wordLens') or [])} vs {first.get('wordCount')}")

    # ---------- 3. 困难模式抽句 ----------
    r = call("GET", "/listen/levels/1/sentences?mode=HARD", token)
    hard_list = (r.get("data") or {}).get("sentences") or []
    hfirst = hard_list[0] if hard_list else {}
    check("困难模式抽句", r.get("code") == 200 and len(hard_list) == 10, f"{len(hard_list)} 句")
    check("困难模式不下发长度提示",
          hfirst.get("wordLens") is None and hfirst.get("wordCount") is None,
          f"wordLens={hfirst.get('wordLens')}, wordCount={hfirst.get('wordCount')}")
    check("困难模式不下发英文原文", "english" not in hfirst)

    # ---------- 4. 判分口径 ----------
    rows = sql("SELECT id, english FROM t_listen_sentence WHERE id = 1")
    truth = rows[0][1] if rows else "I like this food."
    words = truth.rstrip(".").split(" ")

    def do_check(answer):
        return call("POST", "/listen/check", token,
                    {"sentenceId": 1, "userAnswer": answer, "mode": "EASY"}).get("data") or {}

    c = do_check(truth)
    check("全对判分", c.get("correct") is True and c.get("score") == 10,
          f"正确={c.get('correct')} 得分={c.get('score')}")

    c = do_check(truth.lower().rstrip("."))
    check("忽略大小写与标点", c.get("correct") is True, f"正确={c.get('correct')}")

    c = do_check(" ".join(words[:-1]))
    check("漏词用 LCS 不连坐",
          c.get("matchedCount") == len(words) - 1 and c.get("correct") is False,
          f"匹配 {c.get('matchedCount')}/{c.get('totalWords')}，得分 {c.get('score')}")

    c = do_check("extra " + truth)
    check("多打词判为不正确",
          c.get("correct") is False and c.get("matchedCount") == len(words),
          f"匹配 {c.get('matchedCount')}/{c.get('totalWords')}，正确={c.get('correct')}")

    c = do_check("")
    check("空输入得 0 分", c.get("score") == 0 and c.get("correct") is False)

    c = do_check("totally wrong words here now")
    check("全错得 0 分", c.get("score") == 0, f"匹配 {c.get('matchedCount')}")

    check("判分返回逐词对照",
          isinstance(c.get("userWords"), list) and isinstance(c.get("answerWords"), list),
          f"userWords={len(c.get('userWords') or [])} 词")

    # ---------- 5. 整关提交 ----------
    r = call("GET", "/listen/levels/2/sentences?mode=EASY", token)
    sent = (r.get("data") or {}).get("sentences") or []
    ids = ",".join(str(s["id"]) for s in sent)
    truth_map = {int(a): b for a, b in sql(
        f"SELECT id, english FROM t_listen_sentence WHERE id IN ({ids})")}

    answers = []
    for i, s in enumerate(sent):
        en = truth_map.get(s["id"], "")
        if i < 7:
            ua, rev = en, False
        elif i == 7:
            ua, rev = " ".join(en.split()[:-1]), False   # 漏最后一个词
        elif i == 8:
            ua, rev = "nothing here at all", False       # 全错
        else:
            ua, rev = "", True                           # 放弃看答案
        answers.append({"sentenceId": s["id"], "userAnswer": ua,
                        "playedTimes": 2, "revealed": rev})

    r = call("POST", "/listen/levels/2/submit", token,
             {"mode": "EASY", "costTime": 120, "answers": answers})
    res = r.get("data") or {}
    check("整关提交结算", r.get("code") == 200, r.get("msg", ""))
    check("得分与全对句数", res.get("correctCount") == 7 and res.get("totalCount") == 10,
          f"全对 {res.get('correctCount')}/{res.get('totalCount')}，总分 {res.get('score')}")
    # 积分可能为 +0，但必须是「幂等保护」或「每日上限」导致的，不能是别的原因
    gain = res.get("gainPoints") or 0
    if gain > 0:
        check("积分发放", True, f"+{gain} 分")
    else:
        today = datetime.date.today().isoformat()
        biz_hit = int(sql(
            "SELECT COUNT(*) FROM t_point_log "
            f"WHERE biz_id = 'ans-LISTENING-EASY-2-{today}'")[0][0])
        today_answer = int(sql(
            "SELECT COALESCE(SUM(change_points),0) FROM t_point_log "
            "WHERE type = 'ANSWER' AND DATE(create_time) = CURDATE()")[0][0])
        if biz_hit > 0:
            check("积分幂等保护生效（同日同关卡只结算一次）", True, "已结算过，本次未重复发分")
        elif today_answer >= 100:
            check("积分上限保护生效", True, f"今日答题积分已达 {today_answer}/100")
        else:
            check("积分发放", False, "既非重复结算也未达上限，却未发分")
    check("逐句回顾", len(res.get("details") or []) == 10,
          f"{len(res.get('details') or [])} 条")
    rev_item = [d for d in (res.get("details") or []) if d.get("revealed")]
    check("放弃题按 0 分计", rev_item and rev_item[0].get("score") == 0,
          f"revealed 题得分 {rev_item[0].get('score') if rev_item else 'N/A'}")

    # ---------- 6. 进度落库 ----------
    rows = sql("SELECT score, stars, status FROM t_user_lesson "
               "WHERE module = 'LISTENING' AND lesson_id = 2")
    check("关卡进度落库", len(rows) == 1, f"score={rows[0][0]}, status={rows[0][2]}" if rows else "无记录")

    # ---------- 7. 错题本收录 ----------
    rows = sql("SELECT COUNT(*) FROM t_error_book WHERE module = 'LISTENING'")
    check("听力错题入错题本", int(rows[0][0]) >= 3, f"{rows[0][0]} 条")

    # ---------- 8. 每日任务 ----------
    r = call("GET", "/game/tasks", token)
    tasks = r.get("data") or []
    listen_task = [t for t in tasks if t.get("taskType") == "LISTEN_COUNT"]
    check("每日任务含听力项", len(listen_task) == 1,
          f"{listen_task[0].get('title')} 进度 {listen_task[0].get('progress')}/{listen_task[0].get('targetValue')}"
          if listen_task else "未找到")
    check("听力任务进度已累加",
          listen_task and listen_task[0].get("progress") >= 1,
          f"progress={listen_task[0].get('progress') if listen_task else 0}")

    # ---------- 9. 鉴权 ----------
    r = call("GET", "/listen/levels")
    check("未登录访问被拒", r.get("code") == 401, f"code={r.get('code')}")

    # ---------- 10. 参数校验 ----------
    r = call("POST", "/listen/check", token, {"userAnswer": "abc"})
    check("缺少句子ID被拒", r.get("code") == 400, r.get("msg", ""))

    r = call("GET", "/listen/levels/9999/sentences?mode=EASY", token)
    check("不存在的关卡被拒", r.get("code") == 400, r.get("msg", ""))

    print()
    print("=" * 60)
    print(f"通过 {passed} 项，失败 {failed} 项")
    print("=" * 60)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
