# -*- coding: utf-8 -*-
"""
听力语料音频生成器

用 edge-tts（微软 Neural 语音）把 150 句语料批量合成 mp3，
输出到 frontend/public/audio/listen/{句子ID}.mp3。

为什么预生成音频而不是前端实时合成：
  听写练习的答案就是句子本身。若把英文原文下发到前端让浏览器朗读，
  答案就暴露在 network 响应和 DOM 里，「困难模式」形同虚设。
  预生成音频后前端只拿到声音，拿不到文本，从根上杜绝了这个问题。
  附带好处：音质是接近真人的 Neural 语音，且无需联网即可播放。

支持断点续传：已存在且体积正常的文件会跳过，可反复运行。

用法：
  python scripts/gen_listen_audio.py            # 增量生成
  python scripts/gen_listen_audio.py --force    # 全部重新生成
"""
import argparse
import asyncio
import os
import subprocess
import sys

try:
    import edge_tts
except ImportError:
    print("缺少依赖，请先执行：pip install edge-tts")
    sys.exit(1)

# ------------------------------------------------------------
# 配置
# ------------------------------------------------------------
VOICE = "en-US-AriaNeural"          # 美式女声，发音清晰，适合听写
MYSQL = r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
DB_USER = "root"
DB_PASS = os.environ.get('EQ_PASS', '')
DB_NAME = "english_quest"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "frontend", "public", "audio", "listen")

CONCURRENCY = 4                      # 并发数，过高会被服务端限流
MAX_RETRY = 3
MIN_SIZE = 800                       # 小于 800 字节视为无效文件


def fetch_sentences():
    """从数据库读取全部句子"""
    sql = "SELECT id, english FROM t_listen_sentence WHERE status = 1 ORDER BY id"
    cmd = [MYSQL, f"-u{DB_USER}", f"-p{DB_PASS}", DB_NAME,
           "--default-character-set=utf8mb4", "-N", "-B", "-e", sql]
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        print("查询数据库失败：", out.stderr)
        sys.exit(1)
    rows = []
    for line in out.stdout.splitlines():
        line = line.rstrip("\n").rstrip("\r")
        if not line.strip():
            continue
        sid, _, english = line.partition("\t")
        if sid.strip().isdigit() and english.strip():
            rows.append((int(sid), english.strip()))
    return rows


async def synth_one(sem, sid, text, force):
    path = os.path.join(OUT_DIR, f"{sid}.mp3")
    if not force and os.path.exists(path) and os.path.getsize(path) >= MIN_SIZE:
        return sid, "skip"

    async with sem:
        for attempt in range(1, MAX_RETRY + 1):
            try:
                # 写临时文件，成功后再改名，避免中途失败留下半截文件
                tmp = path + ".part"
                communicate = edge_tts.Communicate(text, VOICE)
                await communicate.save(tmp)
                if os.path.getsize(tmp) < MIN_SIZE:
                    raise RuntimeError("合成结果过小")
                os.replace(tmp, path)
                return sid, "ok"
            except Exception as e:                      # noqa: BLE001
                if attempt == MAX_RETRY:
                    return sid, f"fail: {e}"
                await asyncio.sleep(1.2 * attempt)
        return sid, "fail"


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="忽略已有文件全部重新生成")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    sentences = fetch_sentences()
    if not sentences:
        print("数据库中没有找到语料")
        return

    total = len(sentences)
    print(f"待处理语料 {total} 句，语音={VOICE}，输出={OUT_DIR}")

    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = [synth_one(sem, sid, text, args.force) for sid, text in sentences]

    ok = skip = fail = 0
    failures = []
    for i, coro in enumerate(asyncio.as_completed(tasks), start=1):
        sid, status = await coro
        if status == "ok":
            ok += 1
        elif status == "skip":
            skip += 1
        else:
            fail += 1
            failures.append((sid, status))
        if i % 20 == 0 or i == total:
            print(f"  进度 {i}/{total}  新生成 {ok}  跳过 {skip}  失败 {fail}")

    print(f"\n完成：新生成 {ok}，跳过 {skip}，失败 {fail}")
    if failures:
        print("失败明细：")
        for sid, status in failures[:10]:
            print(f"  #{sid} {status}")


if __name__ == "__main__":
    asyncio.run(main())
