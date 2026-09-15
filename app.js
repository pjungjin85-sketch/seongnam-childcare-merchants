/* 성남 아동수당 포인트 · 성남사랑상품권 가맹점 찾기
   데이터: merchants.json — 필드별 배열(컬럼) 구조. 한 건은 인덱스 하나로 다룬다. */
'use strict';

// 카카오 JavaScript 키. 브라우저에 노출되는 값이라 숨길 수 없고, 등록된 도메인
// (pjungjin85-sketch.github.io)에서만 동작하므로 다른 사이트에 옮겨 써도 소용없다.
// 키를 바꾸려면 지도 탭에서 새 키를 넣으면 되고, 그 값이 이 기본값을 덮는다.
const KAKAO_KEY = 'a83ccf5d0f76a309473878b4530aa580';

const PAGE = 60;            // 목록을 한 번에 그리는 개수
const MARKER_CAP = 2500;    // 지도에 한 번에 올리는 마커 상한
const SEONGNAM = { lat: 37.4200, lng: 127.1265 };

// 성남시 지하철역. 좌표는 OpenStreetMap 에서 받아 노선별 노드를 평균냈다.
const STATIONS = [
  { n: '복정', y: 37.47075, x: 127.12672, l: '8호선·수인분당선' },
  { n: '남위례', y: 37.46277, x: 127.13922, l: '8호선' },
  { n: '산성', y: 37.45687, x: 127.14993, l: '8호선' },
  { n: '남한산성입구', y: 37.45155, x: 127.15981, l: '8호선' },
  { n: '가천대', y: 37.44870, x: 127.12672, l: '수인분당선' },
  { n: '단대오거리', y: 37.44508, x: 127.15678, l: '8호선' },
  { n: '신흥', y: 37.44100, x: 127.14766, l: '8호선' },
  { n: '태평', y: 37.43971, x: 127.12774, l: '수인분당선' },
  { n: '수진', y: 37.43744, x: 127.14069, l: '8호선' },
  { n: '모란', y: 37.43298, x: 127.12911, l: '8호선·수인분당선' },
  { n: '야탑', y: 37.41130, x: 127.12871, l: '수인분당선' },
  { n: '삼동', y: 37.40866, x: 127.20339, l: '경강선' },
  { n: '이매', y: 37.39497, x: 127.12832, l: '수인분당선·경강선' },
  { n: '판교', y: 37.39473, x: 127.11136, l: '신분당선·경강선' },
  { n: '성남', y: 37.39419, x: 127.12000, l: 'GTX-A' },
  { n: '서현', y: 37.38491, x: 127.12333, l: '수인분당선' },
  { n: '수내', y: 37.37841, x: 127.11425, l: '수인분당선' },
  { n: '정자', y: 37.36644, x: 127.10827, l: '수인분당선·신분당선' },
  { n: '미금', y: 37.34981, x: 127.10902, l: '수인분당선·신분당선' },
  { n: '오리', y: 37.33994, x: 127.10891, l: '수인분당선' },
];
const RADII = [300, 500, 1000];

// 결제수단 비트: 1=아동수당 포인트, 2=성남사랑상품권
const PAY_CHILD = 1, PAY_GIFT = 2;
const PAY_FILTERS = [
  { v: 0, label: '전체' },
  { v: 1, label: '아동수당' },
  { v: 2, label: '상품권' },
  { v: 3, label: '둘 다' },
];

const GROUP_COLOR = {
  food: '#FF5A1F', mart: '#00A05A', med: '#E8334A', edu: '#1B45FF',
  beauty: '#9B3BE8', fashion: '#E0348C', leisure: '#009BB0', life: '#6A7280',
};

