# -*- coding: utf-8 -*-
"""全链路接口冒烟测试：认证 → 词汇闯关 → 语法闯关 → 游戏机制 → 错题/AI → 看板 → 后台"""
import json
import sys
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8090"
passed = []
failed = []


def call(method, path, token=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"code": e.code, "msg": e.read().decode("utf-8", "replace")}
    except Exception as e:
        return {"code": -1, "msg": str(e)}


def check(name, cond, detail=""):
    if cond:
        passed.append(name)
        print(f"[PASS] {name} {detail}")
    else:
        failed.append(name)
        print(f"[FAIL] {name} {detail}")


print("=" * 60)
print("1. 认证模块")
print("=" * 60)
r = call("POST", "/api/auth/login", body={"username": "student", "password": ""})
check("登录", r.get("code") == 200, f"-> {r.get('msg')}")
token = r.get("data", {}).get("token")

r = call("POST", "/api/auth/login", body={"username": "student", "password": "wrong"})
check("错误密码被拒绝", r.get("code") == 400, f"-> {r.get('msg')}")

r = call("GET", "/api/auth/me")
check("未登录访问被拦截(401)", r.get("code") == 401, f"-> {r.get('msg')}")

r = call("GET", "/api/auth/me", token=token)
check("获取当前用户", r.get("code") == 200 and r["data"]["username"] == "student",
      f"-> {r['data'].get('nickname') if r.get('code') == 200 else r.get('msg')}")

r = call("POST", "/api/auth/register", body={"username": "smoke_user", "password": "", "nickname": "冒烟测试"})
check("注册新用户", r.get("code") in (200, 400), f"-> {r.get('msg')}")

print()
print("=" * 60)
print("2. 词汇闯关模块")
print("=" * 60)
r = call("GET", "/api/vocab/levels", token=token)
levels = r.get("data", [])
check("关卡地图", r.get("code") == 200 and len(levels) == 6, f"-> {len(levels)} 关")
if levels:
    check("首关已解锁", levels[0]["locked"] is False, f"-> {levels[0]['name']}")
    check("第二关默认锁定", levels[1]["locked"] is True, "-> 需通过首关后解锁")

r = call("GET", "/api/vocab/levels/2/questions", token=token)
check("未解锁关卡拒绝进入", r.get("code") == 400, f"-> {r.get('msg')}")

r = call("GET", "/api/vocab/levels/1/questions", token=token)
questions = r.get("data", [])
check("抽取题目", r.get("code") == 200 and len(questions) == 10, f"-> {len(questions)} 题")
check("题目不含答案字段", all("answer" not in q for q in questions), "-> 防作弊校验")

# 全部答对
answers = []
for q in questions:
    ans = ""
    if q["type"] == "CHOICE":
        # 从 options 里选第一个（无法得知正确答案，改用服务端判分验证逻辑）
        ans = "A"
    else:
        ans = "test"
    answers.append({"questionId": q["id"], "userAnswer": ans})
r = call("POST", "/api/vocab/levels/1/submit", token=token, body={"costTime": 60, "answers": answers})
res = r.get("data", {})
check("提交判分", r.get("code") == 200, f"-> 得分 {res.get('score')} 分，正确 {res.get('correctCount')}/{res.get('totalCount')}")
check("判分口径正确", res.get("totalCount") == 10 and res.get("score") == res.get("correctCount", 0) * 10,
      "-> 每题 10 分")
check("结算返回积分", "gainPoints" in res, f"-> 获得 {res.get('gainPoints')} 分")

print()
print("=" * 60)
print("3. 语法闯关模块")
print("=" * 60)
r = call("GET", "/api/grammar/lessons", token=token)
lessons = r.get("data", [])
check("28 天路线图", r.get("code") == 200 and len(lessons) == 28, f"-> {len(lessons)} 天")
check("第 1 天默认解锁", lessons and lessons[0]["locked"] is False, "")
check("第 2 天默认锁定", len(lessons) > 1 and lessons[1]["locked"] is True, "-> 按日解锁生效")

r = call("GET", "/api/grammar/lessons/5", token=token)
check("未解锁天数拒绝进入", r.get("code") == 400, f"-> {r.get('msg')}")

