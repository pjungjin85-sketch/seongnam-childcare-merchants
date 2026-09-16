# -*- coding: utf-8 -*-
"""성남사랑상품권 가맹점 전체 수집기

성남시 홈페이지의 가맹점 조회 화면(ec-pm010203)에는 엑셀 내려받기가 붙어 있고,
검색 조건을 비우면 전체가 한 번에 떨어진다. 페이지를 넘길 필요가 없다.

받은 자료에는 좌표가 없다 (원래 화면도 주소를 카카오 지오코더로 그때그때 변환한다).
좌표는 build_dataset.py 에서 아동수당 자료의 주소-좌표 표로 채운다.
"""
import os
import ssl
import urllib.parse
import urllib.request

URL = "https://www.seongnam.go.kr/ec-pm010203/sloveNewAgentExcelDown"
REFERER = "https://www.seongnam.go.kr/ec-pm010203"
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "data", "gift_merchants.xlsx")

FORM = {
    "currentPage": "1",
    "default": "2",
    "searchKey1": "name",
    "searchKey2": "1",
    "searchGu": "",       # 비우면 3개 구 전체
    "searchDong": "",
    "searchFrcsgb": "",   # 결제방법 전체 (지류/모바일/지류&모바일)
    "sectorNm": "",       # 업종 전체
    "frcsNmAddr": "",
}


def ssl_context():
    """성남시 서버가 오래된 TLS 설정을 써서 리눅스 기본값으로는 핸드셰이크가 깨진다.

    macOS 에서는 되는데 우분투(OpenSSL 3.x, SECLEVEL=2)에서
    SSLV3_ALERT_HANDSHAKE_FAILURE 가 난다. 보안 수준만 한 단계 낮춰 준다.
    """
    ctx = ssl.create_default_context()
    try:
        ctx.set_ciphers("DEFAULT@SECLEVEL=1")
    except ssl.SSLError:
        pass
    ctx.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
    return ctx


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    req = urllib.request.Request(
        URL,
        data=urllib.parse.urlencode(FORM, encoding="utf-8").encode(),
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Referer": REFERER,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req, timeout=120, context=ssl_context()) as r:
        ctype = r.headers.get("Content-Type", "")
        body = r.read()

    if "excel" not in ctype and "sheet" not in ctype:
        raise SystemExit(f"엑셀이 아닌 응답을 받았습니다: {ctype} ({len(body):,} bytes)")

    with open(OUT, "wb") as f:
        f.write(body)
    print(f"완료: {len(body)/1024/1024:.2f} MB -> {OUT}")


if __name__ == "__main__":
    main()
