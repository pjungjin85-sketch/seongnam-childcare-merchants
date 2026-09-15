# -*- coding: utf-8 -*-
"""신한카드 성남시 아동수당 포인트 가맹점 전체 수집기

조회 API의 NXT_QY_KEY 는 '이 MCT_N 이상'을 뜻하는 단순 임계값이라, 임의 값을 넣어도
동작한다. 그래서 MCT_N 공간을 구간으로 쪼개 병렬로 긁고 마지막에 합친다.
진행 중에도 부분 결과를 계속 저장한다.
"""
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = "https://www.shinhancard.com/mob/MOBFM204N/MOBFM204R1101.ajax"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Referer": "https://www.shinhancard.com/mob/MOBFM204N/MOBFM204R11.shc",
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
}

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "data", "raw_merchants.json")

MAX_ID = 145_000_000     # 실측 최대 MCT_N 144,701,802 + 여유
CHUNKS = 120
WORKERS = 6
DELAY = 0.12

lock = threading.Lock()
store = {}               # MCT_N -> row
pages_done = 0


def fetch(cursor, retries=4):
    body = urllib.parse.urlencode({
        "mchtNm": "", "siDo": "경기", "siGunGu": "성남시",
        "category": "", "NXT_QY_KEY": str(cursor).zfill(10),
    }, encoding="utf-8").encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(URL, data=body, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                j = json.loads(r.read().decode("utf-8"))["mbw_json"]
            m = j.get("mchtList") or {}
            keys = list(m.keys())
            n = len(m[keys[0]]) if keys else 0
            rows = [{k: m[k][i] for k in keys} for i in range(n)]
            nxt = j.get("NXT_QY_KEY") or ""
            return rows, (int(nxt) if nxt else None)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def work(rng):
    """[start, end) 구간을 커서로 훑는다."""
    global pages_done
    start, end = rng
    cursor = start
    while True:
        rows, nxt = fetch(cursor)
        if not rows:
            return
        with lock:
            for r in rows:
                store[r["MCT_N"]] = r
            pages_done += 1
            if pages_done % 40 == 0:
                print(f"  {pages_done:5d} 페이지 · 누적 {len(store):6,}건", flush=True)
        if nxt is None or nxt >= end:
            return
        cursor = nxt
        time.sleep(DELAY)


def save():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    rows = sorted(store.values(), key=lambda r: r["MCT_N"])
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    os.replace(tmp, OUT)
    return len(rows)


def main():
    step = MAX_ID // CHUNKS
    ranges = [(i * step, (i + 1) * step if i < CHUNKS - 1 else MAX_ID) for i in range(CHUNKS)]

    stop = threading.Event()

    def autosave():
        while not stop.wait(20):
            with lock:
                save()

    t = threading.Thread(target=autosave, daemon=True)
    t.start()

    t0 = time.time()
    print(f"{CHUNKS}개 구간 / 워커 {WORKERS}개로 수집 시작", flush=True)
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        list(ex.map(work, ranges))

    stop.set()
    n = save()
    print(f"완료: {n:,}건 · {time.time()-t0:.0f}초 · {OUT}", flush=True)


if __name__ == "__main__":
    main()