const $ = (id) => document.getElementById(id);
const el = {
  q: $('q'), clear: $('clear'), hit: $('hit'), scope: $('scope'),
  payChips: $('payChips'),
  placeChips: $('placeChips'), radiusChips: $('radiusChips'),
  catChips: $('catChips'), subChips: $('subChips'),
  tabList: $('tabList'), tabMap: $('tabMap'), paneList: $('paneList'), paneMap: $('paneMap'),
  list: $('list'), more: $('more'), empty: $('empty'),
  map: $('map'), mapkey: $('mapkey'), keyInput: $('keyInput'), keySave: $('keySave'),
  originHint: $('originHint'), mapreset: $('mapreset'),
  sheet: $('sheet'), sheetClose: $('sheetClose'), sheetCat: $('sheetCat'),
  sheetName: $('sheetName'), sheetAddr: $('sheetAddr'),
  sheetPay: $('sheetPay'), sheetActs: $('sheetActs'),
  footMeta: $('footMeta'),
};

let D = null;          // 원본 컬럼 데이터
let NORM = null;       // 검색용 정규화 이름
let CHO = null;        // 초성 인덱스 (처음 초성 검색할 때 만든다)
let results = [];      // 결과 인덱스 배열
let DIST = null;       // 역 모드일 때 인덱스 -> 역까지 거리(m)
let shown = 0;
const filter = {
  q: '',
  place: 'gu',    // 'gu' = 자치구로 고르기, 'station' = 역 주변으로 고르기
  gu: -1,
  station: -1,
  radius: 500,
  group: '',
  sub: -1,
  pay: 0,        // 0=전체, 1=아동수당, 2=상품권, 3=둘 다
};

/* ---------------- 데이터 접근 ---------------- */

const groupOf = (i) => D.groupKeys[D.catGroup[D.c[i]]];
const colorOf = (i) => GROUP_COLOR[groupOf(i)] || GROUP_COLOR.life;
const catOf = (i) => D.cats[D.c[i]];
const guOf = (i) => (D.g[i] >= 0 ? D.gu[D.g[i]] : '');

function fullAddr(i) {
  const gu = guOf(i);
  const a = D.a[i];
  return [gu, a].filter(Boolean).join(' ');
}

function fmtPhone(p) {
  if (!p) return '';
  if (p.startsWith('02')) return `${p.slice(0, 2)}-${p.slice(2, -4)}-${p.slice(-4)}`;
  if (p.startsWith('1') && p.length === 8) return `${p.slice(0, 4)}-${p.slice(4)}`;
  if (p.length >= 9) return `${p.slice(0, 3)}-${p.slice(3, -4)}-${p.slice(-4)}`;
  return p;
}

/* ---------------- 검색 ---------------- */

const norm = (s) => s.replace(/\s+/g, '').toLowerCase();
const isChosung = (s) => /^[ㄱ-ㅎ]+$/.test(s);

const CHO_TABLE = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

function buildChosung() {
  CHO = new Array(D.n.length);
  for (let i = 0; i < D.n.length; i++) {
    const s = D.n[i];
    let out = '';
    for (let j = 0; j < s.length; j++) {
      const code = s.charCodeAt(j);
      if (code >= 0xac00 && code <= 0xd7a3) out += CHO_TABLE[Math.floor((code - 0xac00) / 588)];
    }
    CHO[i] = out;
  }
}

/** 두 좌표 사이 거리(m). 성남 정도 범위면 평면 근사로 충분하다. */
function metersBetween(lat1, lon1, lat2, lon2) {
  const dy = (lat1 - lat2) * 111320;
  const dx = (lon1 - lon2) * 88800;   // 위도 37.4°의 경도 1도 길이
  return Math.sqrt(dy * dy + dx * dx);
}

function search() {
  const raw = filter.q.trim();
  const q = norm(raw);
  const cho = q && isChosung(q);
  if (cho && !CHO) buildChosung();

  const st = filter.place === 'station' && filter.station >= 0 ? STATIONS[filter.station] : null;
  const dist = st ? new Map() : null;

  const out = [];
  const n = D.n.length;
  for (let i = 0; i < n; i++) {
    if (!st && filter.gu >= 0 && D.g[i] !== filter.gu) continue;
    if (filter.group && groupOf(i) !== filter.group) continue;
    if (filter.sub >= 0 && D.catSub[D.c[i]] !== filter.sub) continue;
    if (filter.pay === 3 ? D.pay[i] !== 3 : filter.pay && !(D.pay[i] & filter.pay)) continue;
    if (q) {
      if (cho ? !CHO[i].includes(q) : !NORM[i].includes(q)) continue;
    }
    if (st) {
      if (D.y[i] === null) continue;
      const d = metersBetween(st.y, st.x, D.y[i], D.x[i]);
      if (d > filter.radius) continue;
      dist.set(i, d);
    }
    out.push(i);
  }
  if (st) out.sort((a, b) => dist.get(a) - dist.get(b));   // 가까운 순

  results = out;
  DIST = dist;

  shown = 0;
  el.list.innerHTML = '';
  renderMore();
  updateTally();
  syncMarkers();
}

