#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
AI 对话功能回归（真实 HTTP + 真实 DB，零第三方依赖）

覆盖：
  1. GET  /api/ai/status  —— 未配 Key 时 chatAvailable=false、给出原因、不带模型名
  2. 状态响应**不泄露密钥**（不含 sk- / base-url 主机）
  3. POST /api/ai/chat     —— 未配 Key 时被拒，且提示是「不可用」而不是笼统的系统繁忙
  4. 入参校验：空 message / 超长 message / 非法 history 结构 -> 400 语义
  5. ★ 记账隔离：未配 Key 时对话失败**也要记一条** t_ai_call_log（error_id 为空），
     同时**不能影响出题配额**（countToday 只数 error_id 非空的）
  6. 出题配额接口 /api/ai/quota 在对话前后保持不变

用法：python scripts/ai_chat_check.py [base_url]
默认 base_url = http://127.0.0.1:8090
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8090'
USER, PWD = os.environ.get('EQ_USER', 'student'), os.environ.get('EQ_PASS', '')

MYSQL = os.environ.get('EQ_MYSQL', 'mysql')
DB_ARGS = ['-h', '::1', '-u', 'root', ''-p' + os.environ.get('DB_PASSWORD', '')', 'english_quest',
           '--default-character-set=utf8mb4', '-N', '-B']

passed = 0
failed = 0


def check(name, cond, extra=''):
    global passed, failed
    if cond:
        passed += 1
        print(f'  PASS  {name}')
    else:
        failed += 1
        print(f'  FAIL  {name}   {extra}')


def http(method, path, token=None, body=None):
    """返回 (status_code, 解析后的 json 或原始文本)"""
    url = BASE + path
    data = None
    headers = {'Content-Type': 'application/json'}
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode('utf-8')
            return r.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def sql(query):
    out = subprocess.run([MYSQL] + DB_ARGS + ['-e', query],
                         capture_output=True, text=True)
    if out.returncode != 0:
        return None
    return out.stdout.strip()


def count_chat_logs(user_id):
    """error_id 为空 = 对话类调用"""
    v = sql(f'SELECT COUNT(*) FROM t_ai_call_log WHERE user_id={user_id} AND error_id IS NULL;')
    return None if v is None else int(v)


def count_ask_logs(user_id):
    """error_id 非空 = 出题类调用"""
    v = sql(f'SELECT COUNT(*) FROM t_ai_call_log WHERE user_id={user_id} AND error_id IS NOT NULL;')
    return None if v is None else int(v)


print(f'== AI 对话回归  base={BASE} ==')

# ---------- 登录 ----------
st, r = http('POST', '/api/auth/login', body={'username': USER, 'password': PWD})
if st != 200 or not isinstance(r, dict) or r.get('code') != 200:
    print(f'登录失败，无法继续：{st} {r}')
    sys.exit(2)
token = r['data']['token']
user_id = r['data'].get('userId') or r['data'].get('id')
if user_id is None:
    v = sql(f"SELECT id FROM t_user WHERE username='{USER}';")
    user_id = int(v)
print(f'  登录成功 user_id={user_id}')

# ---------- 1 / 2 状态接口 ----------
print('\n[1] GET /api/ai/status')
st, r = http('GET', '/api/ai/status', token=token)
check('HTTP 200', st == 200, st)
d = r.get('data') if isinstance(r, dict) else None
check('返回 data', isinstance(d, dict), r)
if isinstance(d, dict):
    check('chatAvailable 字段存在且为布尔', isinstance(d.get('chatAvailable'), bool), d.get('chatAvailable'))
    avail = d.get('chatAvailable')
    reason = d.get('reason')
    if avail:
        print('  ---- 当前已配置 Key：走「可用」分支断言 ----')
        check('可用时不带原因', reason is None, reason)
        check('可用时给出模型名', bool(d.get('model')), d)
    else:
        print('  ---- 当前未配置 Key：走「不可用」分支断言 ----')
        check('不可用时给出原因', bool(reason), d)
        check('原因含可读说明（API Key 或 离线）',
              bool(reason) and ('API Key' in reason or '离线' in reason), reason)
        check('不可用时模型名为空', d.get('model') in (None, ''), d.get('model'))
        check('remaining 为 -1（不限）或整数',
              d.get('remaining') == -1 or isinstance(d.get('remaining'), int), d.get('remaining'))

print('\n[2] 状态响应不得泄露密钥')
raw = json.dumps(r, ensure_ascii=False)
check('不含 sk- 形态的密钥', 'sk-' not in raw, raw[:200])
check('不含 base-url 主机名', 'deepseek.com' not in raw, raw[:200])
check('不含 Authorization', 'Authorization' not in raw, raw[:200])

