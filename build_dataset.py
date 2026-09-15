# -*- coding: utf-8 -*-
"""raw_merchants.json -> 웹앱용 데이터셋 (좌표변환 + 업종분류 + 컬럼 압축)

신한카드 응답의 MCT_XC_VL/MCT_YC_VL 은 TM 중부원점(Bessel, EPSG:5174) 좌표다.
현대백화점 판교점 등 실좌표 대조로 검증했다 (오차 ~50m, 5181/2097 은 250~300m 이탈).

출력은 레코드 배열이 아니라 필드별 배열(컬럼 방식)이다. 3만 건이 넘어가면
레코드마다 반복되는 키 이름만으로 2MB 가까이 나가기 때문이다.
초성 인덱스는 넣지 않는다 - 브라우저에서 만드는 편이 훨씬 싸다.
"""
import collections
import datetime
import json
import os
import re
from pyproj import Transformer

SRC_CRS = "EPSG:5174"
BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, "data", "raw_merchants.json")
OUT = os.path.join(BASE, "merchants.json")

GU = ["수정구", "중원구", "분당구"]

# 업종 그룹: 앞에서부터 먼저 걸리는 키워드가 이긴다 (순서가 곧 우선순위)
GROUPS = [
    ("food", ["음식", "한식", "중식", "일식", "양식", "분식", "치킨", "피자", "패스트", "뷔페",
              "주점", "호프", "유흥", "단란", "제과", "베이커리", "커피", "카페", "다방", "아이스크림",
              "레스토랑", "갈비", "고기", "냉면", "국수", "횟집", "포장마차", "food"]),
    ("mart", ["슈퍼", "마트", "편의점", "식품", "농협", "축협", "수협", "정육", "청과", "반찬",
              "정미", "쌀", "건강식품", "홍삼", "농산", "축산", "수산", "주류", "담배"]),
    ("med", ["병원", "의원", "약국", "한의", "치과", "의료", "보건", "한약", "제약", "산부인",
             "소아", "안과", "피부과", "정형", "내과", "외과"]),
    ("edu", ["학원", "서점", "문구", "완구", "교육", "독서실", "도서", "학습", "교습", "유치원",
             "어린이집", "교재", "출판", "보육"]),
    ("beauty", ["미용", "이용", "화장품", "피부", "네일", "사우나", "찜질", "목욕", "이발",
                "에스테틱", "헤어", "체형"]),
    ("fashion", ["의류", "신발", "기성화", "기성복", "가방", "잡화", "귀금속", "시계", "안경",
                 "직물", "한복", "예식", "혼수", "포목", "섬유", "패션", "아동복", "내의",
                 "양품", "모피", "침구", "주단"]),
    ("leisure", ["스포츠", "레저", "문화", "예술", "영화", "공연", "여행", "관광", "숙박",
                 "모텔", "호텔", "여관", "펜션", "콘도", "골프", "헬스", "체육", "당구",
                 "볼링", "수영", "노래", "오락", "게임", "낚시", "레포츠"]),
]
DEFAULT_GROUP = "life"
GROUP_KEYS = [g[0] for g in GROUPS] + [DEFAULT_GROUP]
GROUP_LABEL = {
    "food": "먹거리", "mart": "장보기", "med": "의료", "edu": "교육",
    "beauty": "미용", "fashion": "패션", "leisure": "여가", "life": "생활",
}


def classify(cat_name):
    s = (cat_name or "").replace(" ", "")
    for key, words in GROUPS:
        for w in words:
            if w in s:
                return key
    return DEFAULT_GROUP


