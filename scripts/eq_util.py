#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
导入类回归脚本的公共小工具（零第三方依赖）。

词汇导入（vocab_import_check.py）与语法导入（grammar_import_check.py）共用这一份：
HTTP、手工拼 multipart、直连 MySQL 取值、以及带计数的断言。

刻意不依赖 requests：本机没有装，而且手工拼 multipart 只有十来行，
为一次上传去装一个包不划算（HTTPError 分支照样能拿到业务错误码）。

用法：
    import eq_util as U
    U.configure('http://127.0.0.1:8090')      # 可选，默认 8090
    st, r = U.http('POST', '/api/auth/login', body={...})
    U.check('xxx', cond, 'extra')
    print(U.summary())
"""

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

BASE = 'http://127.0.0.1:8090'
ADMIN, ADMIN_PWD = os.environ.get('EQ_USER', 'admin'), os.environ.get('EQ_ADMIN_PASS', '')
STUDENT, STUDENT_PWD = os.environ.get('EQ_USER', 'student'), os.environ.get('EQ_PASS', '')

MYSQL = os.environ.get('EQ_MYSQL', 'mysql')
DB = 'english_quest'
DB_ARGS = ['-h', '::1', '-u', 'root', ''-p' + os.environ.get('DB_PASSWORD', '')', DB,
           '--default-character-set=utf8mb4', '-N', '-B']

passed = 0
failed = 0
failures = []


# ================================================================= 配置与断言

def configure(base=None):
    global BASE
    if base:
        BASE = base.rstrip('/')
    return BASE


def check(name, cond, extra=''):
    global passed, failed
    if cond:
        passed += 1
        print(f'  PASS  {name}')
    else:
        failed += 1
        failures.append(name)
        print(f'  FAIL  {name}   {extra}')


def section(title):
    print(f'\n--- {title} ---')


def summary():
    line = '=' * 68
    return (f'\n{line}\n{passed} 项通过 / {failed} 项失败'
            + ('  ——  全部通过' if failed == 0 else f'\n失败项：{failures}')
            + f'\n{line}')


def exit_code():
    return 1 if failed else 0


# ================================================================= HTTP

def http(method, path, token=None, body=None, timeout=30):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, _parse(e.read().decode('utf-8', 'replace'))


def post_file(path, token, filename, content, ctype, timeout=60):
    """手工拼 multipart/form-data（避免为了一个上传再装 requests）"""
    boundary = '----eqimport' + uuid.uuid4().hex
    buf = bytearray()
    buf += f'--{boundary}\r\n'.encode()
    buf += (f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f'Content-Type: {ctype}\r\n\r\n').encode('utf-8')
    buf += content
    buf += f'\r\n--{boundary}--\r\n'.encode()
    headers = {'Content-Type': f'multipart/form-data; boundary={boundary}'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, data=bytes(buf), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, _parse(e.read().decode('utf-8', 'replace'))


def _parse(raw):
    try:
        return json.loads(raw)
    except Exception:
        return raw


def login(user, pwd):
    _, r = http('POST', '/api/auth/login', body={'username': user, 'password': pwd})
    return (r.get('data') or {}).get('token')


# ================================================================= MySQL

def sql(query):
    out = subprocess.run([MYSQL] + DB_ARGS + ['-e', query], capture_output=True, text=True)
    if out.returncode != 0:
        return None
    return out.stdout.strip()


def q1(query):
    v = sql(query)
    return v.splitlines()[0].strip() if v else ''


# ================================================================= 文件

def write_file(path, data, encoding=None):
    with open(path, 'wb') as f:
        f.write(data.encode(encoding) if encoding else data)
    return path


def preflight(argv, extra_hint=''):
    """统一处理 --help / base_url 参数，并在开跑前报一下目标站点"""
    if len(argv) > 1 and argv[1] not in ('-h', '--help'):
        configure(argv[1])
    return BASE


if __name__ == '__main__':
    preflight(sys.argv)
    print(f'BASE={BASE}  MYSQL={MYSQL}  DB={DB}')
    print('（这是公共工具模块，请直接运行 vocab_import_check.py / grammar_import_check.py）')
    sys.exit(0)