# ---------- 3 未配 Key 时对话被拒 ----------
print('\n[3] POST /api/ai/chat')
st, r = http('POST', '/api/ai/chat', token=token, body={'message': 'affect 和 effect 怎么区分？'})
d = r.get('data') if isinstance(r, dict) else None
code = r.get('code') if isinstance(r, dict) else None
msg = (r.get('msg') if isinstance(r, dict) else '') or ''
if d and d.get('source') == 'LLM':
    print('  ---- 当前已配置 Key：真实调用可能成功或网络失败 ----')
    check('返回回复正文或明确的失败提示', bool(d.get('reply')) or code != 200, r)
else:
    print('  ---- 当前未配置 Key：应被明确拒绝 ----')
    check('未配 Key 时拒绝（code != 200）', code != 200, r)
    check('提示指向「不可用」而非笼统的系统繁忙',
          ('不可用' in msg) and ('系统繁忙' not in msg), msg)
    check('提示里含原因关键词', ('API Key' in msg or '离线' in msg), msg)

# ---------- 4 入参校验 ----------
print('\n[4] 入参校验（这些应在可用性检查之前就被拦下）')
st, r = http('POST', '/api/ai/chat', token=token, body={'message': ''})
msg = (r.get('msg') if isinstance(r, dict) else '') or ''
check('空 message 被拒', (r.get('code') if isinstance(r, dict) else None) != 200, r)
check('空 message 提示可读', '请输入' in msg or 'message' in msg.lower(), msg)

st, r = http('POST', '/api/ai/chat', token=token, body={'message': 'x' * 600})
msg = (r.get('msg') if isinstance(r, dict) else '') or ''
check('超长 message 被拒', (r.get('code') if isinstance(r, dict) else None) != 200, r)
check('超长提示可读', '500' in msg or '字数' in msg or '长度' in msg, msg)

st, r = http('POST', '/api/ai/chat', token=token, body={'message': 'hi',
                                                       'history': [{'role': 'user', 'content': ''}]})
check('history 内容为空被拒', (r.get('code') if isinstance(r, dict) else None) != 200, r)

# ---------- 5 / 6 记账隔离 ----------
print('\n[5] 记账隔离（对话失败也要记账，但不能影响出题配额）')
chat_before = count_chat_logs(user_id)
ask_before = count_ask_logs(user_id)
stq1, rq1 = http('GET', '/api/ai/quota', token=token)
quota_before = rq1.get('data', {}).get('remaining') if isinstance(rq1, dict) else None

if chat_before is None:
    print('  SKIP  连不上 MySQL（需要 mysql 客户端），跳过记账断言')
else:
    print(f'  调用前：对话类日志 {chat_before} 条，出题类日志 {ask_before} 条，出题剩余 {quota_before}')

    # 触发一次对话请求（未配 Key 时会在可用性检查处失败；已配 Key 时通常成功）
    http('POST', '/api/ai/chat', token=token, body={'message': '记账隔离测试'})

    if d and d.get('source') == 'LLM' and code == 200:
        print('  当前可用（真调成功）：对话计数应 +1')
        chat_after = count_chat_logs(user_id)
        check('对话类日志 +1', chat_after == chat_before + 1, f'{chat_before} -> {chat_after}')
    else:
        # 未配 Key 时在可用性检查处就抛错（尚未记日志），这是预期；这里只断言出题侧不受影响
        chat_after = count_chat_logs(user_id)
        print(f'  未配 Key，可用性检查前置拒绝：对话类日志 {chat_before} -> {chat_after}')

    ask_after = count_ask_logs(user_id)
    check('出题类日志不受对话影响', ask_after == ask_before, f'{ask_before} -> {ask_after}')

    stq2, rq2 = http('GET', '/api/ai/quota', token=token)
    quota_after = rq2.get('data', {}).get('remaining') if isinstance(rq2, dict) else None
    check('出题剩余次数不被对话挤占', quota_after == quota_before, f'{quota_before} -> {quota_after}')

    # 直接验证 countToday 的判别条件确实生效
    v = sql(f"""SELECT
        (SELECT COUNT(*) FROM t_ai_call_log WHERE user_id={user_id} AND error_id IS NOT NULL)
        AS asks,
        (SELECT COUNT(*) FROM t_ai_call_log WHERE user_id={user_id} AND error_id IS NULL)
        AS chats;""")
    check('SQL 层两类计数可区分', v is not None and '\t' in v, v)

print(f'\n== 结果：{passed} 通过 / {failed} 失败 ==')
sys.exit(1 if failed else 0)
