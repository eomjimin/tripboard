import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig, APP_NAME } from './config.js';

const $app = document.getElementById('app');
const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
let fs = null, auth = null, me = null, unsubs = [], tripUnsub = null;
// trips/{tripId} holds the trip's own fields (title, tag, dates, members); days and tasks live under it.
let trips = [], gotTrips = false, tripId = null, wantTrip = location.hash.slice(1) || null;
const myEmail = () => (me && me.email || '').toLowerCase();
const curTrip = () => trips.find(t => t.id === tripId) || null;
if (configured) {
  const fbApp = initializeApp(firebaseConfig);
  auth = getAuth(fbApp);
  // Local cache keeps the plan readable and editable offline; writes sync when the phone is back online.
  fs = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
}
const ref = (...p) => doc(fs, 'trips', tripId, ...p);
const col = name => collection(fs, 'trips', tripId, name);
const WD =['일', '월', '화', '수', '목', '금', '토'];
const CITY = { '바르셀로나': ['bcn', 'BCN'], '포르투': ['opo', 'OPO'], '세비야': ['svq', 'SVQ'], '지로나': ['gro', 'GRO'],
  '리스본': ['etc', 'LIS'], '마드리드': ['etc', 'MAD'], '그라나다': ['etc', 'GRX'], '발렌시아': ['etc', 'VLC'] };
// Card kinds. 플랜B marks a backup for closures, weather or sold-out tickets.
const CATS = [['sight', '관광'], ['food', '식당'], ['cafe', '카페'], ['move', '이동'], ['stay', '숙박'],
  ['shop', '쇼핑'], ['show', '체험·공연'], ['rest', '휴식·자유'], ['planb', '플랜B'], ['etc', '기타']];
const catKey = k => CATS.some(c => c[0] === k) ? k : 'etc';
const catName = k => CATS.find(c => c[0] === catKey(k))[1];
const catChip = k => `<span class="kchip" style="--k:var(--k-${catKey(k)})">${catName(k)}</span>`;

