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
GIFT = os.path.join(BASE, "data", "gift_merchants.xlsx")
OUT = os.path.join(BASE, "merchants.json")

PAY_CHILD = 1     # 아동수당 포인트
PAY_GIFT = 2      # 성남사랑상품권
GIFT_TYPES = ["", "지류", "모바일", "지류·모바일"]

# 성남상품권 자료의 '품목'은 7종뿐이라 아동수당 자료의 업종만큼 세분되지 않는다.
# 상품권에만 있는 가맹점은 이 표로 그룹만 정하고 세부는 '기타'로 둔다.
GIFT_SECTOR_GROUP = {
    "음식점업": "food",
    "소매업": "mart",
    "보건업": "med",
    "교육서비스업": "edu",
    "스포츠및여가관련서비스업": "leisure",
    "서비스업": "life",
    "제조업및기타": "life",
    "기타": "life",
}

GU = ["수정구", "중원구", "분당구"]

GROUP_KEYS = ["food", "mart", "med", "edu", "beauty", "fashion", "leisure", "life"]
GROUP_LABEL = {
    "food": "먹거리", "mart": "장보기", "med": "의료", "edu": "교육",
    "beauty": "미용", "fashion": "패션", "leisure": "여가", "life": "생활",
}

# 세부 업종. 원본의 183개 업종명을 그룹 > 세부로 두 단계로 묶는다.
# 여기 적힌 업종명이 분류의 기준이고, 목록에 없는 업종만 아래 KEYWORDS 로 추정한다.
# (키워드 추정에만 맡기면 "수예,지물,커텐,카페트" 가 '카페' 때문에 먹거리로 빠진다)
SUBS = {
    "food": [
        ("한식", ["한식"]),
        ("일반음식", ["일반대중음식"]),
        ("양·중·일식", ["일식", "중식", "양식"]),
        ("카페·제과", ["커피전문점", "제과점"]),
        ("패스트푸드", ["패스트푸드", "부페"]),
    ],
    "med": [
        ("병원", ["개인병원", "종합병원"]),
        ("약국", ["약국"]),
        ("치과", ["치과병원"]),
        ("한의원", ["한의원,한약방"]),
        ("동물병원", ["동물병원"]),
        ("의료기기", ["의료기기,건강진단", "제약회사"]),
    ],
    "mart": [
        ("슈퍼·마트", ["할인점/슈퍼마켓", "농협(마트)", "연쇄점", "농협(기타)", "농협(상품권)"]),
        ("편의점", ["편의점"]),
        ("정육", ["정육점"]),
        ("농수산·청과", ["농수산물", "청과물", "농가공산품"]),
        ("식품·잡화", ["식품잡화", "식품류제조업", "미곡상", "인삼 및 건강제품"]),
        ("주류", ["주류판매(유통)"]),
    ],
    "edu": [
        ("학원", ["일반전문학원", "자동차학원"]),
        ("유치원", ["유치원"]),
        ("독서실", ["독서실"]),
        ("서점·문구", ["문구용품", "서적", "인쇄,출판", "교육기자재", "학습지"]),
        ("완구", ["인형 및 완구 아동용 자전거"]),
    ],
    "beauty": [
        ("미용실", ["이용,미용"]),
        ("화장품", ["화장품", "미용재료"]),
        ("피부·체형", ["피부미용실", "체형관리"]),
        ("목욕·사우나", ["대중목욕탕", "싸우나탕"]),
    ],
    "fashion": [
        ("의류", ["남.여기성복", "내의류판매업", "아동복", "캐주얼의류", "양품점", "양복",
                 "옷감,직물류", "모피"]),
        ("신발·가방", ["기성화(신발)", "가방,핸드백(가죽)", "제화점"]),
        ("귀금속·시계", ["귀금속,금,은,보석", "시계점"]),
        ("안경", ["안경,콘텍트렌즈"]),
        ("생활잡화", ["생활잡화", "침구(이불)"]),
        ("예식", ["예식장", "결혼(가례)서비스"]),
    ],
    "leisure": [
        ("스포츠센터", ["스포츠센타/레포츠클럽", "수영장", "테니스장"]),
        ("골프", ["실내골프장", "실외골프장"]),
        ("문화·공연", ["공연장,극장", "골동품,예술품", "화랑,표구사"]),
        ("오락", ["당구장", "PC게임방", "노래방", "볼링장", "전자오락실"]),
        ("여행·숙박", ["관광여행사", "모텔,여관,기타숙박", "2급 호텔", "특급호텔",
                    "관광민예,선물용품"]),
        ("레저용품", ["레저스포츠", "운동경기,레져용품", "스포츠마사지", "수중장비"]),
    ],
    "life": [
        ("수리·자동차", ["각종 수리점", "정비,세차장,자동차SVC", "차량용품,부품",
                     "자동차시트,타이어", "중장비판매,수리", "견인서비스", "오토바이",
                     "렌트카", "수입자동차", "중고차판매", "주유소", "유류도매",
                     "자전거(성인용)"]),
        ("집·인테리어", ["건설,건축 자재", "조명 및 전기자재 실내장식", "목재가구", "철재가구",
                     "페인트", "유리,액자,거울", "냉난방기구", "수예,지물,커텐,카페트",
                     "주방기구 및 용품,정수기", "자석요,온돌매트,옥매트", "가정용연료"]),
        ("전자·컴퓨터", ["정보통신기기,컴퓨터", "가전,가전용품", "컴퓨터 소프트웨어", "사무기기",
                     "과학기자재", "기계,장비임대업", "기계류제조업"]),
        ("생활서비스", ["세탁소", "열쇠,도장", "주차장", "사진관,DPNE", "화물 운송업", "택시",
                    "고속버스", "보관,창고업", "방문판매", "자동판매기", "산후조리원",
                    "장의사", "장례식장", "묘지(납골공원등)"]),
        ("반려동물", ["애완동물", "동물농장", "수족관"]),
        ("꽃·원예", ["화원", "농기계,사료,비료"]),
        ("전문서비스", ["용역서비스(연구,번역등)", "전문서비스(회계,변리,컨설팅등)", "법률,사무SVC",
                    "광고", "부동산임대업", "부동산중개", "상담실(결혼등)", "무속,철학관",
                    "이벤트", "손해보험", "결제대행(PG)", "전자상거래(다품목취급)"]),
    ],
}

