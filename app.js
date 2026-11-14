import * as C from './core.js';
const { CATS, MONTHS, DOW, pad, parse, addDays, diffDays, weekStartOf, daysInMonth, todayStr, eventsOn, holidayOn } = C;

/* ---------- tiny helpers ---------- */
const P = {
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  todo: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.5 2.5 4.7-5"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-3.6-2.6-5.8-6.5-5.8 0 3.6 2.6 5.8 6.5 5.8z"/><path d="M12 14.5c0-3 2.3-5 6-5 0 3-2.3 5-6 5z"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.5c0 5.6-7.5 10.2-7.5 10.2z"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5.5 12.5l4.2 4.2L18.5 8"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 018 0v3"/>',
};
const ic = (n, s = 24, sw = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s) => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mon3 = (m0) => MONTHS[m0].slice(0, 3);
const shortDate = (ds) => { const d = parse(ds); return mon3(d.getMonth()) + ' ' + d.getDate(); };
const longDate = (ds) => { const d = parse(ds); return DOW[d.getDay()].slice(0, 3) + ', ' + shortDate(ds); };
const fmtTime = (t) => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + (m ? ':' + pad(m) : '') + ' ' + ap; };
const catOf = (id) => CATS.find((c) => c.id === id) || CATS[0];
const monthName = (m0) => (innerWidth < 350 ? MONTHS[m0].slice(0, 3) : MONTHS[m0]);
const monthOf = (ds) => ({ y: +ds.slice(0, 4), m: +ds.slice(5, 7) - 1 });

/* ---------- storage: IndexedDB, on this device only ---------- */
let db = null, memOnly = false;
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('planner', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); }; r.onerror = () => rej(r.error); });
const kvGet = (k) => new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const kvSet = (k, v) => new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
let S = C.defaults(), saveTimer = null, hiddenAt = 0, unlocked = false;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); }
async function flush() { if (memOnly) return; try { await kvSet('state', JSON.parse(JSON.stringify(S))); } catch (e) { toast("Couldn't save on this device. Export a backup now."); } }
addEventListener('pagehide', () => { clearTimeout(saveTimer); flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); clearTimeout(saveTimer); flush(); } else maybeLock(); });
async function requestPersist() { try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {} }
const hasData = () => S.events.length + S.tasks.length + Object.keys(S.habitLog).length + Object.keys(S.weight).length + Object.keys(S.cycle).length > 0;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }

/* ---------- theme (light / dark / follow phone) ---------- */
const themePref = () => { try { return localStorage.getItem('planner-theme') || 'auto'; } catch (e) { return 'auto'; } };
function applyTheme() {
  const p = themePref(), root = document.documentElement;
  if (p === 'light' || p === 'dark') root.dataset.theme = p; else delete root.dataset.theme;
  const dark = p === 'dark' || (p === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#17161D' : '#FBF5EC';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---------- ui state ---------- */
const T0 = todayStr();
const U = { tab: 'cal', settings: false, sel: T0, mY: +T0.slice(0, 4), mM: +T0.slice(5, 7) - 1, newDue: 'none', showDone: false, hw: weekStartOf(T0), editHabits: false, hTab: 'weight', cs: 0, pY: +T0.slice(0, 4), pM: +T0.slice(5, 7) - 1 };
const TABS = [['cal', 'Calendar', 'cal'], ['todo', 'To-do', 'todo'], ['habits', 'Habits', 'sprout'], ['health', 'Health', 'heart']];

/* ---------- calendar ---------- */
const isBar = (e) => e.endDate && e.endDate > e.date && (!e.repeat || !e.repeat.type || e.repeat.type === 'none');
// Every event is a bar: multi-day ones span days, one-day ones fill their cell.
function weekSegs(ws, maxLanes) {
  const we = addDays(ws, 6), segs = [];
  S.events.filter((e) => isBar(e) && e.date <= we && e.endDate >= ws).forEach((e) => {
    const s = e.date < ws ? ws : e.date, en = e.endDate > we ? we : e.endDate;
    segs.push({ e, c0: diffDays(ws, s), c1: diffDays(ws, en), startsHere: e.date >= ws, endsHere: e.endDate <= we });
  });
  for (let i = 0; i < 7; i++) eventsOn(S.events, addDays(ws, i)).filter((e) => !isBar(e)).forEach((e) => segs.push({ e, c0: i, c1: i, startsHere: true, endsHere: true }));
  segs.sort((a, b) => a.c0 - b.c0 || b.c1 - a.c1 || (a.e.startTime || '').localeCompare(b.e.startTime || '') || a.e.name.localeCompare(b.e.name));
  const lanes = [], hidden = [0, 0, 0, 0, 0, 0, 0];
  segs.forEach((g) => { let l = lanes.findIndex((end) => end < g.c0); if (l < 0) { l = lanes.length; lanes.push(-1); } lanes[l] = g.c1; g.lane = l; });
  segs.forEach((g) => { if (g.lane >= maxLanes) for (let c = g.c0; c <= g.c1; c++) hidden[c]++; });
  return { shown: segs.filter((g) => g.lane < maxLanes), hidden };
}
function monthPage(y, m, pageH) {
  const first = y + '-' + pad(m + 1) + '-01', last = y + '-' + pad(m + 1) + '-' + pad(daysInMonth(y, m)), today = todayStr();
  const weeks = []; for (let ws = weekStartOf(first); ws <= last; ws = addDays(ws, 7)) weeks.push(ws);
  const rowH = Math.max(60, Math.floor(pageH / weeks.length)), maxLanes = Math.max(1, Math.floor((rowH - 31 - 12) / 16));
  const rows = weeks.map((ws) => {
    const { shown, hidden } = weekSegs(ws, maxLanes);
    const cells = [...Array(7)].map((_, i) => {
      const ds = addDays(ws, i), d = parse(ds);
      const hol = holidayOn(ds), cls = ['day', d.getMonth() !== m ? 'out' : '', ds === today ? 'today' : '', ds === U.sel ? 'sel' : '', hol ? 'hol' : ''].join(' ');
      return `<button class="${cls}" data-a="pick" data-ds="${ds}" aria-label="${longDate(ds)}${hol ? ', ' + esc(hol) : ''}"><span class="n">${d.getDate()}</span></button>`;
    }).join('');
    const bars = shown.map((g) => {
      const left = (g.c0 / 7) * 100, w = ((g.c1 - g.c0 + 1) / 7) * 100, inL = g.startsHere ? 2 : 0, inR = g.endsHere ? 2 : 0;
      return `<div class="bar ${g.startsHere ? 's' : ''} ${g.endsHere ? 'e' : ''}" style="--dot:${catOf(g.e.cat).dot};left:calc(${left}% + ${inL}px);width:calc(${w}% - ${inL + inR}px);top:${g.lane * 16}px">${esc(g.e.name)}</div>`;
    }).join('');
    const more = hidden.map((n, i) => (n ? `<span class="more" style="left:${(i / 7) * 100}%;width:${100 / 7}%">+${n}</span>` : '')).join('');
    return `<div class="wk"><div class="days">${cells}</div><div class="bars">${bars}</div>${more}</div>`;
  }).join('');
  return `<div class="page" style="--n:${weeks.length}">${rows}</div>`;
}
const calSizes = () => { const calH = Math.min(Math.round(innerHeight * 0.65), Math.max(260, ($('#view').clientHeight || innerHeight * 0.8) - 150)); return { calH, pageH: calH - 24 }; };
function evSub(e, ds) {
  const parts = [];
  if (isBar(e)) parts.push(shortDate(e.date) + ' – ' + shortDate(e.endDate) + ' · day ' + (diffDays(e.date, ds) + 1) + ' of ' + (diffDays(e.date, e.endDate) + 1));
  else parts.push(e.startTime ? fmtTime(e.startTime) + (e.endTime ? ' – ' + fmtTime(e.endTime) : '') : 'All day');
  if (isBar(e) && e.startTime) parts.push(fmtTime(e.startTime));
  if (e.repeat && e.repeat.type !== 'none') parts.push('repeats ' + ({ daily: 'daily', weekly: 'weekly', monthly: 'monthly', yearly: 'yearly' }[e.repeat.type] || ''));
  return parts.join(' · ');
}
function taskRow(t, showDue = true) {
  const today = todayStr(), late = t.due && t.due < today && !t.done;
  const sub = t.due && showDue ? `<small class="${late ? 'late' : ''}">${late ? 'Overdue · ' : ''}${longDate(t.due)}</small>` : '';
  return `<div class="tk ${t.done ? 'done' : ''}"><button class="cbw" data-a="toggleTask" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.text)}"><span class="cb ${t.done ? 'on' : ''}">${t.done ? ic('check', 16, 3) : ''}</span></button><button class="tx" data-a="editTask" data-id="${t.id}"><b>${esc(t.text)}</b>${sub}</button></div>`;
}
function vCal() {
  const ds = U.sel, d = parse(ds), hol = holidayOn(ds), evs = eventsOn(S.events, ds), { calH, pageH } = calSizes();
  const tks = S.tasks.filter((t) => !t.done && t.due === ds);
  const needBackup = S.settings.backupReminder && hasData() && !(S.settings.snooze && Date.now() - S.settings.snooze < 7 * 864e5) && (S.settings.lastBackup ? Date.now() - S.settings.lastBackup > 30 * 864e5 : Date.now() - S.settings.created > 7 * 864e5);
  const banner = needBackup ? `<div class="banner"><span>Time to back up. Your data lives only on this phone.</span><button class="pill solid" data-a="export">Back up</button><button class="ib sm" data-a="snooze" aria-label="Dismiss">${ic('x', 18, 2.2)}</button></div>` : '';
  const list = evs.map((e) => `<button class="ev" data-a="editEvent" data-id="${esc(e.id)}"><i style="--dot:${catOf(e.cat).dot}"></i><div><b>${esc(e.name)}</b><span>${evSub(e, ds)}</span></div></button>`).join('')
    + (tks.length ? `<div class="h">To-do</div><div class="card">${tks.map((t) => taskRow(t, false)).join('')}</div>` : '');
  const pages = [-1, 0, 1].map((o) => { const t = new Date(U.mY, U.mM + o, 1); return monthPage(t.getFullYear(), t.getMonth(), pageH); }).join('');
  return `<div class="calwrap"><div class="dow">${'SMTWTFS'.split('').map((x) => `<div>${x}</div>`).join('')}</div><div class="pager" id="pager">${pages}</div></div>
<section class="agenda"><button class="grab" data-a="toggleCal" aria-label="Shrink or expand the calendar"><i></i></button>${banner}<div class="ag-h"><div><h2>${DOW[d.getDay()].slice(0, 3)}, ${mon3(d.getMonth())} ${d.getDate()}</h2>${hol ? `<small>${esc(hol)}</small>` : ''}</div><div class="ag-r"><button class="addb" data-a="newEvent" aria-label="New event">${ic('plus', 22, 2.4)}</button></div></div>
${list || '<div class="empty">Nothing planned.</div>'}<div class="sticker"><img id="stk" src="stickers/Sticker-${MONTHS[d.getMonth()]}.png" width="104" height="104" alt="" decoding="sync"></div></section>`;
}

/* ---------- to-do ---------- */
function vTodo() {
  const today = todayStr(), open = S.tasks.filter((t) => !t.done), done = S.tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const by = (a, b) => (a.due || '').localeCompare(b.due || '') || a.text.localeCompare(b.text);
  const groups = [['Overdue', open.filter((t) => t.due && t.due < today).sort(by)], ['Today', open.filter((t) => t.due === today)], ['Upcoming', open.filter((t) => t.due && t.due > today).sort(by)], ['Anytime', open.filter((t) => !t.due)]];
  const chip = (k, l) => `<button type="button" class="chip ${U.newDue === k ? 'on' : ''}" data-a="newDue" data-k="${k}">${l}</button>`;
  const body = groups.filter((g) => g[1].length).map(([n, ts]) => `<div class="h"><span>${n}</span><span>${ts.length}</span></div><div class="card">${ts.map((t) => taskRow(t, n === 'Upcoming' || n === 'Overdue')).join('')}</div>`).join('');
  const doneBlock = done.length ? `<div class="h"><button class="link" style="padding:0;text-transform:none;letter-spacing:0" data-a="toggleDone">${U.showDone ? 'Hide' : 'Show'} completed (${done.length})</button>${U.showDone ? '<button class="link" style="padding:0;text-transform:none;letter-spacing:0" data-a="clearDone">Clear</button>' : ''}</div>${U.showDone ? `<div class="card">${done.slice(0, 40).map((t) => taskRow(t, false)).join('')}</div>` : ''}` : '';
  return `<form class="quick" data-form="quick"><input id="qa" name="text" maxlength="120" placeholder="Add a to-do" autocomplete="off" enterkeyhint="done" aria-label="New to-do"><button aria-label="Add">${ic('plus', 22, 2.4)}</button></form>
<div class="chips">${chip('none', 'Anytime')}${chip('today', 'Today')}${chip('tomorrow', 'Tomorrow')}</div>
${body || '<div class="empty" style="padding-top:36px">All clear. Add something above.</div>'}${doneBlock}`;
}

/* ---------- habits ---------- */
function vHabits() {
  const today = todayStr(), ws = U.hw, we = addDays(ws, 6), edit = U.editHabits, a = parse(ws), b = parse(we);
  const title = shortDate(ws) + ' – ' + (a.getMonth() === b.getMonth() ? '' : mon3(b.getMonth()) + ' ') + b.getDate();
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const nav = `<div class="wnav"><button class="ib" data-a="hprev" aria-label="Previous week">${ic('left', 20, 2.2)}</button><b>${title}</b><button class="ib" data-a="hnext" aria-label="Next week">${ic('right', 20, 2.2)}</button></div>`;
  if (!S.habits.length && !edit) return `${nav}<div class="empty" style="padding-top:36px">No habits yet.</div><div style="text-align:center"><button class="pill solid" data-a="addHabit">${ic('plus', 16, 2.6)}Add a habit</button></div>`;
  let card;
  if (edit) {
    card = `<div class="card">${S.habits.map((h) => `<div class="erow"><input data-habit="${h.id}" maxlength="24" value="${esc(h.label)}" aria-label="Habit name"><button class="ib" data-a="rmHabit" data-id="${h.id}" aria-label="Remove ${esc(h.label)}" style="color:var(--danger)">${ic('x', 20, 2.2)}</button></div>`).join('')}<button class="add-row" data-a="addHabit">${ic('plus', 18, 2.4)}Add habit</button></div><div style="text-align:center;margin-top:14px"><button class="pill solid" data-a="toggleEditHabits">Done</button></div>`;
  } else {
    const head = `<div class="hdays">${days.map((x, i) => `<span class="${x === today ? 'tdy' : ''}">${'SMTWTFS'[i]}</span>`).join('')}</div>`;
    const rows = S.habits.map((h) => {
      const st = C.habitStreak(S.habitLog, h.id, today);
      return `<div class="hab"><div class="nm"><b>${esc(h.label)}</b><small>${st ? st + (st === 1 ? ' day' : ' days') + ' in a row' : ''}</small></div><div class="hrow">${days.map((x, i) => { const on = (S.habitLog[x] || []).includes(h.id); return `<button class="hd ${on ? 'on' : ''} ${x === today ? 'today' : ''}" data-a="toggleHabit" data-id="${h.id}" data-ds="${x}" ${x > today ? 'disabled' : ''} aria-label="${esc(h.label)}, ${DOW[i]}, ${on ? 'done' : 'not done'}"><span>${on ? ic('check', 16, 3.2) : ''}</span></button>`; }).join('')}</div></div>`;
    }).join('');
    card = `<div class="card">${head}${rows}</div><div style="text-align:center;margin-top:14px"><button class="link" data-a="toggleEditHabits">Edit habits</button></div>`;
  }
  return nav + card;
}

/* ---------- health ---------- */
function weightChart(keys) {
  const pts = keys.slice(-30); if (pts.length < 2) return '<div class="sub" style="padding:12px 0 2px">Log two weigh-ins to see a line.</div>';
  const W = 300, H = 120, L = 34, R = 8, Tp = 10, B = 16, vals = pts.map((k) => S.weight[k]), mn = Math.min(...vals), mx = Math.max(...vals), pad_ = (mx - mn || 1) * 0.15;
  const lo = mn - pad_, hi = mx + pad_, span = diffDays(pts[0], pts[pts.length - 1]) || 1;
  const X = (k) => L + (diffDays(pts[0], k) / span) * (W - L - R), Y = (v) => Tp + (1 - (v - lo) / (hi - lo)) * (H - Tp - B);
  const line = pts.map((k) => X(k).toFixed(1) + ',' + Y(S.weight[k]).toFixed(1)).join(' ');
  const lastK = pts[pts.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time"><line x1="${L}" x2="${W - R}" y1="${Y(mx)}" y2="${Y(mx)}" stroke="var(--line)"/><line x1="${L}" x2="${W - R}" y1="${Y(mn)}" y2="${Y(mn)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(mx) + 3}" text-anchor="end">${mx}</text><text x="${L - 6}" y="${Y(mn) + 3}" text-anchor="end">${mn}</text><polyline points="${line}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${X(lastK)}" cy="${Y(S.weight[lastK])}" r="4.5" fill="var(--acc)"/><text x="${L}" y="${H - 3}">${shortDate(pts[0])}</text><text x="${W - R}" y="${H - 3}" text-anchor="end">${shortDate(lastK)}</text></svg>`;
}
function vHealth() {
  const seg = `<div class="seg"><button data-a="htab" data-k="weight" class="${U.hTab === 'weight' ? 'on' : ''}">Weight</button><button data-a="htab" data-k="period" class="${U.hTab === 'period' ? 'on' : ''}">Period</button></div>`;
  return seg + (U.hTab === 'weight' ? healthWeight() : healthPeriod());
}
function healthWeight() {
  const unit = S.settings.unit || 'lb', keys = Object.keys(S.weight).sort(), last = keys[keys.length - 1], prev = keys[keys.length - 2];
  const delta = prev ? S.weight[last] - S.weight[prev] : null, today = todayStr();
  const top = last ? `<div class="big">${S.weight[last]} <small>${unit}</small>${delta != null && delta !== 0 ? `<span class="delta">${delta > 0 ? '+' : ''}${delta.toFixed(1)}</span>` : ''}</div><div class="sub">${last === today ? 'Today' : 'Last logged ' + longDate(last)}</div>${weightChart(keys)}` : '<div class="sub" style="padding:6px 0">Nothing logged yet. Add your first weigh-in below.</div>';
  const form = `<form data-form="weight" class="group" style="margin:12px 0 0"><div class="rw"><span>Date</span><input type="date" name="date" value="${today}" max="${today}" required></div><div class="rw"><span>Weight (${unit})</span><input type="number" name="w" inputmode="decimal" step="any" min="1" max="999" placeholder="0.0" required></div><button class="btnrow center" style="color:var(--acc)">Save weight</button></form>`;
  const recent = keys.slice(-8).reverse().map((k) => `<div class="entry"><span>${longDate(k)}${k.slice(0, 4) !== today.slice(0, 4) ? ' ' + k.slice(0, 4) : ''}</span><b>${S.weight[k]} ${unit}</b><button class="ib sm" data-a="rmWeight" data-ds="${k}" aria-label="Delete entry for ${longDate(k)}" style="color:var(--mut)">${ic('x', 16, 2.2)}</button></div>`).join('');
  return `<div class="card pad">${top}</div>${form}${recent ? `<div class="h"><span>Recent</span></div><div class="card">${recent}</div>` : ''}`;
}
function healthPeriod() {
  const today = todayStr(), y = U.pY, m = U.pM, first = new Date(y, m, 1).getDay(), dim = daysInMonth(y, m);
  const st = C.cycleStats(S.cycle, today), len = C.periodLen(S.cycle) || 5, pred = new Set(), ups = [];
  if (st.avg) { const lastStart = st.starts[st.starts.length - 1]; for (let k = 1; k <= 6 && ups.length < 3; k++) { const a = addDays(lastStart, st.avg * k), b = addDays(a, len - 1); if (b >= today) ups.push({ a, b }); } }
  ups.forEach((u) => { for (let i = 0; i < len; i++) pred.add(addDays(u.a, i)); });
  let cells = ''; for (let i = 0; i < first; i++) cells += '<div></div>';
  for (let d = 1; d <= dim; d++) {
    const ds = y + '-' + pad(m + 1) + '-' + pad(d), on = S.cycle[ds] === 'period', cls = ['pd', on ? 'on' : '', !on && pred.has(ds) && ds >= today ? 'pred' : '', ds === today ? 'today' : ''].join(' ');
    cells += `<button class="${cls}" data-a="periodDay" data-ds="${ds}" aria-label="${longDate(ds)}${on ? ', period' : ''}"><span>${d}</span></button>`;
  }
  return `<div class="card pad"><div class="mnav" style="margin:-6px 0 4px"><button class="ib" data-a="pprev" aria-label="Previous month">${ic('left', 20, 2.2)}</button><span class="tt" style="min-width:140px;text-align:center">${MONTHS[m]} ${y}</span><button class="ib" data-a="pnext" aria-label="Next month">${ic('right', 20, 2.2)}</button></div>
<div class="pgrid">${'SMTWTFS'.split('').map((x) => `<div class="dw">${x}</div>`).join('')}${cells}</div>
<div class="legend"><span><i style="background:var(--rose)"></i>Period</span><span><i style="border:2px dashed var(--rose)"></i>Predicted</span></div></div>
<div class="sub" style="margin:8px 4px 0">Tap a day to mark or unmark it.</div>`;
}

/* ---------- settings ---------- */
function vSettings() {
  const s = S.settings, standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone, th = themePref();
  const last = s.lastBackup ? Math.max(0, Math.round((Date.now() - s.lastBackup) / 864e5)) : null;
  const sw = (a, on, label) => `<button class="tg ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" data-a="${a}"></button>`;
  const themeBtn = (k, l) => `<button data-a="theme" data-k="${k}" class="${th === k ? 'on' : ''}">${l}</button>`;
  return `<div class="safe">${ic('lock', 26)}<div><b>Stored only on this phone</b><small>No account, no cloud, no tracking.</small></div></div>
<div class="h"><span>Look</span></div><div class="seg" style="margin:0">${themeBtn('auto', 'Auto')}${themeBtn('light', 'Light')}${themeBtn('dark', 'Dark')}</div>
<div class="h"><span>Privacy</span></div><div class="group" style="margin:0"><div class="rw"><span>Lock with a PIN</span>${sw('toggleLock', !!s.lock, 'Lock with a PIN')}</div></div>
<div class="h"><span>Weight unit</span></div><div class="seg" style="margin:0"><button data-a="unit" data-k="lb" class="${(s.unit || 'lb') === 'lb' ? 'on' : ''}">lb</button><button data-a="unit" data-k="kg" class="${s.unit === 'kg' ? 'on' : ''}">kg</button></div>
<div class="h"><span>Backup</span><span style="text-transform:none;letter-spacing:0">${last == null ? 'Not backed up yet' : last === 0 ? 'Last backup: today' : 'Last backup: ' + last + (last === 1 ? ' day ago' : ' days ago')}</span></div>
<div class="group" style="margin:0"><button class="btnrow" data-a="export">Export a backup file</button><button class="btnrow" data-a="import">Restore from a backup file</button><div class="rw"><span>Monthly reminder</span>${sw('toggleRemind', s.backupReminder, 'Monthly reminder')}</div></div>
<div class="note" style="margin:8px 4px 0">A backup is a file you keep yourself (Files, iCloud Drive). It is the only way to move to a new phone or recover if this one is lost.</div>
<div class="h"><span>More</span></div><div class="group" style="margin:0"><button class="btnrow" data-a="importOld">Import from my old planner</button>${standalone ? '' : '<div class="btnrow" style="display:block;padding:12px 14px"><b style="font-weight:600">Install on iPhone</b><small style="display:block">In Safari tap Share, then Add to Home Screen.</small></div>'}<div class="btnrow" style="display:block;padding:12px 14px"><b style="font-weight:600">Storage protected</b><small style="display:block" id="persistInfo">Checking…</small></div><button class="btnrow danger" data-a="wipe">Erase everything on this phone</button></div>
<input type="file" id="fileIn" accept=".json,application/json" hidden>`;
}
async function updatePersistInfo() {
  let t = 'Not confirmed. Back up regularly.';
  try { if (navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()) t = 'Yes. The phone will not clear it on its own.'; } catch (e) {}
  const el = $('#persistInfo'); if (el) el.textContent = t;
}

/* ---------- shell ---------- */
function render() {
  const keep = $('#view').scrollTop, bar = $('#bar');
  const gear = `<button class="ib" data-a="settings" aria-label="Settings">${ic('gear', 24, 1.7)}</button>`;
  if (U.settings) {
    $('#view').classList.remove('calview');
    bar.innerHTML = `<div class="l"><button class="ib" data-a="back" aria-label="Back">${ic('left', 24, 2)}</button></div><div class="c title">Settings</div><div class="r"></div>`;
    $('#view').innerHTML = vSettings(); updatePersistInfo();
  } else {
    let left = '', center;
    if (U.tab === 'cal') {
      left = `<button class="pill" data-a="today">Today</button>`;
      center = `<div class="mnav"><button class="ib sm" data-a="mprev" aria-label="Previous month">${ic('left', 20, 2.2)}</button><span class="tt">${monthName(U.mM)} ${U.mY}</span><button class="ib sm" data-a="mnext" aria-label="Next month">${ic('right', 20, 2.2)}</button></div>`;
    } else center = `<div class="title">${{ todo: 'To-do', habits: 'Habits', health: 'Health' }[U.tab]}</div>`;
    bar.innerHTML = `<div class="l">${left}</div><div class="c">${center}</div><div class="r">${gear}</div>`;
    $('#view').classList.toggle('calview', U.tab === 'cal');
    $('#view').innerHTML = { cal: vCal, todo: vTodo, habits: vHabits, health: vHealth }[U.tab]();
  }
  $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<button data-a="tab" data-k="${k}" class="${!U.settings && U.tab === k ? 'on' : ''}" ${!U.settings && U.tab === k ? 'aria-current="page"' : ''}>${ic(i, 24, !U.settings && U.tab === k ? 2.1 : 1.7)}${l}</button>`).join('');
  $('#view').scrollTop = keep;
  wirePager(); wireAgenda();
}

// Drag the events area up and the month shrinks to half height; drag down at the top to bring it back.
let calCtl = null;
function wireAgenda() {
  const ag = $('.agenda'), view = $('#view'); calCtl = null; if (!ag) return;
  const { calH } = calSizes(), MAX = Math.round(calH * 0.5); let ly = 0, drag = false, anim = 0, dir = 0;
  const apply = (v) => { U.cs = Math.max(0, Math.min(MAX, v)); view.style.setProperty('--calh', (calH - U.cs) + 'px'); const pg = $('#pager'); if (pg) pg.scrollTop = pg.clientHeight; $('.calwrap').classList.toggle('collapsed', U.cs > MAX * 0.3); };
  const tween = (to) => { cancelAnimationFrame(anim); const from = U.cs, t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 180); apply(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) anim = requestAnimationFrame(step); }; anim = requestAnimationFrame(step); };
  calCtl = { toggle: () => tween(U.cs > 0 ? 0 : MAX) };
  apply(U.cs);
  ag.addEventListener('touchstart', (e) => { ly = e.touches[0].clientY; cancelAnimationFrame(anim); drag = false; }, { passive: true });
  ag.addEventListener('touchmove', (e) => {
    const y = e.touches[0].clientY, d = ly - y; ly = y;
    if (d > 0 && U.cs < MAX) { if (e.cancelable) e.preventDefault(); apply(U.cs + d); drag = true; dir = 1; }
    else if (d < 0 && ag.scrollTop <= 0 && U.cs > 0) { if (e.cancelable) e.preventDefault(); apply(U.cs + d); drag = true; dir = -1; }
  }, { passive: false });
  const end = () => { if (drag) { drag = false; tween(dir > 0 ? (U.cs > MAX * 0.2 ? MAX : 0) : (U.cs < MAX * 0.8 ? 0 : MAX)); } };
  ag.addEventListener('touchend', end, { passive: true }); ag.addEventListener('touchcancel', end, { passive: true });
}
function wirePager() {
  const pg = $('#pager'); if (!pg) return;
  pg.scrollTop = pg.clientHeight; let t;
  pg.addEventListener('scroll', () => {
    if (!pg.isConnected) return; const h = pg.clientHeight, idx = Math.round(pg.scrollTop / h), tt = $('.tt');
    if (tt) { const x = new Date(U.mY, U.mM + idx - 1, 1); tt.textContent = monthName(x.getMonth()) + ' ' + x.getFullYear(); }
    clearTimeout(t); t = setTimeout(() => { if (!pg.isConnected) return; const h = pg.clientHeight, i = Math.round(pg.scrollTop / h); if (i !== 1) { const x = new Date(U.mY, U.mM + i - 1, 1); gotoMonth(x.getFullYear(), x.getMonth()); } }, 140);
  }, { passive: true });
}

/* ---------- sheets ---------- */
function openSheet(html) { $('#pane').innerHTML = html; $('#sheet').classList.add('open'); $('#pane').scrollTop = 0; const f = $('#pane').querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 60); }
function closeSheet() { $('#sheet').classList.remove('open'); $('#pane').innerHTML = ''; }
const sheetHead = (title, form, label = 'Save') => `<div class="sh-head"><button type="button" class="sh-l" data-a="closeSheet">Cancel</button><div class="sh-t">${esc(title)}</div>${form ? `<button class="sh-r" type="submit" form="${form}">${label}</button>` : '<span></span>'}</div>`;
function confirmSheet(title, text, label, action, danger) {
  openSheet(`${sheetHead(title)}<p class="msg">${text}</p><div class="group"><button class="btnrow center ${danger ? 'danger' : ''}" data-a="${action}">${label}</button></div>`);
}
const repeatOpts = (v) => [['none', 'Never'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']].map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('');
function eventSheet(e) {
  const isNew = !e.id, r = e.repeat || { type: 'none' }, allDay = !e.startTime, cat = e.cat || 'personal';
  openSheet(`${sheetHead(isNew ? 'New event' : 'Edit event', 'event')}<form id="event" data-form="event" data-id="${esc(e.id || '')}">
<div class="group"><div class="rw full"><input name="name" maxlength="80" required placeholder="Title" ${isNew ? 'autofocus' : ''} value="${esc(e.name || '')}" aria-label="Title"></div></div>
<div class="group"><div class="rw"><span>All day</span><input type="checkbox" class="tg" name="allday" ${allDay ? 'checked' : ''}></div>
<div class="rw"><span>Starts</span><input type="date" name="date" required value="${e.date}"></div>
<div class="rw tm" ${allDay ? 'hidden' : ''}><span>Start time</span><input type="time" name="startTime" value="${e.startTime || '09:00'}"></div>
<div class="rw"><span>Ends</span><input type="date" name="endDate" required value="${e.endDate || e.date}"></div>
<div class="rw tm" ${allDay ? 'hidden' : ''}><span>End time</span><input type="time" name="endTime" value="${e.endTime || ''}"></div></div>
<div class="group"><div class="rw"><span>Repeat</span><select name="rtype">${repeatOpts(r.type)}</select></div>
<div class="sw-row" id="catPick" role="radiogroup" aria-label="Color">${CATS.map((c) => `<button type="button" class="sw ${cat === c.id ? 'on' : ''}" data-a="pickCat" data-c="${c.id}" style="--dot:${c.dot}" role="radio" aria-checked="${cat === c.id}" aria-label="${c.label}"></button>`).join('')}</div><input type="hidden" name="cat" value="${cat}"></div>
<div class="group"><div class="rw full"><textarea name="notes" placeholder="Notes" aria-label="Notes">${esc(e.notes || '')}</textarea></div></div>
${isNew ? '' : `<div class="group"><button type="button" class="btnrow danger center" data-a="delEvent" data-id="${esc(e.id)}">Delete event</button></div>`}</form>`);
}
function taskSheet(t) {
  openSheet(`${sheetHead('Edit to-do', 'task')}<form id="task" data-form="task" data-id="${esc(t.id)}">
<div class="group"><div class="rw full"><input name="text" maxlength="120" required value="${esc(t.text)}" aria-label="To-do"></div></div>
<div class="group"><div class="rw"><span>Due</span><input type="date" name="due" value="${t.due || ''}"></div><button type="button" class="btnrow" data-a="clearDue"><span style="color:var(--mut)">No due date</span></button></div>
<div class="group"><button type="button" class="btnrow danger center" data-a="delTask" data-id="${t.id}">Delete to-do</button></div></form>`);
}
function submitForm(f) {
  const fd = Object.fromEntries(new FormData(f)), id = f.dataset.id, k = f.dataset.form;
  if (k === 'event') {
    if (!fd.name.trim() || !fd.date) return;
    const old = S.events.find((x) => x.id === id), allDay = fd.allday === 'on', end = fd.endDate && fd.endDate > fd.date ? fd.endDate : null;
    const oldR = (old && old.repeat) || {}, repeat = fd.rtype && fd.rtype !== 'none' ? { type: fd.rtype, every: oldR.type === fd.rtype ? oldR.every || 1 : 1, until: oldR.type === fd.rtype ? oldR.until || null : null } : { type: 'none' };
    const ev = { id: id || uid(), name: fd.name.trim(), date: fd.date, endDate: end, startTime: allDay ? null : fd.startTime || '09:00', endTime: allDay ? null : fd.endTime || null, cat: fd.cat, repeat, notes: (fd.notes || '').trim() };
    const i = S.events.findIndex((x) => x.id === id); if (i > -1) S.events[i] = ev; else S.events.push(ev);
    U.sel = ev.date; Object.assign(U, { mY: monthOf(ev.date).y, mM: monthOf(ev.date).m });
  } else if (k === 'task') {
    if (!fd.text.trim()) return;
    const t = S.tasks.find((x) => x.id === id); if (t) { t.text = fd.text.trim(); t.due = fd.due || null; }
  }
  save(); closeSheet(); render();
}

/* ---------- backup / restore ---------- */
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(pass, salt) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
async function encrypt(text, pass) { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt), new TextEncoder().encode(text)); return { planner: 'encrypted', v: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) }; }
async function decrypt(o, pass) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, await key(pass, unb64(o.salt)), unb64(o.data)); return new TextDecoder().decode(pt); }
function exportSheet() {
  openSheet(`${sheetHead('Back up', 'export', 'Export')}<form id="export" data-form="export"><p class="msg">Saves one file with everything. Add a passphrase to lock it. If you forget the passphrase, the file can't be opened.</p><div class="group"><div class="rw"><span>Passphrase</span><input type="password" name="pass" placeholder="Optional" autocomplete="new-password"></div></div></form>`);
}
async function doExport(pass) {
  const payload = JSON.stringify({ planner: 'backup', v: 1, exportedAt: new Date().toISOString(), data: S });
  const out = pass ? JSON.stringify(await encrypt(payload, pass)) : payload;
  const file = new File([out], 'planner-backup-' + todayStr() + (pass ? '-locked' : '') + '.json', { type: 'application/json' });
  closeSheet();
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Planner backup' }); markBackup(); return; } }
  catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); markBackup();
}
function markBackup() { S.settings.lastBackup = Date.now(); save(); toast('Backup saved.'); render(); }
let pendingEnc = null, pendingOld = null, pendingRestore = null;
async function handleFile(file) {
  let text; try { text = await file.text(); } catch (e) { return toast("Couldn't read that file."); }
  let o; try { o = JSON.parse(text); } catch (e) { return toast("That file isn't a valid backup."); }
  if (o.planner === 'encrypted') { pendingEnc = o; return openSheet(`${sheetHead('Locked backup', 'decrypt', 'Open')}<form id="decrypt" data-form="decrypt"><div class="group"><div class="rw"><span>Passphrase</span><input type="password" name="pass" autofocus></div></div></form>`); }
  applyImport(o);
}
function applyImport(o) {
  if (C.isOldExport(o)) {
    const part = C.convertOld(o); pendingOld = part;
    return confirmSheet('Import old planner', `Found ${part.events.length} events, ${part.tasks.length} to-dos, ${Object.keys(part.habitLog).length} days of habits, ${Object.keys(part.weight).length} weights and ${Object.keys(part.cycle).length} period days. They'll be added to what's already here.`, 'Add them', 'confirmOld');
  }
  if (o && o.planner === 'backup' && o.data) { pendingRestore = o.data; return confirmSheet('Replace everything?', `This replaces all planner data on this phone with the backup from ${esc((o.exportedAt || '').slice(0, 10))}.`, 'Replace', 'confirmRestore', true); }
  toast("That file isn't a Planner backup.");
}

/* ---------- PIN lock (a screen lock, not encryption) ---------- */
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function pinHash(pin, saltHex) { const salt = Uint8Array.from(saltHex.match(/../g), (h) => parseInt(h, 16)); const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']); return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, k, 256)); }
function maybeLock() { if (S.settings.lock && unlocked && hiddenAt && Date.now() - hiddenAt > 60000) { unlocked = false; showPin('unlock'); } }
function showPin(mode, cb) {
  let buf = '', first = null, title = mode === 'unlock' ? 'Enter PIN' : mode === 'set' ? 'Choose a 4-digit PIN' : 'Enter current PIN';
  const el = $('#lock'); el.classList.add('open');
  const close = () => { el.classList.remove('open'); el.innerHTML = ''; };
  const draw = (msg) => { el.innerHTML = `<div class="ser">${title}</div><div class="pdots">${[0, 1, 2, 3].map((i) => `<i class="${i < buf.length ? 'on' : ''}"></i>`).join('')}</div><div class="mut" style="min-height:20px;font-size:13px;font-weight:700" role="alert">${msg || ''}</div><div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}" aria-label="${n}">${n}</button>`).join('')}<button class="x" data-n="cancel">${mode === 'unlock' ? 'Forgot?' : 'Cancel'}</button><button data-n="0" aria-label="0">0</button><button class="x" data-n="del" aria-label="Delete">⌫</button></div>`; };
  draw();
  el.onclick = async (ev) => {
    const b = ev.target.closest('[data-n]'); if (!b) return; const n = b.dataset.n;
    if (n === 'cancel') { if (mode === 'unlock') return forgot(); close(); return cb && cb(false); }
    if (n === 'del') { buf = buf.slice(0, -1); return draw(); }
    if (buf.length >= 4) return; buf += n; draw(); if (buf.length < 4) return;
    if (mode === 'set') {
      if (first == null) { first = buf; buf = ''; title = 'Confirm PIN'; return draw(); }
      if (first !== buf) { first = null; buf = ''; title = 'Choose a 4-digit PIN'; return draw("Those didn't match. Try again."); }
      const salt = hex(crypto.getRandomValues(new Uint8Array(16))); S.settings.lock = { salt, hash: await pinHash(buf, salt) }; save(); close(); toast('PIN lock is on.'); render(); return cb && cb(true);
    }
    const ok = (await pinHash(buf, S.settings.lock.salt)) === S.settings.lock.hash;
    if (ok) { close(); unlocked = true; if (mode === 'check') { S.settings.lock = null; save(); toast('PIN lock is off.'); render(); } return cb && cb(true); }
    buf = ''; draw('Wrong PIN.');
  };
  function forgot() {
    el.innerHTML = `<div class="ser">Forgot your PIN?</div><p class="mut" style="font-weight:600;text-align:center;max-width:300px;margin:0">There's no way to recover it. You can erase this phone's planner data and restore from a backup file.</p><button class="lockbtn danger" id="eraseAll">Erase and start over</button><button class="lockbtn" id="backLock">Back</button>`;
    $('#eraseAll').onclick = async () => { if (confirm('Erase all planner data on this phone?')) { await wipe(); location.reload(); } };
    $('#backLock').onclick = () => showPin(mode, cb);
  }
}
async function wipe() { S = C.defaults(); try { if (db) await kvSet('state', JSON.parse(JSON.stringify(S))); } catch (e) {} }

/* ---------- actions ---------- */
function gotoMonth(y, m) { U.mY = y; U.mM = m; const t = todayStr(); U.sel = y === +t.slice(0, 4) && m === +t.slice(5, 7) - 1 ? t : y + '-' + pad(m + 1) + '-01'; render(); }
const A = {
  tab: (d) => { const again = !U.settings && U.tab === d.k; U.settings = false; U.tab = d.k; if (d.k === 'cal' && again) return A.today(); render(); if (!again) $('#view').scrollTop = 0; },
  settings: () => { U.settings = true; render(); $('#view').scrollTop = 0; }, back: () => { U.settings = false; render(); },
  toggleCal: () => { if (calCtl) calCtl.toggle(); },
  today: () => { const t = todayStr(); U.sel = t; U.mY = +t.slice(0, 4); U.mM = +t.slice(5, 7) - 1; render(); $('#view').scrollTop = 0; },
  pick: (d) => { U.sel = d.ds; const m = monthOf(d.ds); U.mY = m.y; U.mM = m.m; render(); },
  mprev: () => gotoMonth(U.mM === 0 ? U.mY - 1 : U.mY, (U.mM + 11) % 12), mnext: () => gotoMonth(U.mM === 11 ? U.mY + 1 : U.mY, (U.mM + 1) % 12),
  snooze: () => { S.settings.snooze = Date.now(); save(); render(); },
  newEvent: () => eventSheet({ date: U.sel }),
  editEvent: (d) => { const e = S.events.find((x) => x.id === d.id); if (e) eventSheet(e); },
  delEvent: (d) => { S.events = S.events.filter((x) => x.id !== d.id); save(); closeSheet(); render(); },
  pickCat: (d, e) => { const f = e.target.closest('form'); f.elements.cat.value = d.c; f.querySelectorAll('#catPick .sw').forEach((b) => { const on = b.dataset.c === d.c; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); },
  closeSheet: () => closeSheet(),
  newDue: (d) => { U.newDue = d.k; render(); const q = $('#qa'); if (q) q.focus(); },
  toggleDone: () => { U.showDone = !U.showDone; render(); },
  clearDone: () => { S.tasks = S.tasks.filter((t) => !t.done); U.showDone = false; save(); render(); },
  editTask: (d) => { const t = S.tasks.find((x) => x.id === d.id); if (t) taskSheet(t); },
  delTask: (d) => { S.tasks = S.tasks.filter((x) => x.id !== d.id); save(); closeSheet(); render(); },
  clearDue: (d, e) => { e.target.closest('form').elements.due.value = ''; },
  toggleTask: (d) => {
    const t = S.tasks.find((x) => x.id === d.id); if (!t) return;
    if (!t.done) { t.done = true; t.doneAt = todayStr(); const nx = C.nextDue(t.due || todayStr(), t.repeat); if (nx) S.tasks.push({ id: uid(), text: t.text, due: nx, list: t.list || null, done: false, doneAt: null, repeat: t.repeat }); }
    else { t.done = false; t.doneAt = null; }
    save(); render();
  },
  hprev: () => { U.hw = addDays(U.hw, -7); render(); }, hnext: () => { U.hw = addDays(U.hw, 7); render(); },
  toggleHabit: (d) => { const set = new Set(S.habitLog[d.ds] || []); set.has(d.id) ? set.delete(d.id) : set.add(d.id); if (set.size) S.habitLog[d.ds] = [...set]; else delete S.habitLog[d.ds]; save(); render(); },
  toggleEditHabits: () => { U.editHabits = !U.editHabits; render(); },
  rmHabit: (d) => { S.habits = S.habits.filter((x) => x.id !== d.id); save(); render(); },
  addHabit: () => { S.habits.push({ id: uid(), label: '', icon: 0 }); U.editHabits = true; render(); const ins = document.querySelectorAll('[data-habit]'); const l = ins[ins.length - 1]; if (l) l.focus(); },
  htab: (d) => { U.hTab = d.k; render(); },
  rmWeight: (d) => { delete S.weight[d.ds]; save(); render(); },
  pprev: () => { if (U.pM === 0) { U.pM = 11; U.pY--; } else U.pM--; render(); }, pnext: () => { if (U.pM === 11) { U.pM = 0; U.pY++; } else U.pM++; render(); },
  periodDay: (d) => { if (S.cycle[d.ds] === 'period') delete S.cycle[d.ds]; else S.cycle[d.ds] = 'period'; save(); render(); },
  theme: (d) => { try { if (d.k === 'auto') localStorage.removeItem('planner-theme'); else localStorage.setItem('planner-theme', d.k); } catch (e) {} applyTheme(); render(); },
  unit: (d) => {
    const cur = S.settings.unit || 'lb'; if (cur === d.k) return;
    const f = d.k === 'kg' ? 0.45359237 : 1 / 0.45359237; Object.keys(S.weight).forEach((k) => { S.weight[k] = Math.round(S.weight[k] * f * 10) / 10; });
    S.settings.unit = d.k; save(); render(); toast('Past weights were converted.');
  },
  toggleRemind: () => { S.settings.backupReminder = !S.settings.backupReminder; save(); render(); },
  toggleLock: () => { if (S.settings.lock) showPin('check'); else showPin('set'); },
  export: () => exportSheet(),
  import: () => { $('#fileIn').value = ''; $('#fileIn').click(); },
  importOld: () => openSheet(`${sheetHead('Old planner')}<ol class="msg" style="line-height:1.5;padding-left:40px"><li>On the laptop, open your old planner.</li><li>Run the one-line snippet from the README. It downloads <b>planner-old-data.json</b>.</li><li>Send that file to this phone and choose it below.</li></ol><div class="group"><button class="btnrow center" style="color:var(--acc)" data-a="pickOld">Choose file</button></div>`),
  pickOld: () => { closeSheet(); $('#fileIn').value = ''; $('#fileIn').click(); },
  confirmOld: () => { if (pendingOld) { C.mergeInto(S, pendingOld); pendingOld = null; save(); closeSheet(); toast('Imported.'); render(); } },
  confirmRestore: () => { if (pendingRestore) { S = C.normalize(pendingRestore); pendingRestore = null; save(); closeSheet(); toast('Backup restored.'); render(); } },
  wipe: () => confirmSheet('Erase everything?', "This deletes all planner data from this phone. It can't be undone unless you have a backup.", 'Erase everything', 'doWipe', true),
  doWipe: async () => { await wipe(); closeSheet(); U.tab = 'cal'; U.settings = false; toast('All data erased.'); render(); },
};
document.addEventListener('click', (e) => {
  if (e.target.id === 'sheet') return closeSheet();
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  const f = A[el.dataset.a]; if (f) f(el.dataset, e);
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
  const k = f.dataset.form, fd = new FormData(f);
  if (k === 'export') { try { await doExport(fd.get('pass') || ''); } catch (er) { toast("Couldn't create the backup."); } return; }
  if (k === 'decrypt') { try { const txt = await decrypt(pendingEnc, fd.get('pass')); closeSheet(); applyImport(JSON.parse(txt)); } catch (er) { toast('Wrong passphrase or damaged file.'); } return; }
  if (k === 'quick') {
    const text = (fd.get('text') || '').trim(); if (!text) return;
    const t = todayStr(), due = U.newDue === 'today' ? t : U.newDue === 'tomorrow' ? addDays(t, 1) : null;
    S.tasks.push({ id: uid(), text, due, list: null, done: false, doneAt: null, repeat: null }); save(); render(); const q = $('#qa'); if (q) q.focus(); return;
  }
  if (k === 'weight') {
    const w = parseFloat(fd.get('w')), ds = fd.get('date'); if (!(w > 0) || !ds) return toast('Enter a weight.');
    S.weight[ds] = Math.round(w * 10) / 10; save(); render(); return toast('Saved.');
  }
  submitForm(f);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.habit) { const h = S.habits.find((x) => x.id === t.dataset.habit); if (h) { h.label = t.value; save(); } }
});
document.addEventListener('focusout', (e) => { if (e.target.dataset && e.target.dataset.habit && !e.target.value.trim()) { const h = S.habits.find((x) => x.id === e.target.dataset.habit); if (h) h.label = 'Habit'; e.target.value = 'Habit'; save(); } });
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'fileIn' && t.files[0]) handleFile(t.files[0]);
  const f = t.form; if (!f || f.dataset.form !== 'event') return;
  if (t.name === 'allday') { f.querySelectorAll('.tm').forEach((r) => { r.hidden = t.checked; }); if (!t.checked && !f.elements.endTime.value) f.elements.endTime.value = ''; }
  if (t.name === 'date' && f.elements.endDate.value < t.value) f.elements.endDate.value = t.value;
  if (t.name === 'endDate' && t.value < f.elements.date.value) t.value = f.elements.date.value;
});
// swipe left/right on the month grid to change month
let sx = 0, sy = 0;
document.addEventListener('touchstart', (e) => { if (e.target.closest('#pager')) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } else sx = 0; }, { passive: true });
document.addEventListener('touchend', (e) => { if (!sx) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = 0; if (Math.abs(dx) > 60 && Math.abs(dy) < 40) (dx < 0 ? A.mnext : A.mprev)(); }, { passive: true });

/* ---------- start ---------- */
(async function init() {
  applyTheme();
  try { db = await idb(); const saved = await kvGet('state'); if (saved) S = C.normalize(saved); }
  catch (e) { memOnly = true; setTimeout(() => toast("Storage isn't available here, so changes won't be kept. Export a backup."), 500); }
  requestPersist();
  MONTHS.forEach((m) => { new Image().src = 'stickers/Sticker-' + m + '.png'; });
  let rh = innerHeight; addEventListener('resize', () => { if (Math.abs(innerHeight - rh) > 80 && !$('#sheet').classList.contains('open') && !U.settings && U.tab === 'cal' && !document.activeElement.closest('form')) { rh = innerHeight; render(); } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
  if (S.settings.lock) showPin('unlock'); else unlocked = true;
  // First run in a browser that still holds the old planner's data: offer to bring it over.
  try { if (!S.settings.oldChecked && !hasData()) { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('lp_') === 0) o[k] = localStorage.getItem(k); } S.settings.oldChecked = true; save(); if (C.isOldExport(o) && (o.lp_ev || o.lp_td2 || o.lp_habits || o.lp_weight)) setTimeout(() => { if (!S.settings.lock || unlocked) applyImport(o); }, 400); } } catch (e) {}
  window.__planner = { get state() { return S; }, U, A, C, render };
})();
