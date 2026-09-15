/* 성남시 아동수당 포인트 가맹점 찾기
   데이터: merchants.json — 필드별 배열(컬럼) 구조. 한 건은 인덱스 하나로 다룬다. */
'use strict';

// 카카오 JavaScript 키. 브라우저에 노출되는 값이라 숨길 수 없고, 등록된 도메인
// (pjungjin85-sketch.github.io)에서만 동작하므로 다른 사이트에 옮겨 써도 소용없다.
// 키를 바꾸려면 지도 탭에서 새 키를 넣으면 되고, 그 값이 이 기본값을 덮는다.
const KAKAO_KEY = 'a83ccf5d0f76a309473878b4530aa580';

const PAGE = 60;            // 목록을 한 번에 그리는 개수
const MARKER_CAP = 2500;    // 지도에 한 번에 올리는 마커 상한
const SEONGNAM = { lat: 37.4200, lng: 127.1265 };

const GROUP_COLOR = {
  food: '#FF5A1F', mart: '#00A05A', med: '#E8334A', edu: '#1B45FF',
  beauty: '#9B3BE8', fashion: '#E0348C', leisure: '#009BB0', life: '#6A7280',
};

const $ = (id) => document.getElementById(id);
const el = {
  q: $('q'), clear: $('clear'), hit: $('hit'), scope: $('scope'),
  guChips: $('guChips'), catChips: $('catChips'),
  tabList: $('tabList'), tabMap: $('tabMap'), paneList: $('paneList'), paneMap: $('paneMap'),
  list: $('list'), more: $('more'), empty: $('empty'),
  map: $('map'), mapkey: $('mapkey'), keyInput: $('keyInput'), keySave: $('keySave'),
  originHint: $('originHint'), mapreset: $('mapreset'),
  sheet: $('sheet'), sheetClose: $('sheetClose'), sheetCat: $('sheetCat'),
  sheetName: $('sheetName'), sheetAddr: $('sheetAddr'), sheetActs: $('sheetActs'),
  footMeta: $('footMeta'),
};

let D = null;          // 원본 컬럼 데이터
let NORM = null;       // 검색용 정규화 이름
let CHO = null;        // 초성 인덱스 (처음 초성 검색할 때 만든다)
let results = [];      // 결과 인덱스 배열
let shown = 0;
const filter = { q: '', gu: -1, group: '' };

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

function search() {
  const raw = filter.q.trim();
  const q = norm(raw);
  const cho = q && isChosung(q);
  if (cho && !CHO) buildChosung();

  const out = [];
  const n = D.n.length;
  for (let i = 0; i < n; i++) {
    if (filter.gu >= 0 && D.g[i] !== filter.gu) continue;
    if (filter.group && groupOf(i) !== filter.group) continue;
    if (q) {
      if (cho ? !CHO[i].includes(q) : !NORM[i].includes(q)) continue;
    }
    out.push(i);
  }
  results = out;

  shown = 0;
  el.list.innerHTML = '';
  renderMore();
  updateTally();
  syncMarkers();
}

function updateTally() {
  el.hit.textContent = results.length.toLocaleString('ko-KR');
  const parts = [];
  if (filter.gu >= 0) parts.push(D.gu[filter.gu]);
  if (filter.group) parts.push(D.groupLabels[D.groupKeys.indexOf(filter.group)]);
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
    return `<li class="row" data-n="${shown + n}">` +
      `<span class="row__bar" style="background:${colorOf(i)}"></span>` +
      `<div class="row__body">` +
        `<p class="row__name">${highlight(D.n[i])}</p>` +
        `<p class="row__meta">${esc(meta)}</p>` +
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

  el.mapreset.hidden = use.length === 0;
  el.mapreset.textContent = withPos.length > MARKER_CAP
    ? `결과가 많아 ${MARKER_CAP.toLocaleString('ko-KR')}곳만 표시했습니다`
    : '검색 결과 전체 보기';

  fitToResults();
}

function fitToResults() {
  if (!map) return;
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

function buildCatChips() {
  const counts = {};
  for (let i = 0; i < D.n.length; i++) {
    const g = groupOf(i);
    counts[g] = (counts[g] || 0) + 1;
  }
  const keys = D.groupKeys.filter((k) => counts[k]).sort((a, b) => counts[b] - counts[a]);
  const html = ['<button class="chip is-on" data-group="">업종 전체</button>'];
  keys.forEach((k) => {
    const label = D.groupLabels[D.groupKeys.indexOf(k)];
    html.push(
      `<button class="chip" data-group="${k}">` +
      `<span style="color:${GROUP_COLOR[k]}">●</span> ${esc(label)} ` +
      `<span style="opacity:.55">${counts[k].toLocaleString('ko-KR')}</span></button>`
    );
  });
  el.catChips.innerHTML = html.join('');
}

function wireChips(container, apply) {
  container.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    container.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === b));
    apply(b);
    search();
  });
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
  wireChips(el.guChips, (b) => { filter.gu = b.dataset.gu === '' ? -1 : Number(b.dataset.gu); });
  wireChips(el.catChips, (b) => { filter.group = b.dataset.group || ''; });
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

  // 구 칩에 인덱스 부여 (데이터의 gu 순서를 따른다)
  el.guChips.querySelectorAll('.chip').forEach((c) => {
    const name = c.textContent.trim();
    c.dataset.gu = name === '전체' ? '' : String(D.gu.indexOf(name));
  });

  buildCatChips();
  search();
  measureControls();

  const key = new URLSearchParams(location.search).get('key')
    || localStorage.getItem('kakaoKey')
    || KAKAO_KEY;
  if (key) tryBootMap(key, false);
}

init();