# SUBS 에 없는 업종명만 키워드로 추정한다. 앞에서 먼저 걸리는 쪽이 이긴다.
KEYWORDS = [
    ("food", ["음식", "한식", "중식", "일식", "양식", "분식", "치킨", "피자", "패스트", "뷔페",
              "주점", "호프", "유흥", "단란", "제과", "베이커리", "커피", "다방", "아이스크림",
              "레스토랑", "갈비", "고기", "냉면", "국수", "횟집", "포장마차"]),
    ("mart", ["슈퍼", "마트", "편의점", "식품", "농협", "축협", "수협", "정육", "청과", "반찬",
              "미곡", "쌀", "건강식품", "홍삼", "인삼", "농산", "농가공", "축산", "수산",
              "주류", "담배"]),
    ("med", ["병원", "의원", "약국", "한의", "치과", "의료", "보건", "한약", "제약", "산부인",
             "소아", "안과", "피부과", "정형", "내과", "외과"]),
    ("edu", ["학원", "서점", "서적", "문구", "완구", "교육", "독서실", "도서", "학습", "교습",
             "유치원", "어린이집", "교재", "출판", "보육"]),
    ("beauty", ["미용", "이용", "화장품", "피부", "네일", "사우나", "싸우나", "찜질", "목욕",
                "이발", "에스테틱", "헤어", "체형"]),
    ("fashion", ["의류", "신발", "기성화", "기성복", "제화", "양복", "가방", "잡화", "귀금속",
                 "시계", "안경", "직물", "한복", "예식", "혼수", "포목", "섬유", "패션",
                 "아동복", "내의", "양품", "모피", "침구", "주단"]),
    ("leisure", ["스포츠", "레저", "레져", "문화", "예술", "영화", "공연", "여행", "관광",
                 "숙박", "모텔", "호텔", "여관", "펜션", "콘도", "골프", "헬스", "체육",
                 "당구", "볼링", "수영", "노래", "오락", "게임", "낚시", "테니스", "레포츠"]),
]
DEFAULT_GROUP = "life"
OTHER_SUB = "기타"


def build_cat_index(cats):
    """업종명 -> (그룹키, 세부명). SUBS 우선, 상품권 품목, 그 다음 키워드 추정."""
    explicit = {}
    for g, subs in SUBS.items():
        for sub, names in subs:
            for nm in names:
                explicit[nm] = (g, sub)
    for sector, g in GIFT_SECTOR_GROUP.items():
        explicit.setdefault(sector, (g, OTHER_SUB))

    result = {}
    for c in cats:
        if c in explicit:
            result[c] = explicit[c]
            continue
        s = c.replace(" ", "")
        g = DEFAULT_GROUP
        for key, words in KEYWORDS:
            if any(w in s for w in words):
                g = key
                break
        result[c] = (g, OTHER_SUB)
    return result


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
    if len(set(body)) <= 1:
        return ""
    if "000000" in p or "111111" in p:
        return ""
    return p