function updateTally() {
  el.hit.textContent = results.length.toLocaleString('ko-KR');
  const parts = [];
  if (filter.place === 'station' && filter.station >= 0) {
    const r = filter.radius >= 1000 ? '1km' : `${filter.radius}m`;
    parts.push(`${STATIONS[filter.station].n}역 ${r} 이내`);
  } else if (filter.gu >= 0) {
    parts.push(D.gu[filter.gu]);
  }
  if (filter.sub >= 0) parts.push(D.subs[filter.sub]);
  else if (filter.group) parts.push(D.groupLabels[D.groupKeys.indexOf(filter.group)]);
  if (filter.pay === 3) parts.push('아동수당+상품권');
  else if (filter.pay === 1) parts.push('아동수당');
  else if (filter.pay === 2) parts.push('상품권');
  if (filter.q.trim()) parts.push(`"${filter.q.trim()}"`);
  el.scope.textContent = parts.length
    ? `${parts.join(' · ')} — 전체 ${D.n.length.toLocaleString('ko-KR')}곳 중`
    : '성남시 전체';
  el.empty.hidden = results.length > 0;
}

/* ---------------- 목록 ---------------- */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PIN_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>';
const TEL_SVG = '<svg viewBox="0 0 24 24"><path d="M5 3h4l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/></svg>';

/** 결제 가능 수단 배지. 이 앱이 답하려는 질문이라 상호 바로 옆에 붙인다. */
function payBadges(i) {
  const p = D.pay[i];
  let out = '';
  if (p & PAY_CHILD) out += '<span class="pay pay--child">아동수당</span>';
  if (p & PAY_GIFT) out += '<span class="pay pay--gift">상품권</span>';
  return out;
}

const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);

function highlight(name) {
  const raw = filter.q.trim();
  if (!raw || isChosung(norm(raw))) return esc(name);
  const i = name.toLowerCase().indexOf(raw.toLowerCase());
  if (i < 0) return esc(name);
  return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + raw.length)) + '</mark>' + esc(name.slice(i + raw.length));
}

function renderMore() {
  const slice = results.slice(shown, shown + PAGE);
  const html = slice.map((i, n) => {
    const hasPos = D.y[i] !== null;
    const phone = fmtPhone(D.p[i]);
    const meta = [catOf(i), fullAddr(i)].filter(Boolean).join(' · ');
    const d = DIST ? DIST.get(i) : null;
    const walk = d != null
      ? `<span class="row__dist">${STATIONS[filter.station].n}역 ${fmtDist(d)}</span>`
      : '';
    return `<li class="row" data-n="${shown + n}">` +
      `<span class="row__bar" style="background:${colorOf(i)}"></span>` +
      `<div class="row__body">` +
        `<p class="row__name">${highlight(D.n[i])}${payBadges(i)}</p>` +
        `<p class="row__meta">${walk}${esc(meta)}</p>` +
      `</div>` +
      `<div class="row__acts">` +
        `<button class="act" data-act="map" ${hasPos ? '' : 'data-off'} aria-label="지도에서 보기">${PIN_SVG}</button>` +
        (phone
          ? `<a class="act" href="tel:${esc(D.p[i])}" aria-label="${esc(D.n[i])} 전화 걸기">${TEL_SVG}</a>`
          : `<span class="act" data-off aria-hidden="true">${TEL_SVG}</span>`) +
      `</div></li>`;
  }).join('');

  el.list.insertAdjacentHTML('beforeend', html);
  shown += slice.length;
  el.more.hidden = shown >= results.length;
  if (!el.more.hidden) {
    el.more.textContent = `더 보기 (${(results.length - shown).toLocaleString('ko-KR')}곳 남음)`;
  }
}

