# -*- coding: utf-8 -*-
"""갱신 전후 merchants.json 을 견줘 요약을 낸다.

자동 갱신 워크플로가 커밋 메시지에 쓰고, 자료가 망가졌는지 판단하는 데도 쓴다.
정상 종료 0, 변동 없음 10, 자료가 수상할 만큼 줄었으면 20.
"""
import json
import sys
from collections import Counter

SHRINK_LIMIT = 0.8   # 이전의 80% 밑으로 줄면 원본이 깨진 것으로 본다


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def keys(d):
    out = {}
    for i in range(len(d["n"])):
        k = (d["n"][i].replace(" ", ""), d["g"][i], d["a"][i].replace(" ", ""))
        out[k] = d["pay"][i]
    return out


def main(old_path, new_path):
    new = load(new_path)
    n_new = len(new["n"])
    cnt = Counter(new["pay"])
    summary = [
        f"합계 {n_new:,}곳 — 아동수당만 {cnt[1]:,} · 상품권만 {cnt[2]:,} · 둘 다 {cnt[3]:,}"
    ]

    try:
        old = load(old_path)
    except (OSError, ValueError):
        print("\n".join(summary))
        return 0

    n_old = len(old["n"])
    if n_new < n_old * SHRINK_LIMIT:
        print(f"[중단] 가맹점이 {n_old:,} -> {n_new:,} 로 급감했습니다. "
              f"원본 사이트가 바뀌었을 수 있어 갱신하지 않습니다.", file=sys.stderr)
        return 20

    a, b = keys(old), keys(new)
    added = [k for k in b if k not in a]
    removed = [k for k in a if k not in b]
    changed = [k for k in b if k in a and a[k] != b[k]]

    summary.append(f"신규 {len(added):,}곳 · 삭제 {len(removed):,}곳 · 결제수단 변경 {len(changed):,}곳")
    GU = old.get("gu", [])

    def line(k):
        gu = GU[k[1]] if 0 <= k[1] < len(GU) else ""
        return f"  {k[0]} ({gu} {k[2]})"

    for title, items in (("새로 생긴 곳", added), ("사라진 곳", removed)):
        if items:
            summary.append(f"\n{title}")
            summary += [line(k) for k in items[:10]]
            if len(items) > 10:
                summary.append(f"  … 외 {len(items) - 10:,}곳")
    if changed:
        summary.append("\n결제수단이 바뀐 곳")
        summary += [f"{line(k)} : {a[k]} -> {b[k]}" for k in changed[:10]]

    print("\n".join(summary))
    return 10 if not (added or removed or changed) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