def norm_name(s):
    """매칭용 상호 정규화. 법인 표기와 기호를 걷어낸다."""
    s = re.sub(r"\(주\)|\(유\)|㈜|주식회사|유한회사", "", (s or "").strip())
    return re.sub(r"[\s.,\-_'\"()\[\]&·]", "", s).lower()


def norm_addr(s):
    """매칭용 주소 정규화. '경기도 성남시 분당구 황새울로 342번길 11, 2층' -> '황새울로342번길11'

    두 자료의 주소 표기가 제각각이라(우편번호 머리말, '지하', 건물명, 지번) 도로명과
    건물번호만 남긴다. 같은 건물이면 같은 값이 나오는 것이 목표다.
    """
    s = re.sub(r"^\[\d{5}\]\s*", "", (s or "").strip())
    s = re.sub(r"^경기(도)?\s*", "", s)
    s = re.sub(r"^성남시\s*", "", s)
    s = re.sub(r"^(수정구|중원구|분당구)\s*", "", s)
    s = s.split(",")[0]
    s = re.sub(r"\s*\(.*$", "", s)
    s = re.sub(r"\s*(지하|지상)\s*", " ", s)
    m = re.match(r"(.+?(?:로|길)\s*\d+번길)\s*(\d+(?:-\d+)?)", s)
    if m:
        return re.sub(r"\s+", "", m.group(1) + m.group(2))
    m = re.match(r"(.+?(?:로|길))\s*(\d+(?:-\d+)?)", s)
    if m:
        return re.sub(r"\s+", "", m.group(1) + m.group(2))
    m = re.match(r"([가-힣]+동)\s*(산?\d+(?:-\d+)?)", s)
    if m:
        return re.sub(r"\s+", "", m.group(0))
    return re.sub(r"\s+", "", s)


def load_gift():
    """성남사랑상품권 엑셀 -> 레코드 목록. 파일이 없으면 빈 목록."""
    if not os.path.exists(GIFT):
        print("! 성남상품권 자료 없음 (crawl_gift.py 를 먼저 실행하세요). 아동수당만 씁니다.")
        return []
    import warnings
    warnings.filterwarnings("ignore", category=UserWarning)
    import openpyxl

    ws = openpyxl.load_workbook(GIFT, read_only=True).active
    out, seen = [], set()
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or not r or not r[2]:
            continue
        name, gu, addr = clean(r[2]), clean(r[3]), clean(r[4])
        key = (norm_name(name), gu, norm_addr(addr))
        if key in seen:
            continue
        seen.add(key)
        pay = clean(r[7])
        out.append({
            "n": name, "gu": gu, "a": addr, "p": phone_digits(r[6]),
            "sector": clean(r[1]),
            "gt": 3 if "지류" in pay and "모바일" in pay else (1 if "지류" in pay else (2 if "모바일" in pay else 0)),
        })
    return out