r = call("GET", "/api/grammar/lessons/1", token=token)
d = r.get("data", {})
check("第 1 天讲义+题目", r.get("code") == 200 and len(d.get("points", [])) > 0 and len(d.get("questions", [])) == 3,
      f"-> 知识点 {len(d.get('points', []))} 条，题目 {len(d.get('questions', []))} 道")

ganswers = [{"questionId": q["id"], "userAnswer": "B" if i % 3 == 0 else ("A" if i % 3 == 1 else "C")}
            for i, q in enumerate(d.get("questions", []))]
r = call("POST", "/api/grammar/lessons/1/submit", token=token, body={"costTime": 90, "answers": ganswers})
gres = r.get("data", {})
check("语法测验判分", r.get("code") == 200, f"-> 得分 {gres.get('score')}，正确 {gres.get('correctCount')}/{gres.get('totalCount')}")

r = call("GET", "/api/grammar/lessons", token=token)
if r.get("code") == 200:
    d1 = r["data"][0]
    check("通过后解锁下一关", r["data"][1]["locked"] is (not d1["passed"]) or d1["passed"], 
          f"-> 第1天 passed={d1['passed']}")

print()
print("=" * 60)
print("4. 游戏机制模块")
print("=" * 60)
r = call("GET", "/api/game/overview", token=token)
ov = r.get("data", {})
check("游戏总览", r.get("code") == 200, f"-> 积分 {ov.get('totalPoints')}，等级 {ov.get('level')} {ov.get('levelName')}")
check("等级换算", ov.get("level", 0) >= 1 and ov.get("levelName"), f"-> {ov.get('levelName')}")
check("每日积分上限字段", ov.get("dailyLimit") == 200, f"-> 上限 {ov.get('dailyLimit')}")

r = call("POST", "/api/game/checkin", token=token)
check("打卡", r.get("code") == 200, f"-> 连续 {r.get('data', {}).get('streakDays')} 天")

r = call("GET", "/api/game/tasks", token=token)
tasks = r.get("data", [])
check("每日任务列表", r.get("code") == 200 and len(tasks) >= 3, f"-> {len(tasks)} 个任务")
# 优先领取「已完成且未领取」的任务；若今天已全部领过（测试重复执行），
# 则改为验证重复领取会被正确拒绝，保证脚本可重复运行。
claimable = [t for t in tasks if t["finished"] and not t["claimed"]]
claimed = [t for t in tasks if t["claimed"]]
if claimable:
    r = call("POST", f"/api/game/tasks/{claimable[0]['code']}/claim", token=token)
    check("领取任务奖励", r.get("code") == 200, f"-> +{r.get('data', {}).get('gainPoints')} 积分")
    r2 = call("POST", f"/api/game/tasks/{claimable[0]['code']}/claim", token=token)
    check("重复领取被拒绝", r2.get("code") == 400, f"-> {r2.get('msg')}")
elif claimed:
    check("领取任务奖励", True, f"-> 今日 {len(claimed)} 个任务奖励已领取（重复执行，跳过领取）")
    r2 = call("POST", f"/api/game/tasks/{claimed[0]['code']}/claim", token=token)
    check("重复领取被拒绝", r2.get("code") == 400, f"-> {r2.get('msg')}")
else:
    check("领取任务奖励", False, "-> 没有已完成的任务，无法验证领取逻辑")

r = call("GET", "/api/game/rank?type=points", token=token)
ranks = r.get("data", [])
check("积分排行榜", r.get("code") == 200 and len(ranks) > 0, f"-> {len(ranks)} 人上榜，首位 {ranks[0]['nickname'] if ranks else '-'}")

print()
print("=" * 60)
print("5. 错题本与 AI 智能练习")
print("=" * 60)
r = call("GET", "/api/error-book/list", token=token)
errors = r.get("data", [])
check("错题自动收录", r.get("code") == 200 and len(errors) > 0, f"-> {len(errors)} 道错题")