/* ---------------- 상세 시트 ---------------- */

function openSheet(i) {
  el.sheetCat.textContent = catOf(i);
  el.sheetCat.style.color = colorOf(i);
  el.sheetName.textContent = D.n[i];
  el.sheetAddr.textContent = fullAddr(i) ? `성남시 ${fullAddr(i)}` : '주소 정보 없음';

  const p = D.pay[i];
  const gift = p & PAY_GIFT
    ? (D.gt[i] ? `${D.giftTypes[D.gt[i]]} 가능` : '사용 가능')
    : '';
  el.sheetPay.innerHTML =
    `<div class="paylist__row${p & PAY_CHILD ? ' is-yes' : ''}">` +
      `<dt>아동수당 포인트</dt><dd>${p & PAY_CHILD ? '사용 가능' : '자료에 없음'}</dd></div>` +
    `<div class="paylist__row${p & PAY_GIFT ? ' is-yes' : ''}">` +
      `<dt>성남사랑상품권</dt><dd>${p & PAY_GIFT ? esc(gift) : '자료에 없음'}</dd></div>`;

  const acts = [];
  if (D.y[i] !== null) {
    const p = `${encodeURIComponent(D.n[i])},${D.y[i]},${D.x[i]}`;
    acts.push(`<a class="primary" href="https://map.kakao.com/link/to/${p}" target="_blank" rel="noopener">길찾기</a>`);
    acts.push(`<a href="https://map.kakao.com/link/map/${p}" target="_blank" rel="noopener">카카오맵에서 보기</a>`);
  } else {
    const term = encodeURIComponent(`${D.n[i]} ${fullAddr(i)}`);
    acts.push(`<a class="primary" href="https://map.kakao.com/link/search/${term}" target="_blank" rel="noopener">카카오맵에서 찾기</a>`);
  }
  const phone = fmtPhone(D.p[i]);
  if (phone) acts.push(`<a href="tel:${esc(D.p[i])}">${esc(phone)}</a>`);

  el.sheetActs.innerHTML = acts.join('');
  el.sheet.hidden = false;
}

/* ---------------- 지도 ---------------- */

let map = null, clusterer = null, markers = [];
let markersDirty = false;
const markerImages = {};

function markerImage(group) {
  if (markerImages[group]) return markerImages[group];
  const c = GROUP_COLOR[group] || GROUP_COLOR.life;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">` +
    `<path d="M13 33C13 33 24 21.4 24 13A11 11 0 1 0 2 13c0 8.4 11 20 11 20Z" fill="${c}" stroke="#fff" stroke-width="2.2"/>` +
    `<circle cx="13" cy="12.6" r="4.1" fill="#fff"/></svg>`;
  const img = new kakao.maps.MarkerImage(
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    new kakao.maps.Size(26, 34),
    { offset: new kakao.maps.Point(13, 33) }
  );
  markerImages[group] = img;
  return img;
}

/** 기본 클러스터(연두/노랑)는 앱 색과 따로 논다. 잉크색 원 + 큰 묶음만 주황으로. */
function clusterStyles() {
  const tiers = [[34, 13], [42, 14], [50, 15], [58, 16]];
  return tiers.map(([size, font], i) => ({
    width: `${size}px`, height: `${size}px`, lineHeight: `${size}px`,
    background: i === tiers.length - 1 ? 'rgba(255,90,31,.92)' : 'rgba(20,22,26,.86)',
    color: '#fff', textAlign: 'center', borderRadius: '50%',
    border: '2px solid rgba(255,255,255,.9)',
    boxShadow: '0 3px 10px rgba(20,22,26,.35)',
    fontSize: `${font}px`, fontWeight: '700',
    fontFamily: "'Pretendard Variable',Pretendard,sans-serif",
  }));
}

let stationCircle = null, stationLabel = null;