let readOnly = false, status = 'loading', gotDays = false, gotTasks = false;
let days = [], tasks = [];
const ui = { settings: false, confirmTrip: false, newTrip: false, view: 'board', filter: 'all', detail: null, catFilter: null, draft: null, menuDay: null, confirmDay: null, editItem: null, addTo: null, editTask: null, focus: null, toast: '' };
let pending = false, toastTimer = null, didInitialScroll = false, drag = null, justDragged = false;

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => crypto.randomUUID();
const dt = id => { const [y, m, d] = id.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const md = id => { const d = dt(id); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const wdi = id => dt(id).getUTCDay();
const addDays = (id, n) => { const d = dt(id); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diff = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
const todayId = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const cityKey = c => (CITY[c] || ['etc'])[0];
const cityCode = c => CITY[c] ? CITY[c][1] : String(c || '').slice(0, 3).toUpperCase();
const clone = o => JSON.parse(JSON.stringify(o));
const getDay = id => days.find(d => d.id === id);
const dayLabel = o => `${md(o.id)} (${WD[wdi(o.id)]}) ${o.title || ''}`;
// A checklist item belongs to a card (itemId); its day follows the card wherever the card moves.
function findItem(itemId) {
  if (!itemId) return null;
  for (const d of days) { const it = (d.items || []).find(x => x.id === itemId); if (it) return { day: d, item: it }; }
  return null;
}
const tdate = t => { const f = findItem(t.itemId); return f ? f.day.id : (t.date || ''); };
const itemTasks = itemId => tasks.filter(t => t.itemId === itemId).sort((a, b) => (a.order || 0) - (b.order || 0));
const itemText = it => (it.time ? it.time + ' · ' : '') + it.text;
function targetOptions(day, item) {
  return `<option value="|" ${!day && !item ? 'selected' : ''}>연결 안 함</option>` + days.map(d => `<optgroup label="${esc(dayLabel(d))}">
    <option value="${d.id}|" ${day === d.id && !item ? 'selected' : ''}>${md(d.id)} 하루 전체</option>
    ${(d.items || []).map(it => `<option value="${d.id}|${it.id}" ${item === it.id ? 'selected' : ''}>${esc(itemText(it))}</option>`).join('')}
  </optgroup>`).join('');
}

function stayGroups() {
  const gs = []; let cur = null;
  for (const d of days) {
    const L = (d.lodging || '').trim();
    if (L && cur && cur.city === L && diff(cur.end, d.id) === 1) { cur.end = d.id; cur.ids.push(d.id); }
    else if (L) { cur = { city: L, start: d.id, end: d.id, ids: [d.id] }; gs.push(cur); }
    else cur = null;
  }
  return gs;
}

/* ---------- persistence ---------- */
const queues = {};
function write(path, fn) { queues[path] = (queues[path] || Promise.resolve()).then(fn).catch(onWriteError); }
function onWriteError(e) {
  if (e && e.code === 'permission-denied') { readOnly = true; toast('이 계정에는 편집 권한이 없어 저장하지 못했습니다.'); }
  else if (e && e.code === 'resource-exhausted') toast('저장 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.');
  else toast('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  draw();
}
/*
 * Firestore layout (every id is a UUID):
 *   trips/{tripId}                 title, tag, start, end, owner, members[]
 *   trips/{tripId}/days/{dayId}    date (YYYY-MM-DD), title, place, lodging, note
 *   trips/{tripId}/items/{itemId}  dayId → days, order, cat, time, text
 *   trips/{tripId}/checklist/{id}  scope 'item' | 'day' | 'none'; exactly the matching id is set, the other is null:
 *                                  itemId → items (scope item), dayId → days (scope day); text, done, order
 *   A card's checklist has no dayId of its own: its day is always the card's day, so moving a card needs no checklist writes.
 * The screens work on a date-keyed view built from these (days[i].id = date, days[i].items = its cards);
 * the save functions below translate that view back into per-collection writes.
 */
const raw = { days: new Map(), items: new Map(), checklist: new Map() };
const got = { days: false, items: false, checklist: false };
const dayUuid = date => { for (const [id, d] of raw.days) if (d.date === date) return id; return null; };
const same = (a, b) => !!a && Object.keys(b).every(k => a[k] === b[k]);
function rebuild() {
  const byDay = new Map();
  for (const [id, it] of raw.items) { if (!byDay.has(it.dayId)) byDay.set(it.dayId, []); byDay.get(it.dayId).push({ id, ...it }); }
  days = [...raw.days].map(([uuid, d]) => ({
    id: d.date, uuid, title: d.title || '', place: d.place || '', lodging: d.lodging || '', note: d.note || '',
    items: (byDay.get(uuid) || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(({ id, cat, time, text }) => ({ id, cat, time, text })),
  })).sort((a, b) => a.id < b.id ? -1 : 1);
  const dateOf = new Map([...raw.days].map(([id, d]) => [id, d.date]));
  tasks = [...raw.checklist].map(([id, c]) => ({
    id, text: c.text, done: !!c.done, order: c.order || 0,
    itemId: c.scope === 'item' ? c.itemId : '',
    date: c.scope === 'day' ? (dateOf.get(c.dayId) || '') : '',
  }));
  gotDays = got.days && got.items; gotTasks = got.checklist;
}
function resetRaw() {
  for (const c of ['days', 'items', 'checklist']) { raw[c] = new Map(); got[c] = false; }
  rebuild();
}
// Offline, setDoc resolves only after sync, so writes are fired without blocking the UI; Firestore queues them.
function put(colName, id, body) {
  raw[colName].set(id, body);
  if (fs) write(colName + '/' + id, () => { setDoc(ref(colName, id), body).catch(onWriteError); });
}
function drop(colName, id) {
  raw[colName].delete(id);
  if (fs) write(colName + '/' + id, () => { deleteDoc(ref(colName, id)).catch(onWriteError); });
}
// Saves one date's column: the day row, plus every card now in it (dayId + order). Cards that left the
// column are written by the column they moved to; deleting a card goes through removeItem.
function saveDay(day) {
  const uuid = day.uuid || dayUuid(day.id) || uid();
  const row = { date: day.id, title: day.title || '', place: day.place || '', lodging: day.lodging || '', note: day.note || '' };
  if (!same(raw.days.get(uuid), row)) put('days', uuid, row);
  (day.items || []).forEach((it, i) => {
    const r = { dayId: uuid, order: i, cat: it.cat || 'etc', time: it.time || '', text: it.text || '' };
    if (!same(raw.items.get(it.id), r)) put('items', it.id, r);
  });
  rebuild(); syncRange();
}
function removeItem(id) { drop('items', id); rebuild(); }
function removeDay(date) {
  const uuid = dayUuid(date); if (!uuid) return;
  for (const [id, it] of raw.items) if (it.dayId === uuid) drop('items', id);
  drop('days', uuid); rebuild(); syncRange();
}
// The trip list shows dates without loading every day, so keep start/end on the trip doc in step.
function syncRange() {
  const t = curTrip(); if (!t || !days.length) return;
  const start = days[0].id, end = days[days.length - 1].id;
  if (t.start !== start || t.end !== end) saveTrip({ start, end });
}
function saveTrip(patch, id = tripId) {
  trips = trips.map(t => t.id === id ? { ...t, ...patch } : t);
  setDoc(doc(fs, 'trips', id), patch, { merge: true }).catch(onWriteError);
}
function saveTask(t) {
  const onItem = t.itemId && raw.items.has(t.itemId), dayId = !onItem && t.date ? dayUuid(t.date) : null;
  const row = {
    scope: onItem ? 'item' : dayId ? 'day' : 'none',
    itemId: onItem ? t.itemId : null, dayId: dayId || null,
    text: t.text, done: !!t.done, order: t.order || 0,
  };
  if (!same(raw.checklist.get(t.id), row)) put('checklist', t.id, row);
  rebuild();
}
function removeTask(id) { drop('checklist', id); rebuild(); }
// Creates the trip doc first, then its days in a second commit: the rules check membership on the trip doc,
// and Firestore sends queued commits in order, so the days arrive after the trip exists.
function createTrip({ title, tag = '', start, end }) {
  const id = uid();
  const body = { title, tag, start, end, owner: myEmail(), members: [myEmail()], createdAt: Date.now() };
  trips = [...trips, { id, ...body }];
  setDoc(doc(fs, 'trips', id), body).catch(onWriteError);
  const b = writeBatch(fs);
  for (let d = start; d <= end; d = addDays(d, 1)) b.set(doc(fs, 'trips', id, 'days', uid()), { date: d, title: '', place: '', lodging: '', note: '' });
  b.commit().catch(onWriteError);
  return id;
}
function deleteTrip() {
  const id = tripId, b = writeBatch(fs);
  for (const c of ['days', 'items', 'checklist']) for (const k of raw[c].keys()) b.delete(ref(c, k));
  b.commit().then(() => deleteDoc(doc(fs, 'trips', id))).catch(onWriteError);
  trips = trips.filter(t => t.id !== id);
  closeTrip();
  toast('여행을 삭제했습니다.');
}

/* ---------- render ---------- */
function isBusy() {
  if (drag && drag.active) return true;
  const a = document.activeElement;
  return a && $app.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && a.type !== 'checkbox'));
}
function render() { if (isBusy()) { pending = true; return; } draw(); }
function flush() { if (pending && !isBusy()) { pending = false; draw(); } }
$app.addEventListener('focusout', () => setTimeout(flush, 0));

function toast(msg) {
  ui.toast = msg; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = ''; const t = $app.querySelector('.toast'); if (t) t.remove(); }, 3200);
}

function draw() {
  // keep unsaved edits in an open card form across re-renders (e.g. after ticking its checklist)
  const ef = $app.querySelector('form[data-form="item-save"]');
  if (ef && ui.editItem && ef.dataset.id === ui.editItem.id) {
    ui.draft = { key: ef.dataset.id, time: ef.time.value, text: ef.text.value, to: ef.to.value, cat: (ef.querySelector('input[name=cat]:checked') || {}).value || 'etc' };
  }
  document.body.classList.toggle('ro', readOnly);
  const sl = $app.querySelector('.board')?.scrollLeft || 0;
  const groups = stayGroups();
  const stayOf = {};
  groups.forEach(g => g.ids.forEach((id, i) => stayOf[id] = { n: i + 1, total: g.ids.length }));
  if (status !== 'ready') { $app.innerHTML = gate(); return; }
  if (!tripId || !curTrip()) { document.title = APP_NAME; $app.innerHTML = tripList() + toastHtml(); return; }
  document.title = `${curTrip().title} · ${APP_NAME}`;
  const open = tasks.filter(t => !t.done).length;
  const tab = (k, label, count) => `<button role="tab" data-act="view" data-v="${k}" aria-selected="${ui.view === k}">${label}${count ? `<span class="count">${count}</span>` : ''}</button>`;
  let body;
  if (ui.view === 'check') body = checkView();
  else if (ui.view === 'stay') body = stayView(groups);
  else body = board(stayOf);
  const cities = [...new Set([...Object.keys(CITY), ...days.map(x => x.place).filter(Boolean), ...days.map(x => x.lodging).filter(Boolean)])];
  $app.innerHTML = header(groups) + route(groups) + `
    <div class="bar">
      <div class="seg-ctl" role="tablist">${tab('board', '일정 보드')}${tab('check', '예매 체크리스트', open)}${tab('stay', '숙박')}</div>
      ${ui.view === 'board' ? `<span class="hint edit-only">날짜를 누르면 그날 카드별 체크리스트가 열립니다. 카드는 끌어서 옮기고(폰은 꾹 눌러서), 눌러서 종류·체크리스트를 고칩니다.</span>
      <div class="nav"><button data-act="scroll" data-dir="-1" aria-label="이전 날짜">‹</button><button data-act="scroll" data-dir="1" aria-label="다음 날짜">›</button></div>` : ''}
    </div>
    ${ui.view === 'board' ? `<div class="klegend"><span class="lbl">종류별 보기</span>${CATS.map(([k, l]) => `<button class="kchip" style="--k:var(--k-${k})" data-act="catf" data-k="${k}" aria-pressed="${ui.catFilter === k}">${l}</button>`).join('')}</div>
    ${dateStrip()}` : ''}
    <datalist id="cities">${cities.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    ${body}` + (ui.detail && getDay(ui.detail) ? detail() : '') + (ui.settings ? settings() : '') + toastHtml();
  const b = $app.querySelector('.board');
  if (b) {
    b.scrollLeft = sl;
    if (!didInitialScroll && days.length) { didInitialScroll = true; scrollToToday(false); }
    syncStrip();
  }
  if (ui.focus) { const el = $app.querySelector(ui.focus); if (el) { el.focus({ preventScroll: true }); if (el.tagName === 'INPUT') el.select(); } ui.focus = null; }
}

/* During the trip the board opens on today's column; before it, on day 1. */
function scrollToToday(smooth) {
  const b = $app.querySelector('.board'); if (!b) return;
  const c = $app.querySelector('.col.is-today') || $app.querySelector('.col');
  if (c) b.scrollTo({ left: c.offsetLeft - b.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
}
function dateStrip() {
  if (!days.length) return '';
  const t = todayId();
  return `<nav class="dstrip" aria-label="날짜로 이동">${days.map(d => {
    const x = dt(d.id), w = x.getUTCDay();
    return `<button data-act="jump" data-day="${d.id}" class="${d.id === t ? 'is-today' : ''}" style="--c:var(--c-${cityKey(d.place)})"><b>${x.getUTCDate()}</b><small class="${w === 0 || w === 6 ? 'we' : ''}">${d.id === t ? '오늘' : WD[w]}</small></button>`;
  }).join('')}</nav>`;
}
// Highlight the strip chip for the column currently at the board's left edge.
function syncStrip() {
  const b = $app.querySelector('.board'), s = $app.querySelector('.dstrip'); if (!b || !s) return;
  const cols = [...b.querySelectorAll('.col:not(.newcol)')];
  let cur = cols[0];
  for (const c of cols) { if (c.offsetLeft - b.offsetLeft <= b.scrollLeft + 40) cur = c; }
  const id = cur && cur.id.slice(2);
  s.querySelectorAll('button').forEach(btn => {
    const on = btn.dataset.day === id;
    if (on !== (btn.getAttribute('aria-current') === 'true')) {
      btn.setAttribute('aria-current', on);
      if (on) s.scrollTo({ left: btn.offsetLeft - s.offsetLeft - s.clientWidth / 2 + btn.offsetWidth / 2, behavior: 'smooth' });
    }
  });
}
let stripRaf = 0;
$app.addEventListener('scroll', e => { if (e.target.classList && e.target.classList.contains('board')) { cancelAnimationFrame(stripRaf); stripRaf = requestAnimationFrame(syncStrip); } }, true);

function gate() {
  const box = (title, body) => `<div class="gate"><div class="eyebrow">날짜별 여행 일정 보드</div><h1>${APP_NAME}</h1><h2>${title}</h2>${body}</div>`;
  if (status === 'setup') return box('Firebase 설정이 필요합니다', `<p>config.js에 Firebase 웹 앱 설정값을 넣은 뒤 다시 배포해 주세요. 방법은 README에 있습니다.</p>`);
  if (status === 'denied') return box('이 계정은 접근 권한이 없습니다', `<p>${esc(me && me.email)} 계정은 이 여행에 초대되지 않았습니다. 초대된 구글 계정으로 다시 로그인해 주세요.</p><button class="btn" data-act="signout">다른 계정으로 로그인</button>`);
  if (status === 'signin') return box('로그인하고 일정을 열어 주세요', `<p>초대된 구글 계정으로 로그인하면 일정을 보고 고칠 수 있습니다.</p><button class="btn big" data-act="signin">Google 계정으로 로그인</button>`);
  return box('불러오는 중입니다…', '');
}

const toastHtml = () => ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : '';

/* --- trip list (home) --- */
function tripList() {
  const t = todayId();
  const sorted = [...trips].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const upcoming = sorted.filter(x => !x.end || x.end >= t), past = sorted.filter(x => x.end && x.end < t).reverse();
  const card = x => {
    let when = '';
    if (x.start) {
      const u = diff(t, x.start);
      when = u > 0 ? `D-${u}` : diff(t, x.end) >= 0 ? `여행 ${1 - u}일차` : '다녀옴';
    }
    const n = x.start && x.end ? diff(x.start, x.end) : null;
    return `<button class="tripcard ${until(x) <= 0 && x.end >= t ? 'now' : ''}" data-act="open-trip" data-id="${esc(x.id)}">
      <span class="tc-when">${when}</span>
      ${x.tag ? `<span class="eyebrow">${esc(x.tag)}</span>` : ''}
      <b>${esc(x.title || '이름 없는 여행')}</b>
      <span class="tc-dates">${x.start ? `${x.start.replace(/-/g, '.')} – ${md(x.end).replace('/', '.')} · ${n}박 ${n + 1}일` : '날짜 미정'}</span>
      <span class="tc-who">${(x.members || []).length}명이 함께</span>
    </button>`;
  };
  const until = x => x.start ? diff(t, x.start) : 1;
  const nextStart = todayId();
  return `<header class="home-top">
      <div><div class="eyebrow">날짜별 여행 일정 보드</div><h1>${APP_NAME}</h1></div>
      <button class="acct" data-act="signout">${esc(me && me.email)} · 로그아웃</button>
    </header>
    <section class="trips">
      ${upcoming.map(card).join('')}
      ${ui.newTrip ? `<form class="tripcard newtrip form" data-form="trip-new">
          <b>새 여행</b>
          <label>여행 이름<input name="title" id="nt-title" placeholder="예: 도쿄 벚꽃 여행" required></label>
          <label>부제 (선택)<input name="tag" id="nt-tag" placeholder="예: ICN ⇄ HND"></label>
          <div class="row2">
            <label>출발<input type="date" name="start" id="nt-start" value="${nextStart}" required></label>
            <label>귀국<input type="date" name="end" id="nt-end" value="${addDays(nextStart, 4)}" required></label>
          </div>
          <div class="actions"><button type="button" class="btn sec" data-act="new-trip-close">취소</button><button class="btn">만들기</button></div>
        </form>`
        : `<button class="tripcard addtrip" data-act="new-trip">+ 새 여행 만들기</button>`}
    </section>
    ${past.length ? `<h2 class="past-h">지난 여행</h2><section class="trips past">${past.map(card).join('')}</section>` : ''}`;
}

/* --- trip settings: name, subtitle, people --- */
function settings() {
  const t = curTrip(), owner = t.owner === myEmail();
  return `<div class="scrim" data-act="close-settings"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="여행 설정">
    <div class="dhd"><span></span><div><h2>여행 설정</h2><p>${esc(t.title)}</p></div><button class="x" data-act="close-settings" aria-label="닫기">×</button></div>
    <div class="dbody">
      <form class="form" data-form="trip-save" style="box-shadow:none">
        <label>여행 이름<input name="title" id="ts-title" value="${esc(t.title)}" required></label>
        <label>부제 (예: 출발·도착 공항)<input name="tag" id="ts-tag" value="${esc(t.tag)}" placeholder="예: BCN in · BCN out"></label>
        <div class="actions"><button class="btn">저장</button></div>
      </form>
      <section class="dsec">
        <div class="dsec-h"><b>함께하는 사람</b><span class="n">${(t.members || []).length}명</span></div>
        <ul class="dlist members">${(t.members || []).map(m => `<li><span></span><span>${esc(m)}${m === t.owner ? ' <small class="muted">· 만든 사람</small>' : ''}${m === myEmail() ? ' <small class="muted">· 나</small>' : ''}</span>
          ${owner && m !== t.owner ? `<button class="ib" data-act="member-del" data-email="${esc(m)}" aria-label="${esc(m)} 빼기">빼기</button>` : '<span></span>'}</li>`).join('')}</ul>
        ${owner ? `<form class="icadd" data-form="member-add" style="margin-top:8px"><input type="email" name="email" id="ts-mem" placeholder="동행자 구글 이메일" required autocomplete="off"><button class="btn sec">초대</button></form>
          <p class="note-s">초대된 사람은 같은 주소에서 자기 구글 계정으로 로그인하면 이 여행이 보입니다.</p>` : `<p class="note-s">사람 추가와 삭제는 여행을 만든 사람만 할 수 있습니다.</p>`}
      </section>
      ${owner ? `<section class="dsec loose">
        ${ui.confirmTrip ? `<p class="confirm" style="margin:0 0 8px">이 여행의 날짜·카드·체크리스트가 모두 지워집니다. 되돌릴 수 없습니다.</p>
          <div class="actions"><button class="btn sec" data-act="del-trip-no">취소</button><button class="btn danger" data-act="del-trip">여행 삭제</button></div>`
        : `<button class="btn sec" data-act="del-trip-ask">이 여행 삭제</button>`}
      </section>` : ''}
    </div>
  </aside>`;
}

function openTrip(id) {
  if (tripId === id) return;
  stopListening();
  tripId = id; wantTrip = null;
  resetRaw(); didInitialScroll = false;
  Object.assign(ui, { view: 'board', detail: null, settings: false, catFilter: null });
  clearEdits();
  if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
  listen(); draw(); window.scrollTo(0, 0);
}
function closeTrip() {
  stopListening();
  tripId = null; resetRaw();
  Object.assign(ui, { detail: null, settings: false, confirmTrip: false });
  history.replaceState(null, '', location.pathname + location.search);
  draw();
}

function header(groups) {
  const first = days[0]?.id, last = days[days.length - 1]?.id;
  let span = '날짜를 추가하면 여행 기간이 표시됩니다', dday = '—', ddayLabel = '출발까지';
  if (first) {
    const n = diff(first, last);
    span = `${first.replace(/-/g, '.')} – ${md(last).replace('/', '.')} · ${n}박 ${n + 1}일`;
    const t = todayId(), until = diff(t, first);
    if (until > 0) dday = `D-${until}`;
    else if (diff(t, last) >= 0) { dday = `${1 - until}일차`; ddayLabel = '여행 중'; }
    else { dday = '완료'; ddayLabel = '여행'; }
  }
  const done = tasks.filter(t => t.done).length;
  const nights = groups.reduce((s, g) => s + g.ids.length, 0);
  const trip = curTrip();
  return `<header class="top">
    <div>
      <div class="crumbs"><button class="back" data-act="close-trip">‹ 여행 목록</button>${trip.tag ? `<span class="eyebrow">${esc(trip.tag)}</span>` : ''}</div>
      <h1>${esc(trip.title)}</h1>
      <div class="sub">${esc(span)}</div>
      <button class="acct" data-act="settings">여행 설정 · 함께하는 사람 ${(trip.members || []).length}명</button>
    </div>
    <div class="flaps">
      <div class="flap"><b>${dday}</b><span>${ddayLabel}</span></div>
      <div class="flap"><b>${done}/${tasks.length}</b><span>예매·확인</span></div>
      <div class="flap"><b>${nights}박</b><span>숙박 ${groups.length}곳</span></div>
    </div>
  </header>`;
}

function route(groups) {
  if (!groups.length) return '';
  return `<div class="route" aria-label="숙박 경로">
    <div class="route-bar">${groups.map(g => `<button class="seg" data-act="jump" data-day="${g.start}" style="--n:${g.ids.length};--c:var(--c-${cityKey(g.city)})" title="${esc(g.city)} ${g.ids.length}박">${esc(cityCode(g.city))}<i>${g.ids.length}박</i></button>`).join('')}</div>
    <div class="route-legend"><span>${md(groups[0].start)} 체크인</span><span>${md(addDays(groups[groups.length - 1].end, 1))} 체크아웃</span></div>
  </div>`;
}

/* --- board view --- */
function board(stayOf) {
  if (!gotDays) return `<p class="muted">일정을 불러오는 중입니다…</p>`;
  const first = days[0]?.id, t = todayId();
  const next = days.length ? addDays(days[days.length - 1].id, 1) : (curTrip().start || todayId());
  return `<div class="board">${days.map(d => column(d, stayOf[d.id], first, t)).join('')}
    <div class="col newcol edit-only"><form data-form="day-add">
      <span class="muted">${days.length ? '날짜 추가' : '아직 날짜가 없습니다. 첫 날짜를 추가해 보세요.'}</span>
      <input type="date" id="nd" name="date" value="${next}" aria-label="추가할 날짜" required>
      <button class="btn">추가</button>
    </form></div>
  </div>`;
}

function column(d, stay, first, today) {
  const items = d.items || [];
  const dayTasks = tasks.filter(x => tdate(x) === d.id);
  const dDone = dayTasks.filter(x => x.done).length;
  const w = wdi(d.id), dd = dt(d.id);
  return `<section class="col ${d.id === today ? 'is-today' : ''}" id="d-${d.id}" style="--c:var(--c-${cityKey(d.place)})" aria-label="${md(d.id)} ${esc(d.title)}">
    <div class="chead">
      <div class="cdate">
        <button class="cdbtn" data-act="detail" data-day="${d.id}" title="이 날의 체크리스트 보기">
          <span class="cday">${dd.getUTCDate()}</span>
          <span class="cinfo"><b class="${w === 0 || w === 6 ? 'we' : ''}">${dd.getUTCMonth() + 1}월 · ${WD[w]}요일</b><span>DAY ${diff(first, d.id) + 1} · 체크리스트 ›</span></span>
        </button>
        <span class="ccode">${d.place ? `<span class="code">${esc(cityCode(d.place))}</span>` : ''}<button class="more edit-only" data-act="menu" data-day="${d.id}" aria-expanded="${ui.menuDay === d.id}" aria-label="${md(d.id)} 날짜 메뉴">⋯</button></span>
      </div>
      <input class="inl ttl" id="ft-${d.id}" data-day="${d.id}" data-field="title" value="${esc(d.title)}" placeholder="이 날의 제목" aria-label="${md(d.id)} 제목">
      <div class="fields">
        <span>장소</span><input class="inl" id="fc-${d.id}" data-day="${d.id}" data-field="place" list="cities" value="${esc(d.place)}" placeholder="장소 입력" aria-label="${md(d.id)} 장소">
        <span>숙박</span><span class="val"><input class="inl" id="fl-${d.id}" data-day="${d.id}" data-field="lodging" list="cities" value="${esc(d.lodging)}" placeholder="숙박 없음" aria-label="${md(d.id)} 숙박 도시">${stay ? `<span class="stayn">${stay.n}/${stay.total}박</span>` : ''}</span>
      </div>
      <textarea class="inl note ${d.note ? 'has' : ''}" id="fn-${d.id}" data-day="${d.id}" data-field="note" rows="1" placeholder="+ 메모 추가" aria-label="${md(d.id)} 메모">${esc(d.note)}</textarea>
      ${ui.menuDay === d.id ? dayMenu(d) : ''}
    </div>
    <div class="cards" data-day="${d.id}">
      ${items.length ? items.map(it => card(d, it)).join('') : `<div class="empty-items">카드를 여기로 끌어 오세요</div>`}
    </div>
    <div class="cfoot">
      ${ui.addTo === d.id ? `<form class="form" data-form="item-add" data-day="${d.id}">
          <select name="cat" id="ak-${d.id}" aria-label="종류">${CATS.map(([k, l]) => `<option value="${k}" ${k === 'sight' ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input name="time" id="at-${d.id}" placeholder="시간 (예: 09:30, 오전)">
          <input name="text" id="ax-${d.id}" placeholder="할 일 또는 장소" required>
          <div class="actions"><button type="button" class="btn sec" data-act="cancel">닫기</button><button class="btn">추가</button></div>
        </form>` : `<button class="addline edit-only" data-act="add-open" data-day="${d.id}">+ 카드 추가</button>`}
      <button class="daycheck" data-act="detail" data-day="${d.id}">${dayTasks.length
        ? `체크리스트 ${dDone}/${dayTasks.length}<span class="mini"><i style="width:${Math.round(dDone / dayTasks.length * 100)}%"></i></span>›`
        : '☐ 체크리스트 만들기 ›'}</button>
    </div>
  </section>`;
}

function dayMenu(d) {
  const n = (d.items || []).length;
  return `<div class="menu">
    <label>다른 날과 일정 통째로 바꾸기<select id="ds-${d.id}"><option value="">날짜 선택</option>${days.filter(o => o.id !== d.id).map(o => `<option value="${o.id}">${esc(dayLabel(o))}</option>`).join('')}</select></label>
    <div class="row"><button class="btn" data-act="swap" data-day="${d.id}">바꾸기</button></div>
    <div class="row">
      ${ui.confirmDay === d.id
        ? `<span class="confirm">이 날짜${n ? `와 카드 ${n}개` : ''}를 삭제할까요?</span><button class="btn danger" data-act="del-day" data-day="${d.id}">삭제</button><button class="btn sec" data-act="del-day-no">아니요</button>`
        : `<button class="btn sec" data-act="del-day-ask" data-day="${d.id}">날짜 삭제</button><span class="spacer"></span><button class="btn sec" data-act="cancel">닫기</button>`}
    </div>
  </div>`;
}

function card(d, it) {
  if (ui.editItem && ui.editItem.day === d.id && ui.editItem.id === it.id) {
    const dv = ui.draft && ui.draft.key === it.id ? ui.draft : { time: it.time, text: it.text, to: d.id, cat: catKey(it.cat) };
    const ts = itemTasks(it.id), tn = ts.filter(t => t.done).length;
    return `<form class="form" data-form="item-save" data-day="${d.id}" data-id="${it.id}">
      <div class="catpick" role="radiogroup" aria-label="종류">${CATS.map(([k, l]) => `<label class="kopt" style="--k:var(--k-${k})"><input type="radio" name="cat" value="${k}" ${dv.cat === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <input name="time" id="et-${it.id}" value="${esc(dv.time)}" placeholder="시간">
      <input name="text" id="ex-${it.id}" value="${esc(dv.text)}" required>
      <label>날짜<select name="to" id="eto-${it.id}">${days.map(o => `<option value="${o.id}" ${o.id === dv.to ? 'selected' : ''}>${esc(dayLabel(o))}</option>`).join('')}</select></label>
      <div class="iclist">
        <div class="iclist-h"><span>체크리스트</span>${ts.length ? `<span>${tn}/${ts.length}</span>` : ''}</div>
        ${ts.length ? `<ul class="dlist">${ts.map(t => `<li class="${t.done ? 'done' : ''}">
          <input type="checkbox" id="ic-${t.id}" data-toggle="${t.id}" ${t.done ? 'checked' : ''}>
          <label for="ic-${t.id}">${esc(t.text)}</label>
          <button type="button" class="ib" data-act="del-task" data-id="${t.id}" aria-label="${esc(t.text)} 삭제">×</button></li>`).join('')}</ul>` : ''}
        <div class="icadd"><input id="ci-${it.id}" data-addtask="${it.id}" data-day="${d.id}" placeholder="예매·확인할 것 (Enter)" autocomplete="off" aria-label="체크리스트 추가"><button type="button" class="btn sec" data-act="ctask-add" data-id="${it.id}" data-day="${d.id}">추가</button></div>
      </div>
      <div class="actions"><button type="button" class="btn sec" data-act="item-del" data-day="${d.id}" data-id="${it.id}">삭제</button><span class="spacer"></span><button type="button" class="btn sec" data-act="cancel">취소</button><button class="btn">저장</button></div>
    </form>`;
  }
  return `<div class="card ${ui.catFilter && catKey(it.cat) !== ui.catFilter ? 'dim' : ''}" data-day="${d.id}" data-id="${it.id}" ${readOnly ? '' : `data-act="item-edit" role="button" tabindex="0"`}>
    <span class="cmeta">${catChip(it.cat)}${it.time ? `<span class="time">${esc(it.time)}</span>` : ''}</span>
    <span class="txt">${esc(it.text)}</span>
    <span class="grip edit-only" aria-hidden="true" title="끌어서 옮기기">⋮⋮</span>
    ${badge(it)}
  </div>`;
}
function badge(it) {
  const ts = itemTasks(it.id); if (!ts.length) return '';
  const n = ts.filter(t => t.done).length;
  return `<span class="cbadge ${n === ts.length ? 'ok' : ''}">☑ ${n}/${ts.length}</span>`;
}

/* --- day detail: each card with its own checklist --- */
function detail() {
  const d = getDay(ui.detail), items = d.items || [], dd = dt(d.id), w = wdi(d.id);
  const dayTasks = tasks.filter(t => tdate(t) === d.id);
  const loose = dayTasks.filter(t => !findItem(t.itemId)).sort((a, b) => (a.order || 0) - (b.order || 0));
  const done = dayTasks.filter(t => t.done).length, pct = dayTasks.length ? Math.round(done / dayTasks.length * 100) : 0;
  const row = t => `<li class="${t.done ? 'done' : ''}">
    <input type="checkbox" id="dc-${t.id}" data-toggle="${t.id}" ${t.done ? 'checked' : ''} ${readOnly ? 'disabled' : ''}>
    <label for="dc-${t.id}">${esc(t.text)}</label>
    <button class="ib edit-only" data-act="del-task" data-id="${t.id}" aria-label="${esc(t.text)} 삭제">×</button></li>`;
  const block = (key, time, title, list, cls = '', cat = '') => {
    const n = list.filter(t => t.done).length;
    return `<section class="dsec ${cls}">
      <div class="dsec-h">${cat ? catChip(cat) : ''}${time ? `<span class="time">${esc(time)}</span>` : ''}<b>${esc(title)}</b>${list.length ? `<span class="n">${n}/${list.length}</span>` : ''}</div>
      ${list.length ? `<ul class="dlist">${list.map(row).join('')}</ul>` : ''}
      <form class="dadd edit-only" data-form="dtask-add" data-day="${d.id}" data-item="${key}">
        <input name="text" id="dq-${key || 'day'}" placeholder="+ 체크할 것 추가 (Enter)" aria-label="${esc(title)} 체크리스트 추가" autocomplete="off">
      </form>
    </section>`;
  };
  return `<div class="scrim" data-act="close-detail"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="${md(d.id)} 체크리스트" style="--c:var(--c-${cityKey(d.place)})">
    <div class="dhd">
      <span class="cday">${dd.getUTCDate()}</span>
      <div><h2>${esc(d.title || '제목 없음')}</h2><p>${dd.getUTCMonth() + 1}월 ${dd.getUTCDate()}일 ${WD[w]}요일${d.place ? ' · ' + esc(d.place) : ''}</p></div>
      <button class="x" data-act="close-detail" aria-label="닫기">×</button>
    </div>
    <div class="dprog"><span>${done}/${dayTasks.length} 완료</span><div class="progress"><i style="width:${pct}%"></i></div></div>
    <div class="dbody">
      ${items.map(it => block(it.id, it.time, it.text, itemTasks(it.id), '', it.cat || 'etc')).join('') || '<p class="muted">이 날에는 일정 카드가 없습니다.</p>'}
      ${block('', '', '하루 전체 · 기타', loose, 'loose')}
    </div>
  </aside>`;
}

/* --- checklist view --- */
const dayOptions = sel => days.map(o => `<option value="${o.id}" ${o.id === sel ? 'selected' : ''}>${md(o.id)} (${WD[wdi(o.id)]})</option>`).join('');
function checkView() {
  if (!gotTasks) return `<p class="muted">불러오는 중입니다…</p>`;
  const done = tasks.filter(t => t.done).length, pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const key = t => tdate(t) || '9999';
  const sorted = [...tasks].sort((a, b) => (a.done - b.done) || key(a).localeCompare(key(b)) || ((a.order || 0) - (b.order || 0)));
  const shown = sorted.filter(t => ui.filter === 'all' || (ui.filter === 'open' ? !t.done : t.done));
  const f = (k, l) => `<button data-act="filter" data-f="${k}" aria-pressed="${ui.filter === k}">${l}</button>`;
  const rows = shown.map(t => {
    const td = tdate(t), d = td && getDay(td), fi = findItem(t.itemId);
    if (ui.editTask === t.id) return `<li class="task"><form class="form" data-form="task-save" data-id="${t.id}">
      <input name="text" id="tt-${t.id}" value="${esc(t.text)}" required>
      <label>연결할 일정<select name="target" id="ttd-${t.id}">${targetOptions(td, fi ? t.itemId : '')}</select></label>
      <div class="actions"><button type="button" class="btn sec" data-act="del-task" data-id="${t.id}">삭제</button><span class="spacer"></span><button type="button" class="btn sec" data-act="cancel">취소</button><button class="btn">저장</button></div>
    </form></li>`;
    return `<li class="task ${t.done ? 'done' : ''}">
      <input type="checkbox" id="c-${t.id}" data-toggle="${t.id}" ${t.done ? 'checked' : ''} ${readOnly ? 'disabled' : ''}>
      <label for="c-${t.id}">${esc(t.text)}<span class="tsub">${fi ? '↳ ' + esc(itemText(fi.item)) : td ? '↳ 하루 전체' : '연결된 일정 없음'}</span></label>
      ${td ? `<button class="dtag" style="--c:var(--c-${cityKey(d ? d.place : '')})" data-act="detail" data-day="${td}">${md(td)} ${WD[wdi(td)]}</button>` : '<span class="muted">—</span>'}
      <button class="ib edit-only" data-act="edit-task" data-id="${t.id}">수정</button>
    </li>`;
  }).join('');
  return `<div class="sheet">
    <div class="progress" aria-hidden="true" style="margin-top:12px"><i style="width:${pct}%"></i></div>
    <div class="filters">${f('all', `전체 ${tasks.length}`)}${f('open', `남은 것 ${tasks.length - done}`)}${f('done', `완료 ${done}`)}</div>
    ${rows ? `<ul class="tasks">${rows}</ul>` : `<p class="muted">${tasks.length ? (ui.filter === 'open' ? '남은 항목이 없습니다. 준비 끝!' : '완료한 항목이 아직 없습니다.') : '예매하거나 확인할 항목을 아래에서 추가해 보세요.'}</p>`}
    <form class="form edit-only" data-form="task-add" style="margin-top:10px;background:var(--col)">
      <input name="text" id="nt" placeholder="새 항목 (예: 까사 바트요 입장권)" required>
      <div class="actions"><select name="target" id="ntd" style="flex:1;width:auto" aria-label="연결할 일정">${targetOptions('', '')}</select><button class="btn">추가</button></div>
    </form>
  </div>`;
}

/* --- stays view --- */
function stayView(groups) {
  if (!gotDays) return `<p class="muted">불러오는 중입니다…</p>`;
  const total = groups.reduce((s, g) => s + g.ids.length, 0);
  return `<div class="sheet"><table class="stays">
    <thead><tr><th>체크인</th><th>체크아웃</th><th>도시</th><th class="num">박</th></tr></thead>
    <tbody>${groups.map(g => `<tr style="--c:var(--c-${cityKey(g.city)})">
      <td class="mono"><button class="ib" style="padding:0;font:inherit;color:var(--ink)" data-act="jump" data-day="${g.start}">${md(g.start)} ${WD[wdi(g.start)]}</button></td>
      <td class="mono">${md(addDays(g.end, 1))} ${WD[wdi(addDays(g.end, 1))]}</td>
      <td><span class="dot"></span>${esc(g.city)}</td>
      <td class="num">${g.ids.length}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">숙박 도시가 지정된 날짜가 없습니다.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="3">합계</td><td class="num">${total}박</td></tr></tfoot>
  </table>
  <p class="note-s">보드의 각 날짜에서 ‘숙박’ 칸을 바꾸면 자동으로 다시 계산됩니다.</p></div>`;
}

/* ---------- actions ---------- */
function clearEdits() { ui.menuDay = ui.confirmDay = ui.editItem = ui.addTo = ui.editTask = ui.draft = null; }
function addCardTask(itemId, dayId) {
  const inp = document.getElementById('ci-' + itemId), text = inp && inp.value.trim();
  if (!text) return;
  saveTask({ id: uid(), text, date: dayId, itemId, done: false, order: Date.now() });
  ui.focus = '#ci-' + itemId;
}
function moveItem(fromId, itemId, toId, index) {
  const from = clone(getDay(fromId)), i = from.items.findIndex(x => x.id === itemId);
  if (i < 0) return;
  const [it] = from.items.splice(i, 1);
  if (fromId === toId) {
    from.items.splice(Math.min(index, from.items.length), 0, it);
    if (i !== index) saveDay(from);
    return;
  }
  const to = clone(getDay(toId)); to.items = to.items || [];
  to.items.splice(Math.min(index, to.items.length), 0, it);
  saveDay(from); saveDay(to);
  toast(`${md(toId)} (${WD[wdi(toId)]})로 옮겼습니다.`);
}
function toggleTask(id, done) { const t = tasks.find(x => x.id === id); if (t) saveTask({ ...clone(t), done }); }
function jump(dayId) {
  ui.view = 'board'; draw();
  const b = $app.querySelector('.board'), c = document.getElementById('d-' + dayId);
  if (!b || !c) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  b.scrollTo({ left: c.offsetLeft - b.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
  b.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' });
}

const acts = {
  view: b => { ui.view = b.dataset.v; clearEdits(); },
  filter: b => { ui.filter = b.dataset.f; },
  cancel: () => clearEdits(),
  menu: b => { const id = b.dataset.day, open = ui.menuDay === id; clearEdits(); if (!open) ui.menuDay = id; },
  swap: b => {
    const sel = document.getElementById('ds-' + b.dataset.day), sw = sel && sel.value;
    if (!sw) { toast('바꿀 날짜를 먼저 골라 주세요.'); return; }
    // swapping the two day rows' dates carries their cards and checklists along (they point at the day id)
    const ua = dayUuid(b.dataset.day), ub = dayUuid(sw), ra = raw.days.get(ua), rb = raw.days.get(ub);
    put('days', ua, { ...ra, date: rb.date }); put('days', ub, { ...rb, date: ra.date });
    rebuild(); clearEdits(); toast(`${md(ra.date)}와 ${md(rb.date)} 일정을 바꿨습니다.`);
  },
  'del-day-ask': b => { ui.confirmDay = b.dataset.day; },
  'del-day-no': () => { ui.confirmDay = null; },
  detail: b => { clearEdits(); ui.detail = b.dataset.day; },
  'close-detail': () => { ui.detail = null; },
  'del-day': b => { const d = b.dataset.day; tasks.filter(t => tdate(t) === d).forEach(t => saveTask({ ...clone(t), date: '', itemId: '' })); removeDay(d); clearEdits(); toast(`${md(d)} 일정을 삭제했습니다.`); },
  'add-open': b => { clearEdits(); ui.addTo = b.dataset.day; ui.focus = '#at-' + b.dataset.day; },
  'item-edit': b => { clearEdits(); ui.editItem = { day: b.dataset.day, id: b.dataset.id }; ui.focus = '#ex-' + b.dataset.id; },
  'item-del': b => {
    const id = b.dataset.id, d = clone(getDay(b.dataset.day));
    itemTasks(id).forEach(t => saveTask({ ...clone(t), date: d.id, itemId: '' })); // keep its checklist under the day
    removeItem(id); d.items = d.items.filter(x => x.id !== id); saveDay(d); clearEdits();
  },
  'edit-task': b => { clearEdits(); ui.editTask = b.dataset.id; ui.focus = '#tt-' + b.dataset.id; },
  'del-task': b => { removeTask(b.dataset.id); if (ui.editTask === b.dataset.id) ui.editTask = null; },
  'ctask-add': b => addCardTask(b.dataset.id, b.dataset.day),
  'open-trip': b => openTrip(b.dataset.id),
  'close-trip': () => closeTrip(),
  'new-trip': () => { ui.newTrip = true; ui.focus = '#nt-title'; },
  'new-trip-close': () => { ui.newTrip = false; },
  settings: () => { clearEdits(); ui.settings = true; ui.confirmTrip = false; },
  'close-settings': () => { ui.settings = false; ui.confirmTrip = false; },
  'del-trip-ask': () => { ui.confirmTrip = true; },
  'del-trip-no': () => { ui.confirmTrip = false; },
  'del-trip': () => deleteTrip(),
  'member-del': b => { const t = curTrip(); saveTrip({ members: (t.members || []).filter(m => m !== b.dataset.email) }); },
  signin: () => {
    const p = new GoogleAuthProvider();
    signInWithPopup(auth, p).catch(e => {
      // home-screen apps and some mobile browsers block popups; fall back to a full-page redirect
      if (e && /popup|cancelled|operation-not-supported/.test(e.code || '')) signInWithRedirect(auth, p);
      else toast('로그인하지 못했습니다. 다시 시도해 주세요.');
    });
  },
  signout: () => { signOut(auth); },
  catf: b => { ui.catFilter = ui.catFilter === b.dataset.k ? null : b.dataset.k; },
  chip: b => { if (readOnly) return; const t = tasks.find(x => x.id === b.dataset.id); if (t) toggleTask(t.id, !t.done); },
};
$app.addEventListener('click', e => {
  if (justDragged) { e.preventDefault(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'jump') { e.preventDefault(); jump(b.dataset.day); return; }
  if (a === 'scroll') { const bd = $app.querySelector('.board'); bd && bd.scrollBy({ left: Number(b.dataset.dir) * 280, behavior: 'smooth' }); return; }
  const fn = acts[a]; if (!fn) return;
  e.preventDefault(); fn(b); draw();
});
$app.addEventListener('keydown', e => {
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t.matches('.card[data-act]')) { e.preventDefault(); t.click(); return; }
  if (e.key === 'Enter' && t.dataset && t.dataset.addtask) { e.preventDefault(); addCardTask(t.dataset.addtask, t.dataset.day); draw(); return; }
  if (t.dataset && t.dataset.field) {
    if (e.key === 'Enter' && (t.tagName === 'INPUT' || !e.shiftKey)) { e.preventDefault(); t.blur(); }
    else if (e.key === 'Escape') { const d = getDay(t.dataset.day); t.value = (d && d[t.dataset.field]) || ''; t.blur(); }
  }
});
// In-place header fields (title / place / lodging / note) save when they lose focus.
$app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.toggle) { toggleTask(t.dataset.toggle, t.checked); draw(); return; }
  if (t.dataset.field) {
    const cur = getDay(t.dataset.day); if (!cur) return;
    const v = t.value.trim();
    if ((cur[t.dataset.field] || '') === v) return;
    saveDay({ ...clone(cur), [t.dataset.field]: v });
    pending = true; render();
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (drag && drag.active) { endDrag(false); return; }
  if (ui.detail) { ui.detail = null; draw(); return; }
  if (ui.settings) { ui.settings = false; draw(); return; }
  if (ui.menuDay || ui.editItem || ui.addTo || ui.editTask) { clearEdits(); draw(); }
});

const forms = {
  'item-add': f => {
    const d = clone(getDay(f.dataset.day)); d.items = d.items || [];
    const text = f.text.value.trim(); if (!text) return;
    d.items.push({ id: uid(), cat: f.cat.value, time: f.time.value.trim(), text });
    saveDay(d); ui.focus = '#at-' + d.id; // keep the form open for the next card
  },
  'item-save': f => {
    const from = getDay(f.dataset.day); const i = from.items.findIndex(x => x.id === f.dataset.id); if (i < 0) return;
    const d = clone(from);
    const cat = (f.querySelector('input[name=cat]:checked') || {}).value || 'etc';
    d.items[i] = { ...d.items[i], cat, time: f.time.value.trim(), text: f.text.value.trim() || d.items[i].text };
    saveDay(d);
    const to = f.to.value;
    if (to !== d.id) moveItem(d.id, f.dataset.id, to, (getDay(to).items || []).length);
    clearEdits();
  },
  'day-add': f => {
    const id = f.date.value; if (!id) return;
    if (getDay(id)) { toast(`${md(id)}은 이미 있습니다.`); return; }
    saveDay({ id, title: '', place: '', lodging: '', note: '', items: [] });
    clearEdits(); ui.focus = '#ft-' + id;
  },
  'task-add': f => {
    const text = f.text.value.trim(); if (!text) return;
    const [date, itemId] = f.target.value.split('|');
    saveTask({ id: uid(), text, date, itemId, done: false, order: Date.now() });
    ui.focus = '#nt';
  },
  'task-save': f => {
    const t = tasks.find(x => x.id === f.dataset.id); if (!t) return;
    const [date, itemId] = f.target.value.split('|');
    saveTask({ ...clone(t), text: f.text.value.trim() || t.text, date, itemId });
    clearEdits();
  },
  'trip-new': f => {
    const title = f.title.value.trim(), start = f.start.value, end = f.end.value;
    if (!title || !start || !end) return;
    if (end < start) { toast('귀국일이 출발일보다 빠릅니다.'); return; }
    if (diff(start, end) > 60) { toast('여행 기간은 60일까지 만들 수 있습니다.'); return; }
    ui.newTrip = false;
    openTrip(createTrip({ title, tag: f.tag.value.trim(), start, end }));
  },
  'trip-save': f => {
    const title = f.title.value.trim(); if (!title) return;
    saveTrip({ title, tag: f.tag.value.trim() });
    ui.settings = false; toast('여행 정보를 저장했습니다.');
  },
  'member-add': f => {
    const email = f.email.value.trim().toLowerCase(), t = curTrip();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('이메일 주소를 확인해 주세요.'); return; }
    if ((t.members || []).includes(email)) { toast('이미 함께하는 사람입니다.'); return; }
    saveTrip({ members: [...(t.members || []), email] });
    ui.focus = '#ts-mem'; toast(`${email} 님을 초대했습니다.`);
  },
  'dtask-add': f => {
    const text = f.text.value.trim(); if (!text) return;
    saveTask({ id: uid(), text, date: f.dataset.day, itemId: f.dataset.item, done: false, order: Date.now() });
    ui.focus = '#dq-' + (f.dataset.item || 'day'); // stay in the field to add the next one
  },
};
$app.addEventListener('submit', e => { e.preventDefault(); const fn = forms[e.target.dataset.form]; if (fn) { fn(e.target); draw(); } });

/* ---------- drag cards between day columns ---------- */
// Mouse drags from anywhere on a card. Touch: the ⋮⋮ grip drags at once; elsewhere on the card a
// long press (~0.4 s) picks it up, so a normal swipe still pages between days.
const LONG_PRESS = 400;
$app.addEventListener('pointerdown', e => {
  if (readOnly || e.button !== 0) return;
  const c = e.target.closest('.card'); if (!c || c.classList.contains('drag-ghost')) return;
  drag = { card: c, day: c.dataset.day, id: c.dataset.id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, touch: e.pointerType !== 'mouse' };
  if (drag.touch && !e.target.closest('.grip')) {
    drag.pending = true;
    c.classList.add('pressing');
    drag.timer = setTimeout(() => {
      if (!drag || !drag.pending) return;
      drag.pending = false; c.classList.remove('pressing');
      startDrag(); if (navigator.vibrate) navigator.vibrate(12);
    }, LONG_PRESS);
  }
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.pending) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) cancelPress(); return; }
  if (!drag.active) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; startDrag(); }
  e.preventDefault();
  placeGhost(); locate();
}, { passive: false });
// once a card is lifted, stop the page and board from scrolling under the finger
document.addEventListener('touchmove', e => { if (drag && drag.active) e.preventDefault(); }, { passive: false });
$app.addEventListener('contextmenu', e => { if (e.target.closest('.card')) e.preventDefault(); });
function cancelPress() { if (!drag) return; clearTimeout(drag.timer); drag.card.classList.remove('pressing'); drag = null; }
window.addEventListener('pointerup', () => { if (!drag) return; if (drag.active) endDrag(true); else cancelPress(); drag = null; });
window.addEventListener('pointercancel', () => { if (!drag) return; if (drag.active) endDrag(false); else cancelPress(); drag = null; });

function startDrag() {
  const c = drag.card, r = c.getBoundingClientRect();
  drag.active = true; drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
  const g = c.cloneNode(true); g.classList.add('drag-ghost'); g.removeAttribute('data-act'); g.style.width = r.width + 'px';
  c.closest('.col').appendChild(g); // keeps the column's city colour on the ghost
  drag.ghost = g;
  const ph = document.createElement('div'); ph.className = 'placeholder'; ph.style.height = r.height + 'px';
  c.before(ph); c.hidden = true; drag.ph = ph;
  document.body.classList.add('is-dragging');
  placeGhost();
  requestAnimationFrame(autoScroll);
}
function placeGhost() { drag.ghost.style.left = (drag.x - drag.dx) + 'px'; drag.ghost.style.top = (drag.y - drag.dy) + 'px'; }
function locate() {
  const el = document.elementFromPoint(drag.x, drag.y);
  const col = el && el.closest('.col:not(.newcol)'); if (!col) return;
  const list = col.querySelector('.cards');
  const before = [...list.querySelectorAll('.card:not([hidden]):not(.drag-ghost)')].find(c => { const r = c.getBoundingClientRect(); return drag.y < r.top + r.height / 2; });
  if (before) { if (before.previousElementSibling !== drag.ph) list.insertBefore(drag.ph, before); }
  else if (list.lastElementChild !== drag.ph) list.appendChild(drag.ph);
}
function autoScroll() {
  if (!drag || !drag.active) return;
  const b = $app.querySelector('.board'), r = b.getBoundingClientRect(), edge = paged() ? 36 : 70;
  let moved = false;
  const dir = drag.x < r.left + edge ? -1 : drag.x > r.right - edge ? 1 : 0;
  if (paged()) {
    // one day per screen: holding the card at an edge flips to the neighbouring day
    if (!dir) drag.edgeT = 0;
    else if (!drag.edgeT) drag.edgeT = performance.now();
    else if (performance.now() - drag.edgeT > 450) {
      const c = b.querySelector('.col');
      b.scrollBy({ left: dir * (c.offsetWidth + 12), behavior: 'smooth' });
      drag.edgeT = performance.now() + 350;
      setTimeout(() => { if (drag && drag.active) locate(); }, 380);
    }
  } else if (dir < 0) { b.scrollLeft -= Math.ceil((r.left + edge - drag.x) / 5); moved = true; }
  else if (dir > 0) { b.scrollLeft += Math.ceil((drag.x - r.right + edge) / 5); moved = true; }
  if (drag.y < 60) { window.scrollBy(0, -10); moved = true; }
  else if (drag.y > innerHeight - 60) { window.scrollBy(0, 10); moved = true; }
  if (moved) locate();
  requestAnimationFrame(autoScroll);
}
function endDrag(commit) {
  const { card: c, ghost, ph, day, id } = drag;
  const list = ph.parentElement;
  const toDay = list && list.dataset.day;
  const index = list ? [...list.children].filter(x => x.matches('.card:not([hidden]):not(.drag-ghost)') && (x.compareDocumentPosition(ph) & Node.DOCUMENT_POSITION_FOLLOWING)).length : 0;
  ghost.remove(); ph.remove(); c.hidden = false;
  document.body.classList.remove('is-dragging');
  drag.active = false; drag = null;
  justDragged = true; setTimeout(() => { justDragged = false; }, 0);
  if (commit && toDay) moveItem(day, id, toDay, index);
  pending = false; draw();
}

const paged = () => matchMedia('(max-width: 640px)').matches;

/* ---------- boot ---------- */
function stopListening() { unsubs.forEach(u => u()); unsubs = []; }
function listen() {
  stopListening();
  const fail = e => {
    if (e && e.code === 'permission-denied') { closeTrip(); toast('이 여행에 접근할 권한이 없습니다.'); return; }
    stopListening(); toast('일정을 불러오지 못했습니다. 페이지를 새로고침해 주세요.'); render();
  };
  for (const c of ['days', 'items', 'checklist']) {
    unsubs.push(onSnapshot(col(c), snap => {
      raw[c] = new Map(snap.docs.map(d => [d.id, d.data()]));
      got[c] = true; rebuild(); render();
    }, fail));
  }
}
if (!configured) { status = 'setup'; draw(); }
else {
  draw();
  getRedirectResult(auth).catch(() => toast('로그인하지 못했습니다. 다시 시도해 주세요.'));
  onAuthStateChanged(auth, u => {
    me = u; readOnly = false;
    stopListening(); if (tripUnsub) { tripUnsub(); tripUnsub = null; }
    tripId = null; trips = []; gotTrips = false;
    resetRaw(); didInitialScroll = false;
    if (!u) { status = 'signin'; draw(); return; }
    status = 'loading'; draw(); listenTrips();
  });
}
// Trips this account was invited to (the rules only allow this exact query).
function listenTrips() {
  tripUnsub = onSnapshot(query(collection(fs, 'trips'), where('members', 'array-contains', myEmail())), s => {
    trips = s.docs.map(d => ({ id: d.id, ...d.data() }));
    gotTrips = true; status = 'ready';
    if (tripId && !curTrip() && !s.metadata.hasPendingWrites) { closeTrip(); toast('이 여행에 더 이상 접근할 수 없습니다.'); return; }
    if (!tripId && wantTrip && trips.some(t => t.id === wantTrip)) { openTrip(wantTrip); return; }
    render();
  }, e => {
    if (e && e.code === 'permission-denied') { status = 'denied'; draw(); return; }
    toast('여행 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
  });
}
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (status !== 'ready') { wantTrip = h || null; return; }
  if (!h) { if (tripId) closeTrip(); }
  else if (h !== tripId && trips.some(t => t.id === h)) openTrip(h);
});
// Reopening the app on a later day jumps the board to that day.
let lastDay = todayId();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || todayId() === lastDay) return;
  lastDay = todayId(); draw(); scrollToToday(true);
});
if ('serviceWorker' in navigator) {
  // when a newly deployed version takes over, reload once so the screen matches it
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('./sw.js').then(r => r.update()).catch(() => {});
}