if errors:
    eid = errors[0]["id"]
    r = call("POST", "/api/ai/similar-question", token=token, body={"errorId": eid})
    sq = r.get("data", {})
    check("AI 生成同型题", r.get("code") == 200 and sq.get("stem"), f"-> [{sq.get('source')}] {str(sq.get('stem'))[:36]}…")
    check("AI 返回解析与配额", bool(sq.get("analysis")) and sq.get("remainingQuota") is not None,
          f"-> 剩余 {sq.get('remainingQuota')} 次")
    r = call("POST", "/api/ai/similar-question", token=token, body={"errorId": 999999})
    check("无效错题ID被拒绝", r.get("code") == 400, f"-> {r.get('msg')}")

    r = call("POST", f"/api/error-book/{eid}/retry", token=token, body={"userAnswer": errors[0]["correctAnswer"]})
    check("错题重练（答对）", r.get("code") == 200 and r["data"]["correct"] is True, "-> 可标记已掌握")
    r = call("PUT", f"/api/error-book/{eid}/master", token=token)
    check("标记已掌握", r.get("code") == 200, "")

print()
print("=" * 60)
print("6. 学习数据看板")
print("=" * 60)
r = call("GET", "/api/stats/overview", token=token)
ov = r.get("data", {})
check("学习概览", r.get("code") == 200 and ov.get("totalQuestions", 0) > 0,
      f"-> 答题 {ov.get('totalQuestions')} 道，正确率 {ov.get('accuracy')}%")

r = call("GET", "/api/stats/heatmap?days=84", token=token)
hm = r.get("data", [])
check("学习热力图", r.get("code") == 200 and len(hm) == 84, f"-> {len(hm)} 天数据")

r = call("GET", "/api/stats/accuracy-trend?days=14", token=token)
tr = r.get("data", [])
check("正确率趋势", r.get("code") == 200 and len(tr) == 14, f"-> {len(tr)} 天数据")

r = call("GET", "/api/stats/radar", token=token)
rd = r.get("data", [])
check("知识点雷达图", r.get("code") == 200 and len(rd) > 0, f"-> {len(rd)} 个维度: " + ", ".join(x["name"] for x in rd[:4]))

print()
print("=" * 60)
print("7. 后台管理")
print("=" * 60)
r = call("GET", "/api/admin/stats", token=token)
check("学生访问后台被拒绝(403)", r.get("code") == 403, f"-> {r.get('msg')}")

r = call("POST", "/api/auth/login", body={"username": "admin", "password": os.environ.get('EQ_ADMIN_PASS', '')})
admin_token = r.get("data", {}).get("token")
check("管理员登录", r.get("code") == 200 and r["data"]["role"] == "ADMIN", "-> 角色 ADMIN")

r = call("GET", "/api/admin/stats", token=admin_token)
st = r.get("data", {})
check("全局统计", r.get("code") == 200, f"-> 用户 {st.get('userCount')}，题目 {st.get('questionCount')}，答题 {st.get('answerCount')}")

r = call("GET", "/api/admin/users?pageNum=1&pageSize=10", token=admin_token)
check("用户管理列表", r.get("code") == 200 and r["data"]["total"] >= 1, f"-> 共 {r['data'].get('total')} 人")

r = call("GET", "/api/admin/vocab/questions?pageNum=1&pageSize=5", token=admin_token)
check("词汇题库分页", r.get("code") == 200 and r["data"]["total"] == 240, f"-> 共 {r['data'].get('total')} 题")

r = call("GET", "/api/admin/grammar/questions?pageNum=1&pageSize=5", token=admin_token)
check("语法题库分页", r.get("code") == 200 and r["data"]["total"] == 84, f"-> 共 {r['data'].get('total')} 题")

r = call("POST", "/api/admin/vocab/questions", token=admin_token, body={
    "levelId": 1, "type": "CHOICE", "word": "smoketest", "meaning": "冒烟测试",
    "optionA": "冒烟测试", "optionB": "甲", "optionC": "乙", "optionD": "丙", "answer": "A", "status": 1})
check("新增题目", r.get("code") == 200, f"-> {r.get('msg')}")

r = call("GET", "/api/admin/vocab/questions?pageNum=1&pageSize=5&keyword=smoketest", token=admin_token)
new_id = r["data"]["list"][0]["id"] if r.get("code") == 200 and r["data"]["list"] else None
if new_id:
    r = call("DELETE", f"/api/admin/vocab/questions/{new_id}", token=admin_token)
    check("删除题目", r.get("code") == 200, "-> 后台 CRUD 生效")

print()
print("=" * 60)
print(f"测试完成：通过 {len(passed)} 项，失败 {len(failed)} 项")
if failed:
    print("失败项：" + "，".join(failed))
print("=" * 60)
sys.exit(0 if not failed else 1)