/** 역 모드에서 선택한 역과 반경 원을 지도에 겹쳐 그린다. */
function drawStation() {
  if (stationCircle) { stationCircle.setMap(null); stationCircle = null; }
  if (stationLabel) { stationLabel.setMap(null); stationLabel = null; }

  const st = filter.place === 'station' && filter.station >= 0 ? STATIONS[filter.station] : null;
  if (!st || !map) return;

  const pos = new kakao.maps.LatLng(st.y, st.x);
  stationCircle = new kakao.maps.Circle({
    center: pos, radius: filter.radius,
    strokeWeight: 2, strokeColor: '#1B45FF', strokeOpacity: 0.7, strokeStyle: 'shortdash',
    fillColor: '#1B45FF', fillOpacity: 0.07,
  });
  stationCircle.setMap(map);

  stationLabel = new kakao.maps.CustomOverlay({
    position: pos, yAnchor: 0.5, zIndex: 5,
    content: `<div class="stpin">${esc(st.n)}역</div>`,
  });
  stationLabel.setMap(map);
}

function syncMarkers() {
  if (!map || !clusterer) return;

  // 지도가 화면에 없으면(모바일 목록 탭) 마커를 다시 만들지 않는다.
  // 검색어를 칠 때마다 수천 개를 재생성하면 입력이 버벅인다.
  if (el.paneMap.offsetParent === null) { markersDirty = true; return; }
  markersDirty = false;

  clusterer.clear();
  markers = [];

  const withPos = results.filter((i) => D.y[i] !== null);
  const use = withPos.slice(0, MARKER_CAP);

  use.forEach((i) => {
    const mk = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(D.y[i], D.x[i]),
      image: markerImage(groupOf(i)),
      title: D.n[i],
    });
    kakao.maps.event.addListener(mk, 'click', () => {
      openSheet(i);
      map.panTo(mk.getPosition());
    });
    markers.push(mk);
  });

  clusterer.addMarkers(markers);
  drawStation();

  el.mapreset.hidden = use.length === 0;
  el.mapreset.textContent = withPos.length > MARKER_CAP
    ? `결과가 많아 ${MARKER_CAP.toLocaleString('ko-KR')}곳만 표시했습니다`
    : '검색 결과 전체 보기';

  fitToResults();
}

function fitToResults() {
  if (!map) return;

  // 역 모드면 결과가 없어도 반경 원이 보이도록 원에 맞춘다
  if (stationCircle) {
    map.setBounds(stationCircle.getBounds(), 24, 24, 24, 24);
    return;
  }
  if (!markers.length) {
    map.setCenter(new kakao.maps.LatLng(SEONGNAM.lat, SEONGNAM.lng));
    map.setLevel(7);
    return;
  }
  const b = new kakao.maps.LatLngBounds();
  markers.forEach((mk) => b.extend(mk.getPosition()));
  map.setBounds(b, 24, 24, 24, 24);
}

