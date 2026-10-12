# -*- coding: utf-8 -*-
"""听力逐关解锁 端到端验证（真实 HTTP + 真实 DB）。

覆盖：
  1. 关卡列表的 locked 计算（含「已通过关卡永久开放」）
  2. 锁定关卡：抽句接口 400、提交接口 400
  3. 达标后解锁下一关（真实提交满分 → 下一关由锁定变可进入）
"""
import sys, io, json, urllib.request, urllib.error, subprocess

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
BASE = "http://127.0.0.1:8090/api"
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
PASSED = FAILED = 0


def check(name, cond, detail=""):
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print("  ✓ %s" % name)
    else:
        FAILED += 1
        print("  ✗ %s   %s" % (name, detail))


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with OPENER.open(req, data, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def sql(q):
    out = subprocess.run(
        ["mysql", "--protocol=TCP", "-h::1", "-uroot", "-p",
         "--default-character-set=utf8mb4", "english_quest", "-N", "-B", "-e", q],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    return [l.split("\t") for l in out.stdout.strip().splitlines() if l.strip()]


print("=" * 62)
print("听力听写 · 逐关解锁 端到端验证")
print("=" * 62)

# ---------- 登录 ----------
st, r = call("POST", "/auth/login", body={"username": "student", "password": os.environ.get('EQ_PASS', '')})
check("学生登录", st == 200 and r.get("code") == 200, r)
TOKEN = r["data"]["token"]
UID = r["data"]["userId"]

# ---------- 清场：把听力进度重置为「第1关30分未过、第2关80分已过」 ----------
sql("DELETE FROM t_user_lesson WHERE module='LISTENING' AND user_id=%d;" % UID)
sql("INSERT INTO t_user_lesson (user_id,lesson_id,module,score,pass_score,stars,correct_cnt,total_cnt,status,finish_time) "
    "VALUES (%d,1,'LISTENING',30,70,0,3,10,'UNLOCKED',NOW());" % UID)
sql("INSERT INTO t_user_lesson (user_id,lesson_id,module,score,pass_score,stars,correct_cnt,total_cnt,status,finish_time) "
    "VALUES (%d,2,'LISTENING',80,70,2,8,10,'PASSED',NOW());" % UID)

print("\n[场景] 第 1 关 30 分（未达 70）· 第 2 关 80 分（已通过）· 第 3~6 关无记录")
st, r = call("GET", "/listen/levels", TOKEN)
check("关卡列表接口成功", st == 200 and r.get("code") == 200, r)
levels = r["data"]
for lv in levels:
    print("     第 %d 关 %-6s  best=%-3s passed=%-5s locked=%s"
          % (lv["sortNo"], lv["name"], lv["bestScore"], lv["passed"], lv["locked"]))

by = {lv["sortNo"]: lv for lv in levels}
check("第 1 关解锁（首关默认开放）", by[1]["locked"] is False)
check("第 2 关解锁（已通过则永久开放，不受上一关拖累）",
      by[2]["locked"] is False, "locked=%s" % by[2]["locked"])
check("第 3 关解锁（上一关已通过）", by[3]["locked"] is False)
check("第 4 关锁定（上一关未通过）", by[4]["locked"] is True)
check("第 5 关锁定（连锁锁定）", by[5]["locked"] is True)
check("第 6 关锁定（连锁锁定）", by[6]["locked"] is True)

# ---------- 锁定关卡：接口必须拒绝 ----------
print("\n[场景] 直接请求第 4 关（锁定）")
st, r = call("GET", "/listen/levels/4/sentences?mode=EASY", TOKEN)
check("抽句接口被拒绝（400）", st == 400 or r.get("code") == 400, (st, r))
check("拒绝原因指向上一关「校园学习」", "校园学习" in (r.get("msg") or ""), r.get("msg"))
print("     提示文案: %s" % r.get("msg"))

st, r = call("POST", "/listen/levels/4/submit", TOKEN,
             {"mode": "EASY", "costTime": 60, "answers": [{"sentenceId": 1, "userAnswer": "x"}]})
check("提交接口同样被拒绝（绕过前端也拦得住）", st == 400 or r.get("code") == 400, (st, r))

# ---------- 达标解锁：把第 3 关做成满分 ----------
print("\n[场景] 完成第 3 关并达到及格分 65")
st, r = call("GET", "/listen/levels/3/sentences?mode=EASY", TOKEN)
check("第 3 关抽句成功", st == 200 and r.get("code") == 200, r)
ids = [s["id"] for s in r["data"]["sentences"]]
print("     抽到 %d 句" % len(ids))
answers = []
for sid in ids:
    eng = sql("SELECT english FROM t_listen_sentence WHERE id=%d;" % sid)[0][0]
    answers.append({"sentenceId": sid, "userAnswer": eng, "revealed": False})
st, r = call("POST", "/listen/levels/3/submit", TOKEN,
             {"mode": "EASY", "costTime": 120, "answers": answers})
check("第 3 关提交成功", st == 200 and r.get("code") == 200, r)
res = r["data"]
print("     得分 %s / 及格 %s / 通过 %s / 解锁下一关 %s"
      % (res["score"], res["passScore"], res["passed"], res["unlockNext"]))
check("全部答对得满分", res["score"] == 100, res["score"])
check("判定为通过", res["passed"] is True)
check("返回 unlockNext=true", res["unlockNext"] is True)

st, r = call("GET", "/listen/levels", TOKEN)
by2 = {lv["sortNo"]: lv for lv in r["data"]}
check("第 4 关由锁定变为可进入", by2[4]["locked"] is False,
      "locked=%s" % by2[4]["locked"])
check("第 5 关仍锁定（只解锁下一关）", by2[5]["locked"] is True)
st, r = call("GET", "/listen/levels/4/sentences?mode=EASY", TOKEN)
check("第 4 关现在可以抽句了", st == 200 and r.get("code") == 200, r)

# ---------- 恢复现场 ----------
sql("DELETE FROM t_user_lesson WHERE module='LISTENING' AND user_id=%d;" % UID)
sql("INSERT INTO t_user_lesson (user_id,lesson_id,module,score,pass_score,stars,correct_cnt,total_cnt,status,finish_time) "
    "VALUES (%d,1,'LISTENING',30,70,0,3,10,'UNLOCKED',NOW());" % UID)
sql("INSERT INTO t_user_lesson (user_id,lesson_id,module,score,pass_score,stars,correct_cnt,total_cnt,status,finish_time) "
    "VALUES (%d,2,'LISTENING',80,70,2,8,10,'PASSED',NOW());" % UID)
print("\n（已恢复测试前的进度数据）")

print("\n" + "=" * 62)
print("通过 %d / 失败 %d" % (PASSED, FAILED))
print("=" * 62)
sys.exit(1 if FAILED else 0)