def clean(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def phone_digits(p):
    """숫자만 남기되, 자리 채우기용 더미 번호는 버린다.

    원본의 23%가 031-0000-0000 / 02-1111-1111 같은 값이다. 그대로 두면
    전화 버튼이 엉뚱한 곳으로 연결되므로 없는 것으로 취급한다.
    """
    p = re.sub(r"\D", "", p or "")
    if not (8 <= len(p) <= 12):
        return ""
    body = p[2:] if p.startswith("02") else p[3:]
    if len(set(body)) <= 1:          # 국번 이하가 전부 같은 숫자
        return ""
    if "000000" in p or "111111" in p:
        return ""
    return p


def short_addr(addr):
    """'경기 성남시 분당구 야탑로 108' -> '야탑로 108' (시도/시/구는 따로 저장하므로 제거)"""
    a = re.sub(r"^경기(도)?\s*", "", addr)
    a = re.sub(r"^성남시\s*", "", a)
    a = re.sub(r"^(수정구|중원구|분당구)\s*", "", a)
    return a.strip(" ,")


def main():
    rows = json.load(open(RAW, encoding="utf-8"))
    tf = Transformer.from_crs(SRC_CRS, "EPSG:4326", always_xy=True)

    recs = []
    out_of_range = 0
    for r in rows:
        name = clean(r.get("MCT_NM"))
        if not name:
            continue
        addr = clean(r.get("MCT_AR"))
        cat = clean(r.get("MCT_RY_NM"))

        try:
            x = int(r.get("MCT_XC_VL") or 0)
            y = int(r.get("MCT_YC_VL") or 0)
        except ValueError:
            x = y = 0

        lat = lon = None
        if x and y:
            lo, la = tf.transform(x, y)
            if 37.28 <= la <= 37.58 and 126.95 <= lo <= 127.35:
                lat, lon = round(la, 5), round(lo, 5)
            else:
                out_of_range += 1

        m = re.search(r"(수정구|중원구|분당구)", addr)
        recs.append({
            "n": name,
            "a": short_addr(addr),
            "g": GU.index(m.group(1)) if m else -1,
            "c": cat,
            "p": phone_digits(r.get("MCT_PON")),
            "y": lat,
            "x": lon,
        })

    # 이름·주소·좌표가 모두 같은 항목은 합친다. 한 가게가 단말기 수만큼 등록돼
    # 있거나(개인택시처럼) 같은 상호가 여러 번 잡히는데, 이용자에게는 구분되지 않는다.
    seen = set()
    deduped = []
    for v in recs:
        key = (v["n"], v["g"], v["a"], v["y"], v["x"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(v)
    dup_removed = len(recs) - len(deduped)
    recs = deduped

    # 한글로 시작하는 상호를 앞에 둔다. 기호로 시작하는 법인명이 목록 첫 화면을
    # 채우면 "(#)..." "((본사직영))..." 만 보여서 무슨 목록인지 알아보기 어렵다.
    def sort_key(v):
        ch = v["n"][0]
        return (0 if "가" <= ch <= "힣" else 1, v["n"])

    recs.sort(key=sort_key)

    # 업종명 문자열 통합 (183종 -> 인덱스)
    cats = sorted({v["c"] for v in recs})
    cat_idx = {c: i for i, c in enumerate(cats)}
    cat_group = [GROUP_KEYS.index(classify(c)) for c in cats]

    payload = {
        "updated": datetime.date.today().isoformat(),
        "source": "신한카드 성남시 아동수당 포인트 가맹점 찾기",
        "gu": GU,
        "groupKeys": GROUP_KEYS,
        "groupLabels": [GROUP_LABEL[k] for k in GROUP_KEYS],
        "cats": cats,
        "catGroup": cat_group,
        "n": [v["n"] for v in recs],
        "a": [v["a"] for v in recs],
        "g": [v["g"] for v in recs],
        "c": [cat_idx[v["c"]] for v in recs],
        "p": [v["p"] for v in recs],
        "y": [v["y"] for v in recs],
        "x": [v["x"] for v in recs],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    nocoord = sum(1 for v in recs if v["y"] is None)
    gcount = collections.Counter(GROUP_LABEL[GROUP_KEYS[cat_group[cat_idx[v["c"]]]]] for v in recs)
    print(f"총 {len(recs):,}건 (중복 {dup_removed:,}건 제거) / 좌표없음 {nocoord:,}건 "
          f"(성남 범위 이탈 {out_of_range:,}건)")
    print("구별  :", dict(collections.Counter((GU[v['g']] if v['g'] >= 0 else '(주소없음)') for v in recs)))
    print("그룹별:", dict(gcount))
    print(f"세부업종 {len(cats)}종")
    print(f"출력: {OUT} ({os.path.getsize(OUT)/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
