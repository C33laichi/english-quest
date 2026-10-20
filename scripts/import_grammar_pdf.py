"""用真实 PDF 走一遍「语法题批量导入」的预览 / 入库。

用法：
    python import_grammar_pdf.py <pdf 路径> [--day 1] [--commit]

不加 --commit 只做预览（dryRun），打印识别摘要和前几条题目；
加了才真正写库。默认把「天数」列留空的行落到 --day 指定的 Day。
"""
import os
import sys
import mimetypes

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import eq_util as U


def main():
    args = [a for a in sys.argv[1:]]
    if not args:
        print('用法：python import_grammar_pdf.py <pdf> [--day N] [--commit]')
        return 2
    pdf = args[0]
    day_no = 1
    commit = '--commit' in args
    if '--day' in args:
        day_no = int(args[args.index('--day') + 1])

    token = U.login(U.ADMIN, U.ADMIN_PWD)
    if not token:
        print('登录失败：检查后端是否已启动、管理员密码是否正确')
        return 1

    _, r = U.http('GET', '/api/admin/grammar/lessons', token)
    lessons = (r.get('data') or [])
    target = next((l for l in lessons if l.get('dayNo') == day_no), None)
    if not target:
        print(f'找不到 Day {day_no}')
        return 1
    print(f'默认目标：Day {target["dayNo"]} · {target["title"]}（id={target["id"]}）')

    with open(pdf, 'rb') as f:
        content = f.read()
    name = os.path.basename(pdf)
    ctype = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    print(f'文件：{name}（{len(content) / 1024:.0f} KB，{ctype}）')

    for dry in ([True] if not commit else [True, False]):
        label = '预览' if dry else '入库'
        print(f'\n--- {label} ---')
        status, resp = U.post_file(
            f'/api/admin/grammar/import?lessonId={target["id"]}&dryRun={str(dry).lower()}',
            token, name, content, ctype, timeout=600)
        if status != 200 or not resp.get('code') == 200:
            print(f'失败 HTTP {status}：{resp}')
            return 1
        d = resp['data']
        print(f'total={d["total"]} insertable={d["insertable"]} inserted={d["inserted"]} '
              f'skipped={d["skipped"]} failed={d["failed"]} days={d["lessonCount"]}')
        if d.get('tip'):
            print('识别摘要：' + d['tip'])
        for row in (d.get('preview') or [])[:6]:
            print(f'  Day{row["dayNo"]} [{row["knowledgePoint"]}] {row["stem"]}')
            print(f'      A.{row["optionA"]} B.{row["optionB"]} C.{row["optionC"]} D.{row["optionD"]}'
                  f'  ⇒ {row["answer"]}')
        for e in (d.get('errors') or [])[:5]:
            print(f'  错误 第{e["rowNo"]}行：{e["message"]}')
        if d['failed'] and not d.get('errors'):
            print('  （失败明细为空，可能是被截断）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
