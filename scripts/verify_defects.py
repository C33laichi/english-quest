# -*- coding: utf-8 -*-
"""缺陷修复后的端到端接口验证（只读 + 一次真实打卡 + 一次对账重算）"""
import json
import urllib.request

BASE = 'http://127.0.0.1:8090'
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    with OPENER.open(req, timeout=15) as r:
        return json.loads(r.read().decode())


def login(username, password):
    return call('POST', '/api/auth/login', {'username': username, 'password': password})['data']


def main():
    st = login(os.environ.get('EQ_USER', 'student'), os.environ.get('EQ_PASS', ''))
    tk = st['token']
    print('== 登录 ==')
    print('  登录前 totalPoints =', st.get('totalPoints'))

    ov = call('GET', '/api/game/overview', token=tk)['data']
    print('== 缺陷 2：等级口径 ==')
    print('  totalPoints        =', ov['totalPoints'])
    print('  level / levelName  =', ov['level'], ov['levelName'])
    print('  levelBasePoints    =', ov.get('levelBasePoints'))
    print('  nextLevelThreshold =', ov.get('nextLevelThreshold'))
    print('  → 界面应显示: %s / %s' % (ov['totalPoints'], ov.get('nextLevelThreshold')))
    print('  （旧口径 currentLevelPoints / nextLevelPoints = %s / %s）'
          % (ov.get('currentLevelPoints'), ov.get('nextLevelPoints')))

    print('== 缺陷 5：打卡固定 +5 ==')
    print('  checkedToday =', ov['checkedToday'], ' streakDays =', ov['streakDays'])
    ck = call('POST', '/api/game/checkin', token=tk)['data']
    print('  打卡返回 =', ck)
    ov2 = call('GET', '/api/game/overview', token=tk)['data']
    print('  打卡后 totalPoints =', ov2['totalPoints'],
          '（应比打卡前 +%s）' % ck['gainPoints'])

    print('== 缺陷 1：积分明细 ==')
    logs = call('GET', '/api/game/points/logs?limit=8', token=tk)['data']
    s = 0
    for l in logs:
        s += l['changePoints']
        print('  %-12s %-10s %+4d  %s  %s'
              % (l['createTime'], l['typeName'], l['changePoints'], l['remark'], l['type']))
    print('  最近 %d 笔合计 = %+d' % (len(logs), s))

    print('== 缺陷 3：词汇题词性 ==')
    levels = call('GET', '/api/vocab/levels', token=tk)['data']
    qs = call('GET', '/api/vocab/levels/%s/questions' % levels[0]['id'], token=tk)['data']
    for q in qs[:3]:
        if q['type'] == 'CHOICE':
            print('  [选择] %s  选项=%s' % (q['stem'], [o['value'] for o in q['optionList']]))
        else:
            print('  [拼写] 题干=%s' % q['stem'])

    print('== 缺陷 1：管理端按流水重算 ==')
    ad = login(os.environ.get('EQ_USER', 'admin'), os.environ.get('EQ_ADMIN_PASS', ''))
    users = call('GET', '/api/admin/users?pageNum=1&pageSize=10', token=ad['token'])['data']
    rows = users.get('records') or users.get('list') or users.get('rows') or users
    stu = [u for u in rows if u['username'] == 'student'][0]
    print('  重算前 totalPoints =', stu['totalPoints'])
    rc = call('PUT', '/api/admin/users/%s/recalc-points' % stu['id'], token=ad['token'])['data']
    print('  对账结果 =', rc, '（diff=0 说明账本来是平的）')


if __name__ == '__main__':
    main()