def short_addr(addr):
    """'경기 성남시 분당구 야탑로 108' -> '야탑로 108' (시도/시/구는 따로 저장한다)"""
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
            "n": name, "a": short_addr(addr),
            "g": GU.index(m.group(1)) if m else -1,
            "c": cat, "p": phone_digits(r.get("MCT_PON")),
            "y": lat, "x": lon,
        })

    # 이름·주소·좌표가 모두 같은 항목은 합친다. 한 가게가 단말기 수만큼 등록돼
    # 있거나(개인택시처럼) 같은 상호가 여러 번 잡히는데, 이용자에게는 구분되지 않는다.
    seen, deduped = set(), []
    for v in recs:
        key = (v["n"], v["g"], v["a"], v["y"], v["x"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(v)
    dup_removed = len(recs) - len(deduped)
    recs = deduped
    for v in recs:
        v["pay"] = PAY_CHILD
        v["gt"] = 0

    # ---- 성남사랑상품권 자료 합치기 ----
    gift = load_gift()
    stats = collections.Counter()
    if gift:
        by_na, by_n, by_p = (collections.defaultdict(list) for _ in range(3))
        addr_xy = {}
        for v in recs:
            gu = GU[v["g"]] if v["g"] >= 0 else ""
            na = norm_addr(v["a"])
            by_na[(norm_name(v["n"]), gu, na)].append(v)
            by_n[(norm_name(v["n"]), gu)].append(v)
            if v["p"]:
                by_p[v["p"]].append(v)
            if v["y"] is not None and len(na) > 3:
                addr_xy.setdefault((gu, na), (v["y"], v["x"]))

        for g in gift:
            na = norm_addr(g["a"])
            hit = None
            kna = (norm_name(g["n"]), g["gu"], na)
            kn = (norm_name(g["n"]), g["gu"])
            if kna in by_na:
                hit = by_na[kna][0]
                stats["이름+구+주소"] += 1
            elif g["p"] and len(by_p.get(g["p"], [])) == 1:
                hit = by_p[g["p"]][0]
                stats["전화번호"] += 1
            elif len(by_n.get(kn, [])) == 1:
                hit = by_n[kn][0]
                stats["이름+구"] += 1

            if hit:
                hit["pay"] |= PAY_GIFT
                hit["gt"] = max(hit["gt"], g["gt"])
                continue

            # 아동수당 목록에 없는 상품권 전용 가맹점 -> 새 항목으로 추가.
            # 좌표는 같은 주소의 다른 가맹점 것을 빌려 쓴다 (같은 건물이면 핀 위치는 같다).
            xy = addr_xy.get((g["gu"], na))
            stats["상품권 전용"] += 1
            if xy is None:
                stats["  (좌표없음)"] += 1
            recs.append({
                "n": g["n"],
                "a": short_addr(g["a"]),
                "g": GU.index(g["gu"]) if g["gu"] in GU else -1,
                "c": g["sector"] or "기타",
                "p": g["p"],
                "y": xy[0] if xy else None,
                "x": xy[1] if xy else None,
                "pay": PAY_GIFT,
                "gt": g["gt"],
            })

    # 한글로 시작하는 상호를 앞에 둔다. 기호로 시작하는 법인명이 목록 첫 화면을
    # 채우면 "(#)..." "((본사직영))..." 만 보여서 무슨 목록인지 알아보기 어렵다.
    recs.sort(key=lambda v: (0 if "가" <= v["n"][0] <= "힣" else 1, v["n"]))

    # 업종명 문자열 통합 (183종 -> 인덱스)
    cats = sorted({v["c"] for v in recs})
    cat_idx = {c: i for i, c in enumerate(cats)}
    catmap = build_cat_index(cats)

    # 세부 업종 목록. 그룹 순서 -> SUBS 정의 순서 -> 기타
    sub_list, sub_group, sub_idx = [], [], {}
    for gi, g in enumerate(GROUP_KEYS):
        labels = [s for s, _ in SUBS.get(g, [])]
        if any(catmap[c] == (g, OTHER_SUB) for c in cats):
            labels.append(OTHER_SUB)
        for lb in labels:
            sub_idx[(g, lb)] = len(sub_list)
            sub_list.append(lb)
            sub_group.append(gi)

    cat_group = [GROUP_KEYS.index(catmap[c][0]) for c in cats]
    cat_sub = [sub_idx[catmap[c]] for c in cats]

    payload = {
        "updated": datetime.date.today().isoformat(),
        "source": "신한카드 성남시 아동수당 포인트 가맹점 찾기",
        "gu": GU,
        "giftTypes": GIFT_TYPES,
        "groupKeys": GROUP_KEYS,
        "groupLabels": [GROUP_LABEL[k] for k in GROUP_KEYS],
        "subs": sub_list,
        "subGroup": sub_group,
        "cats": cats,
        "catGroup": cat_group,
        "catSub": cat_sub,
        "n": [v["n"] for v in recs],
        "a": [v["a"] for v in recs],
        "g": [v["g"] for v in recs],
        "c": [cat_idx[v["c"]] for v in recs],
        "p": [v["p"] for v in recs],
        "y": [v["y"] for v in recs],
        "x": [v["x"] for v in recs],
        "pay": [v["pay"] for v in recs],
        "gt": [v["gt"] for v in recs],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    nocoord = sum(1 for v in recs if v["y"] is None)
    gcount = collections.Counter(GROUP_LABEL[catmap[v["c"]][0]] for v in recs)
    paycount = collections.Counter(v["pay"] for v in recs)
    print(f"총 {len(recs):,}건 (중복 {dup_removed:,}건 제거) / 좌표없음 {nocoord:,}건 "
          f"(범위 이탈 {out_of_range:,}건)")
    print(f"결제수단: 아동수당만 {paycount[1]:,} · 상품권만 {paycount[2]:,} · 둘 다 {paycount[3]:,}")
    if stats:
        print("상품권 대조:", ", ".join(f"{k} {v:,}" for k, v in stats.most_common()))
    print("구별  :", dict(collections.Counter((GU[v['g']] if v['g'] >= 0 else '(주소없음)') for v in recs)))
    print("그룹별:", dict(gcount))
    print(f"\n세부 업종 {len(sub_list)}개")
    scount = collections.Counter((catmap[v["c"]][0], catmap[v["c"]][1]) for v in recs)
    for g in GROUP_KEYS:
        items = [(s, n) for (gg, s), n in scount.items() if gg == g]
        items.sort(key=lambda t: -t[1])
        print(f"  {GROUP_LABEL[g]}: " + ", ".join(f"{s}({n:,})" for s, n in items))
    print(f"\n출력: {OUT} ({os.path.getsize(OUT)/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