function bootMap(key) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=clusterer`;
    s.onerror = () => reject(new Error('SDK 로드 실패'));
    s.onload = () => {
      try {
        kakao.maps.load(() => {
          map = new kakao.maps.Map(el.map, {
            center: new kakao.maps.LatLng(SEONGNAM.lat, SEONGNAM.lng),
            level: 7,
          });
          clusterer = new kakao.maps.MarkerClusterer({
            map, averageCenter: true, minLevel: 6,
            calculator: [10, 100, 1000],
            styles: clusterStyles(),
          });
          el.mapkey.hidden = true;
          syncMarkers();
          resolve();
        });
      } catch (e) { reject(e); }
    };
    document.head.appendChild(s);
  });
}

async function tryBootMap(key, fromUser) {
  try {
    await bootMap(key);
    localStorage.setItem('kakaoKey', key);
  } catch (e) {
    localStorage.removeItem('kakaoKey');
    el.mapkey.hidden = false;
    if (fromUser) {
      alert('지도를 켜지 못했습니다.\n앱키가 맞는지, 카카오 개발자센터 플랫폼에 이 주소가 등록됐는지 확인해 주세요.');
    }
  }
}

/* ---------------- UI 조립 ---------------- */

const SUBWAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="13" rx="4"/><path d="M8 19l-2 2M16 19l2 2M5 11h14"/></svg>';
const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg>';

function buildPayChips() {
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < D.n.length; i++) {
    counts[0]++;
    if (D.pay[i] & PAY_CHILD) counts[1]++;
    if (D.pay[i] & PAY_GIFT) counts[2]++;
    if (D.pay[i] === 3) counts[3]++;
  }
  el.payChips.innerHTML = PAY_FILTERS.map((f, n) =>
    `<button class="chip chip--sm${filter.pay === f.v ? ' is-on' : ''}" data-pay="${f.v}">` +
    `${esc(f.label)} <span style="opacity:.55">${counts[n].toLocaleString('ko-KR')}</span></button>`
  ).join('') + '<span class="chips__hint">결제수단</span>';
}

/** 자치구 모드 <-> 역 주변 모드. 두 줄을 쓰지 않도록 한 줄에서 갈아끼운다. */
function buildPlaceChips() {
  if (filter.place === 'gu') {
    const html = [
      `<button class="chip chip--mode" data-mode="station">${SUBWAY_ICON} 역 주변</button>`,
      `<button class="chip${filter.gu < 0 ? ' is-on' : ''}" data-gu="-1">성남 전체</button>`,
    ];
    D.gu.forEach((name, i) => {
      html.push(`<button class="chip${filter.gu === i ? ' is-on' : ''}" data-gu="${i}">${esc(name)}</button>`);
    });
    el.placeChips.innerHTML = html.join('');
    el.radiusChips.hidden = true;
  } else {
    const html = [`<button class="chip chip--mode" data-mode="gu">${BACK_ICON} 자치구</button>`];
    STATIONS.forEach((s, i) => {
      html.push(
        `<button class="chip${filter.station === i ? ' is-on' : ''}" data-st="${i}" title="${esc(s.l)}">` +
        `${esc(s.n)}<span class="chip__sub">역</span></button>`
      );
    });
    el.placeChips.innerHTML = html.join('');
    el.radiusChips.innerHTML = RADII.map((r) =>
      `<button class="chip chip--sm${filter.radius === r ? ' is-on' : ''}" data-r="${r}">` +
      `${r >= 1000 ? '1km' : r + 'm'}</button>`).join('') +
      `<span class="chips__hint">역에서 걸어서</span>`;
    el.radiusChips.hidden = false;
  }
}

function buildCatChips() {
  const counts = {};
  for (let i = 0; i < D.n.length; i++) {
    const g = groupOf(i);
    counts[g] = (counts[g] || 0) + 1;
  }
  const keys = D.groupKeys.filter((k) => counts[k]).sort((a, b) => counts[b] - counts[a]);
  const html = [`<button class="chip${filter.group ? '' : ' is-on'}" data-group="">업종 전체</button>`];
  keys.forEach((k) => {
    const label = D.groupLabels[D.groupKeys.indexOf(k)];
    html.push(
      `<button class="chip${filter.group === k ? ' is-on' : ''}" data-group="${k}">` +
      `<span style="color:${GROUP_COLOR[k]}">●</span> ${esc(label)} ` +
      `<span style="opacity:.55">${counts[k].toLocaleString('ko-KR')}</span></button>`
    );
  });
  el.catChips.innerHTML = html.join('');
  buildSubChips();
}

/** 업종 그룹을 고르면 그 그룹의 세부 업종만 아래 줄에 펼친다. */
function buildSubChips() {
  if (!filter.group) {
    el.subChips.hidden = true;
    el.subChips.innerHTML = '';
    return;
  }
  const gi = D.groupKeys.indexOf(filter.group);
  const counts = {};
  for (let i = 0; i < D.n.length; i++) {
    const s = D.catSub[D.c[i]];
    if (D.subGroup[s] === gi) counts[s] = (counts[s] || 0) + 1;
  }
  const subs = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a]);
  if (subs.length < 2) {           // 나눌 게 없으면 줄을 만들지 않는다
    el.subChips.hidden = true;
    return;
  }
  const html = [`<button class="chip chip--sm${filter.sub < 0 ? ' is-on' : ''}" data-sub="-1">전체</button>`];
  subs.forEach((s) => {
    html.push(
      `<button class="chip chip--sm${filter.sub === s ? ' is-on' : ''}" data-sub="${s}">` +
      `${esc(D.subs[s])} <span style="opacity:.55">${counts[s].toLocaleString('ko-KR')}</span></button>`
    );
  });
  el.subChips.innerHTML = html.join('');
  el.subChips.hidden = false;
}

function setPane(which) {
  const isMap = which === 'map';
  el.tabList.classList.toggle('is-on', !isMap);
  el.tabMap.classList.toggle('is-on', isMap);
  el.tabList.setAttribute('aria-selected', String(!isMap));
  el.tabMap.setAttribute('aria-selected', String(isMap));
  el.paneList.classList.toggle('is-on', !isMap);
  el.paneMap.classList.toggle('is-on', isMap);
  if (isMap && map) {
    map.relayout();
    if (markersDirty) syncMarkers(); else fitToResults();
  }
}

function measureControls() {
  const c = document.querySelector('.controls');
  if (c) document.documentElement.style.setProperty('--controls-h', c.offsetHeight + 'px');
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function init() {
  el.originHint.textContent = location.protocol.startsWith('http')
    ? location.origin
    : '로컬 파일(file://)에서는 지도를 켤 수 없습니다';

  const runSearch = debounce(search, 120);
  el.q.addEventListener('input', () => {
    filter.q = el.q.value;
    el.clear.hidden = !el.q.value;
    runSearch();
  });
  el.clear.addEventListener('click', () => {
    el.q.value = ''; filter.q = ''; el.clear.hidden = true; search(); el.q.focus();
  });
  el.more.addEventListener('click', renderMore);

  el.payChips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filter.pay = Number(b.dataset.pay);
    el.payChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === b));
    search();
  });

  el.placeChips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (b.dataset.mode) {
      filter.place = b.dataset.mode;
      filter.gu = -1;
      filter.station = filter.place === 'station' ? 0 : -1;   // 역 모드는 첫 역부터
    } else if (b.dataset.gu !== undefined) {
      filter.gu = Number(b.dataset.gu);
    } else if (b.dataset.st !== undefined) {
      filter.station = Number(b.dataset.st);
    }
    buildPlaceChips();
    search();
  });

  el.radiusChips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filter.radius = Number(b.dataset.r);
    buildPlaceChips();
    search();
  });

  el.catChips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filter.group = b.dataset.group || '';
    filter.sub = -1;
    el.catChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === b));
    buildSubChips();
    search();
  });

  el.subChips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filter.sub = Number(b.dataset.sub);
    el.subChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === b));
    search();
  });
  el.tabList.addEventListener('click', () => setPane('list'));
  el.tabMap.addEventListener('click', () => setPane('map'));
  el.sheetClose.addEventListener('click', () => { el.sheet.hidden = true; });
  el.mapreset.addEventListener('click', fitToResults);

  el.list.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const i = results[+row.dataset.n];
    if (i === undefined) return;

    if (e.target.closest('[data-act="map"]')) {
      if (D.y[i] === null) return;
      setPane('map');
      if (map) { map.setLevel(3); map.setCenter(new kakao.maps.LatLng(D.y[i], D.x[i])); }
      openSheet(i);
      return;
    }
    if (e.target.closest('a')) return;   // 전화 링크는 그대로 둔다
    openSheet(i);
  });

  el.keySave.addEventListener('click', () => {
    const k = el.keyInput.value.trim();
    if (k) tryBootMap(k, true);
  });
  el.keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.keySave.click(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.sheet.hidden = true; });
  window.addEventListener('resize', debounce(measureControls, 150));

  try {
    const res = await fetch('merchants.json');
    if (!res.ok) throw new Error(res.status);
    D = await res.json();
  } catch (e) {
    el.scope.textContent = '데이터를 불러오지 못했습니다';
    el.hit.textContent = '—';
    return;
  }

  NORM = D.n.map(norm);
  el.footMeta.textContent =
    `가맹점 ${D.n.length.toLocaleString('ko-KR')}곳 · 자료 기준일 ${D.updated}`;

  buildPayChips();
  buildPlaceChips();
  buildCatChips();
  search();
  measureControls();

  const key = new URLSearchParams(location.search).get('key')
    || localStorage.getItem('kakaoKey')
    || KAKAO_KEY;
  if (key) tryBootMap(key, false);
}

init();
