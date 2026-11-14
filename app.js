import * as C from './core.js';
const { CATS, MONTHS, DOW, ICON_KEYS, pad, fmt, parse, addDays, diffDays, weekStartOf, daysInMonth, todayStr, eventsOn, holidayOn } = C;

/* ---------- icons ---------- */
const P = {
today:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
cal:'<rect x="3" y="5" width="18" height="16" rx="4"/><path d="M3 10h18M8 3v4M16 3v4"/>',
tasks:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
chart:'<path d="M3 21h18"/><path d="M3 16l6-6 4 4 8-9"/>',
plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>', left:'<path d="M15 5l-7 7 7 7"/>', right:'<path d="M9 5l7 7-7 7"/>',
gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
stretch:'<circle cx="12" cy="5" r="2"/><path d="M5 9l7 2 7-2M12 11v4l-3 6M12 15l3 6"/>',
heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
dumb:'<path d="M6 7v10M3 10v4M18 7v10M21 10v4M6 12h12"/>',
book:'<path d="M4 19V5a2 2 0 012-2h13v15H6a2 2 0 00-2 2zm0 0a2 2 0 002 2h13"/>',
drop:'<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>', lock:'<rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 018 0v3"/>',
down:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', up:'<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
repeat:'<path d="M4 11V9a3 3 0 013-3h11l-3-3M20 13v2a3 3 0 01-3 3H6l3 3"/>', share:'<path d="M12 15V3M8 7l4-4 4 4M6 11H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-1"/>',
eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const ic = (n, s = 22, sw = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s) => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- storage (IndexedDB, on this device only) ---------- */
let db = null, memOnly = false;
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('planner', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); }; r.onerror = () => rej(r.error); });
const kvGet = (k) => new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const kvSet = (k, v) => new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
let S = C.defaults(), saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); }
async function flush() {
  if (memOnly) return;
  try { await kvSet('state', JSON.parse(JSON.stringify(S))); }
  catch (e) { toast("Couldn't save on this device. Export a backup now."); }
}
addEventListener('pagehide', () => { clearTimeout(saveTimer); flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); clearTimeout(saveTimer); flush(); } else maybeLock(); });
async function requestPersist() { try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {} }

/* ---------- ui state ---------- */
const U = { view: 'today', sel: todayStr(), mY: +todayStr().slice(0, 4), mM: +todayStr().slice(5, 7) - 1, mMode: 'month', taskTab: 'today', listFilter: null, editHabits: false, revealed: false, showDone: false };
let hiddenAt = 0, unlocked = false;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }
const fmtTime = (t) => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + pad(m) + ' ' + ap; };
const longDate = (ds) => { const d = parse(ds); return DOW[d.getDay()].slice(0, 3) + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(); };
const catOf = (id) => CATS.find((c) => c.id === id) || CATS[0];

/* ---------- reusable bits ---------- */
function evRow(e, ds) {
  const c = catOf(e.cat); const multi = e.endDate && e.endDate > e.date ? ` &middot; through ${longDate(e.endDate)}` : '';
  const rep = e.repeat && e.repeat.type !== 'none' ? ' &middot; repeats' : '';
  return `<button class="ev" data-a="editEvent" data-id="${esc(e.id)}"><div class="tm">${e.startTime ? fmtTime(e.startTime).replace(' ', '<small>') + '</small>' : '<small style="margin-top:0">All day</small>'}</div><div class="bd" style="background:${c.bg}"><b>${esc(e.name)}</b><span>${c.label}${multi}${rep}${e.endTime ? ' &middot; until ' + fmtTime(e.endTime) : ''}</span></div></button>`;
}
function taskRow(t) {
  const meta = [];
  if (t.repeat && t.repeat.type !== 'none') meta.push(ic('repeat', 12, 2) + 'repeats');
  if (t.due) meta.push(t.due < todayStr() && !t.done ? 'Overdue ' + longDate(t.due) : longDate(t.due));
  if (t.list) meta.push(esc(t.list));
  return `<div class="tk ${t.done ? 'done' : ''}"><button class="cbw" data-a="toggleTask" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.text)}"><span class="cb ${t.done ? 'on' : ''}">${t.done ? ic('check', 16, 3) : ''}</span></button><button class="tx" data-a="editTask" data-id="${t.id}"><b>${esc(t.text)}</b>${meta.length ? '<small>' + meta.join(' &middot; ') + '</small>' : ''}</button></div>`;
}
const sec = (title, right, inner, card = true) => `<section class="sec"><div class="sec-h"><div class="t">${title}</div><div class="r">${right || ''}</div></div>${card ? `<div class="card">${inner}</div>` : inner}</section>`;
function habToday(ds) {
  const done = new Set(S.habitLog[ds] || []);
  return S.habits.map((h) => `<button class="hab ${done.has(h.id) ? 'on' : ''}" data-a="toggleHabit" data-id="${h.id}" data-ds="${ds}" aria-label="${esc(h.label)}${done.has(h.id) ? ', done' : ''}"><span class="c">${ic(ICON_KEYS[h.icon % 6], 24)}${done.has(h.id) ? `<span class="bdg">${ic('check', 11, 3.4)}</span>` : ''}</span><span class="n">${esc(h.label)}</span></button>`).join('');
}
const stickerFor = (m0) => `<div class="sticker"><img src="stickers/Sticker-${MONTHS[m0]}.png" alt="${MONTHS[m0]} sticker"></div>`;
function tasksDueOn(ds) {
  const today = todayStr();
  return S.tasks.filter((t) => (t.done ? t.doneAt === ds : (t.due === ds || (ds === today && t.due && t.due < today))));
}

/* ---------- views ---------- */
function vToday() {
  const ds = U.sel, d = parse(ds), today = todayStr(), ws = weekStartOf(ds), hol = holidayOn(ds);
  const strip = [...Array(7)].map((_, i) => { const x = addDays(ws, i), xd = parse(x); return `<button data-a="pick" data-ds="${x}" class="${x === ds ? 'sel' : ''} ${x === today ? 'istoday' : ''}" aria-label="${longDate(x)}"><span>${'SMTWTFS'[i]}</span><span>${xd.getDate()}</span></button>`; }).join('');
  const evs = eventsOn(S.events, ds), tks = tasksDueOn(ds);
  const needBackup = S.settings.backupReminder && hasData() && (S.settings.lastBackup ? Date.now() - S.settings.lastBackup > 30 * 864e5 : Date.now() - S.settings.created > 7 * 864e5);
  return `<div class="top"><div style="padding-bottom:6px"><div class="lbl">${DOW[d.getDay()]}${ds === today ? '' : ' &middot; ' + d.getFullYear()}</div><h1 class="h1" style="margin-top:2px">${MONTHS[d.getMonth()]} ${d.getDate()}</h1>${hol ? `<div style="margin-top:8px"><span class="pill">${esc(hol)}</span></div>` : ''}</div>${stickerFor(d.getMonth())}
<div class="top-actions"><button class="icobtn" data-a="search" aria-label="Search">${ic('search', 20)}</button><button class="icobtn" data-a="go" data-v="settings" aria-label="Privacy and backup">${ic('gear', 20)}</button></div></div>
${needBackup ? `<div class="banner"><span style="flex:1">Time for a backup. Your data lives only on this phone.</span><button class="btn" data-a="export">Export</button></div>` : ''}
<div class="strip">${strip}</div>
${sec('Schedule', evs.length + (evs.length === 1 ? ' event' : ' events'), evs.length ? evs.map((e) => evRow(e, ds)).join('') : '<div class="empty">Nothing scheduled.</div>')}
${sec('Tasks', tks.length ? tks.filter((t) => t.done).length + ' of ' + tks.length + ' done' : '', tks.length ? tks.map(taskRow).join('') : '<div class="empty">No tasks for this day.</div>')}
${sec('Habits', S.habits.length ? S.habits.filter((h) => (S.habitLog[ds] || []).includes(h.id)).length + ' of ' + S.habits.length + ' &middot; <a href="#" data-a="go" data-v="trackers" style="display:inline-block;padding:10px 4px;margin:-10px -4px;text-decoration:underline">Edit</a>' : '', S.habits.length ? `<div class="hab-row" style="padding:4px 0">${habToday(ds)}</div>` : '<div class="empty">No habits yet. Add some in Trackers.</div>')}`;
}
function vMonth() {
  const y = U.mY, m = U.mM, first = new Date(y, m, 1).getDay(), dim = daysInMonth(y, m), today = todayStr();
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div></div>';
  for (let d = 1; d <= dim; d++) {
    const ds = y + '-' + pad(m + 1) + '-' + pad(d), evs = eventsOn(S.events, ds), hol = holidayOn(ds);
    const dots = evs.slice(0, 3).map((e) => `<i style="background:${catOf(e.cat).dot}"></i>`).join('') || (hol ? '<i style="background:#E8B923"></i>' : '');
    cells += `<button class="day ${ds < today ? 'past' : ''} ${ds === today ? 'today' : ''} ${ds === U.sel ? 'sel' : ''}" data-a="pick" data-ds="${ds}" data-stay="1" aria-label="${longDate(ds)}${evs.length ? ', ' + evs.length + ' events' : ''}"><span class="n">${d}</span><span class="dots">${dots}</span></button>`;
  }
  const evs = eventsOn(S.events, U.sel), tks = tasksDueOn(U.sel), hol = holidayOn(U.sel);
  const head = (nav, title, stick) => `<div class="mhead"><div><div class="mnav">${nav[0]}<div class="t">${title}</div>${nav[1]}</div>
<div class="seg" role="tablist"><button data-a="mmode" data-m="month" class="${U.mMode === 'month' ? 'on' : ''}">Month</button><button data-a="mmode" data-m="week" class="${U.mMode === 'week' ? 'on' : ''}">Week</button></div></div>${stick}</div>`;
  const btn = (a, ic_, label) => `<button class="icobtn" data-a="${a}" aria-label="${label}">${ic(ic_, 18, 2.2)}</button>`;
  if (U.mMode === 'week') {
    const ws = weekStartOf(U.sel), we = addDays(ws, 6), a = parse(ws), b = parse(we);
    const title = MONTHS[a.getMonth()].slice(0, 3) + ' ' + a.getDate() + ' – ' + (a.getMonth() === b.getMonth() ? '' : MONTHS[b.getMonth()].slice(0, 3) + ' ') + b.getDate();
    const days = [...Array(7)].map((_, i) => { const x = addDays(ws, i), xd = parse(x), es = eventsOn(S.events, x), ts = tasksDueOn(x), h = holidayOn(x);
      return `<div class="weekday"><button class="wd ${x === today ? 'today' : ''}" data-a="pick" data-ds="${x}" aria-label="${longDate(x)}"><span>${DOW[i].slice(0, 3)}</span><b>${xd.getDate()}</b></button><div class="items">${h ? `<span class="pill" style="align-self:flex-start">${esc(h)}</span>` : ''}${es.map((e) => evRow(e, x)).join('')}${ts.map((t) => `<div class="mut" style="font-size:13px;font-weight:700">${t.done ? '✓ ' : '○ '}${esc(t.text)}</div>`).join('')}${!es.length && !ts.length && !h ? '<div class="mut" style="font-size:13px;padding-top:4px">—</div>' : ''}</div></div>`; }).join('');
    return head([btn('wprev', 'left', 'Previous week'), btn('wnext', 'right', 'Next week')], title, stickerFor(a.getMonth())) + `<div class="sec card" style="padding:4px 16px">${days}</div>` + sec('Notes for this week', '', `<textarea class="note" id="wnote" placeholder="Write your notes for this week…" aria-label="Week notes">${esc(S.weekNotes[ws] || '')}</textarea>`);
  }
  return head([btn('mprev', 'left', 'Previous month'), btn('mnext', 'right', 'Next month')], MONTHS[m] + (y !== +today.slice(0, 4) ? ' ' + y : ''), stickerFor(m)) +
`<div class="sec card" style="padding:10px 6px"><div class="dow">${'SMTWTFS'.split('').map((x) => `<div>${x}</div>`).join('')}</div><div class="grid">${cells}</div></div>
<section class="sec"><div class="sec-h"><div class="t">${longDate(U.sel)}</div>${hol ? `<span class="pill">${esc(hol)}</span>` : ''}</div><div class="card">${evs.length ? evs.map((e) => evRow(e, U.sel)).join('') : '<div class="empty">Nothing scheduled.</div>'}${tks.length ? '<div style="border-top:1px solid var(--line);margin-top:6px">' + tks.map(taskRow).join('') + '</div>' : ''}</div></section>`;
}
function vTasks() {
  const today = todayStr(), open = S.tasks.filter((t) => !t.done), tab = U.taskTab;
  const seg = ['today', 'upcoming', 'lists'].map((k) => `<button data-a="ttab" data-k="${k}" class="${tab === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('');
  let body = '';
  if (tab === 'today') {
    const due = open.filter((t) => t.due && t.due <= today).sort((a, b) => a.due.localeCompare(b.due)), any = open.filter((t) => !t.due);
    body = sec('Today', due.length + ' left', due.length ? due.map(taskRow).join('') : '<div class="empty">Nothing due today.</div>') + (any.length ? sec('Anytime', String(any.length), any.map(taskRow).join('')) : '');
  } else if (tab === 'upcoming') {
    const up = open.filter((t) => t.due && t.due > today).sort((a, b) => a.due.localeCompare(b.due)), groups = {};
    up.forEach((t) => (groups[t.due] = groups[t.due] || []).push(t));
    body = Object.keys(groups).map((k) => sec(longDate(k), String(groups[k].length), groups[k].map(taskRow).join(''))).join('') || sec('Upcoming', '', '<div class="empty">Nothing coming up.</div>');
  } else {
    const chips = `<div class="chips" style="margin-top:14px"><button class="chip ${U.listFilter ? '' : 'on'}" data-a="lfilter" data-l="">All</button>${S.lists.map((l) => `<button class="chip ${U.listFilter === l ? 'on' : ''}" data-a="lfilter" data-l="${esc(l)}">${esc(l)}</button>`).join('')}<button class="chip" data-a="newList">+ New list</button></div>`;
    const shown = (U.listFilter ? [U.listFilter] : S.lists.concat([null]));
    body = chips + shown.map((l) => { const ts = open.filter((t) => (t.list || null) === l); return ts.length || U.listFilter ? sec(l ? esc(l) : 'No list', String(ts.length), ts.length ? ts.map(taskRow).join('') : '<div class="empty">Empty.</div>') : ''; }).join('');
  }
  const doneToday = S.tasks.filter((t) => t.done && t.doneAt === today);
  const done = tab === 'lists' ? '' : `<section class="sec"><button class="card row" style="width:100%;min-height:52px" data-a="toggleDone"><span class="cb on">${ic('check', 16, 3)}</span><span style="flex:1;text-align:left;font-weight:800;font-size:14px">Completed today</span><span class="mut" style="font-weight:800">${doneToday.length}</span></button>${U.showDone && doneToday.length ? `<div class="card" style="margin-top:8px">${doneToday.map(taskRow).join('')}</div>` : ''}</section>`;
  return `<div class="top"><h1 class="h1">Tasks</h1></div><div class="seg wide">${seg}</div>${body}${done}`;
}
function sparkline(vals) {
  if (vals.length < 2) return '<div class="mut" style="font-size:12px;font-weight:700;padding:8px 0">Log two weigh-ins to see a trend.</div>';
  const w = 140, h = 54, mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => [4 + (i * (w - 8)) / (vals.length - 1), h - 8 - ((v - mn) / r) * (h - 16)]);
  return `<svg width="100%" height="54" viewBox="0 0 ${w} ${h}" role="img" aria-label="Weight trend"><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="5" fill="var(--peach)" stroke="var(--ink)" stroke-width="2.5"/></svg>`;
}
function vTrackers() {
  const today = todayStr(), ws = weekStartOf(today), edit = U.editHabits;
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const rows = S.habits.map((h) => `<div class="hr"><button class="tile" data-a="cycleIcon" data-id="${h.id}" aria-label="Change icon for ${esc(h.label)}">${ic(ICON_KEYS[h.icon % 6], 19)}</button>${edit
    ? `<input class="inp" data-habit="${h.id}" maxlength="16" value="${esc(h.label)}" aria-label="Habit name"><button class="rm" data-a="rmHabit" data-id="${h.id}" aria-label="Remove ${esc(h.label)}">${ic('minus', 20, 2.2)}</button>`
    : `<div class="nm">${esc(h.label)}</div><div class="dots7">${days.map((x, i) => { const on = (S.habitLog[x] || []).includes(h.id); return `<button data-a="toggleHabit" data-id="${h.id}" data-ds="${x}" aria-label="${esc(h.label)}, ${DOW[i]}${on ? ', done' : ', not done'}"><span class="d ${on ? 'on' : ''}">${on ? ic('check', 14, 3.2) : ''}</span></button>`; }).join('')}</div>`}</div>`).join('');
  const habCard = `<div class="card" style="padding:12px 10px">${edit ? '<div class="mut" style="font-size:12px;font-weight:700;padding:0 4px 6px">Tap an icon to change it. Names save as you type.</div>' : (S.habits.length ? `<div class="dots7 head" style="justify-content:flex-end">${'SMTWTFS'.split('').map((x) => `<span>${x}</span>`).join('')}</div>` : '')}${rows || '<div class="empty">No habits yet.</div>'}${edit ? `<button class="addh" data-a="addHabit">${ic('plus', 18, 2.2)}Add habit</button>` : ''}</div>`;
  // weight
  const wk = Object.keys(S.weight).sort(), last = wk.slice(-8).map((k) => S.weight[k]), cur = S.weight[today];
  const delta = wk.length > 1 ? (S.weight[wk[wk.length - 1]] - S.weight[wk[wk.length - 2]]) : null;
  const weightCard = `<div class="card" style="padding:14px"><div class="row" style="justify-content:space-between"><div class="big">${wk.length ? S.weight[wk[wk.length - 1]] : '—'}<span class="mut" style="font-size:13px;font-weight:700"> lbs</span></div>${delta != null ? `<span class="pill" style="background:var(--${delta <= 0 ? 'mint' : 'peach'})">${delta > 0 ? '+' : ''}${delta.toFixed(1)}</span>` : ''}</div>${sparkline(last)}<label class="fld" style="margin:8px 0 0"><span>Today's weight</span><input id="wIn" type="number" inputmode="decimal" step="0.1" min="0" placeholder="lbs" value="${cur != null ? cur : ''}"></label></div>`;
  // cycle
  const st = C.cycleStats(S.cycle, today), rec = [...Array(7)].map((_, i) => addDays(today, i - 6));
  const till = st.daysTill == null ? 'Log 2+ periods' : st.daysTill > 0 ? 'in ' + st.daysTill + ' day' + (st.daysTill === 1 ? '' : 's') : st.daysTill === 0 ? 'expected today' : Math.abs(st.daysTill) + ' day' + (st.daysTill === -1 ? '' : 's') + ' late';
  const cycleCard = `<div class="card" style="padding:14px"><div class="row" style="justify-content:space-between"><div><div class="mut" style="font-size:12px;font-weight:700">Next period</div><div style="font-size:20px;font-weight:800">${till}</div></div><div style="text-align:right;font-size:12px;font-weight:700" class="mut">Last cycle ${st.last != null ? st.last + ' d' : '—'}<br>Average ${st.avg != null ? st.avg + ' d' : '—'}</div></div>
<div class="cycdays">${rec.map((x) => { const s = S.cycle[x]; return `<button data-a="cycleDay" data-ds="${x}" class="${s || ''}" aria-label="${longDate(x)}: ${s === 'period' ? 'period' : s === 'choc' ? 'treat' : 'none'}">${DOW[parse(x).getDay()].slice(0, 1)}<b>${parse(x).getDate()}</b><span class="em" aria-hidden="true">${s === 'period' ? '🩸' : s === 'choc' ? '🍫' : ''}</span></button>`; }).join('')}</div><div class="mut" style="font-size:12px;font-weight:600;margin-top:8px">Tap a day to cycle: 🩸 period, 🍫 treat, none.</div></div>`;
  const hidden = S.settings.hideSensitive && !U.revealed;
  const guard = (inner) => hidden ? `<div class="reveal"><div class="blur" aria-hidden="true">${inner}</div><button class="ov" data-a="reveal">${ic('eye', 18)}Tap to show</button></div>` : inner;
  return `<div class="top"><h1 class="h1">Trackers</h1></div>
${sec('Habits', `<button data-a="toggleEditHabits" style="height:44px;min-width:64px;padding:0 16px;border-radius:22px;background:var(--card);font-weight:800;font-size:13px;margin:-8px 0;color:var(--ink)">${edit ? 'Done' : 'Edit'}</button>`, habCard, false)}
${sec('Weight', 'weekly or daily', guard(weightCard), false)}${sec('Cycle', '', guard(cycleCard), false)}`;
}
function vSettings() {
  const s = S.settings, standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const last = s.lastBackup ? Math.max(0, Math.round((Date.now() - s.lastBackup) / 864e5)) : null;
  const tg = (a, on, label) => `<button class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" data-a="${a}"></button>`;
  return `<div class="row" style="margin-left:-8px"><button class="icobtn" data-a="go" data-v="today" aria-label="Back">${ic('left', 18, 2.2)}</button><h1 class="h1" style="font-size:28px">Privacy &amp; backup</h1></div>
<div class="safe"><span class="ic">${ic('lock', 24)}</span><div><b style="font-size:16px">Stored only on this phone</b><div style="font-size:13px;font-weight:600;margin-top:2px">No account, no cloud, no tracking. Your planner never leaves this device.</div></div></div>
<div class="card sec" style="padding:0 16px"><div class="srow"><div class="tx"><b>App lock (PIN)</b><small>${s.lock ? 'Asks for your PIN when you open the app' : 'Keeps casual eyes out'}</small></div>${tg('toggleLock', !!s.lock, 'App lock')}</div>
<div class="srow"><div class="tx"><b>Hide health and weight</b><small>Blur those panels until you tap</small></div>${tg('toggleHide', s.hideSensitive, 'Hide health')}</div></div>
${sec('Backup', last == null ? 'Not backed up yet' : last === 0 ? 'Last: today' : 'Last: ' + last + ' day' + (last === 1 ? '' : 's') + ' ago', `<div class="row"><button class="btn" data-a="export">${ic('up', 18)}Export</button><button class="btn sky" data-a="import">${ic('down', 18)}Import</button></div><div class="srow" style="margin-top:6px"><div class="tx"><b>Monthly reminder</b><small>Nudge me to export a backup</small></div>${tg('toggleRemind', s.backupReminder, 'Backup reminder')}</div><div class="mut" style="font-size:12px;font-weight:600;padding:8px 0 4px">A backup is a file you keep yourself (Files, iCloud Drive, email it to yourself). You can protect it with a passphrase. It is the only way to move to a new phone or recover if this one is lost.</div><button class="btn ghost" style="width:100%;margin-top:6px" data-a="importOld">Import from my old planner</button><input type="file" id="fileIn" accept=".json,application/json" hidden>`)}
${sec('This device', '', `<div class="srow"><div class="tx"><b>Storage protected</b><small id="persistInfo">Checking…</small></div></div>${standalone ? '' : `<div class="srow"><div class="tx"><b>Install on iPhone</b><small>In Safari tap Share, then Add to Home Screen. Installed, it works offline and keeps its storage.</small></div></div>`}<div class="srow"><div class="tx"><b>Erase everything</b><small>Deletes all planner data from this phone</small></div><button class="btn danger" style="flex:none;height:40px" data-a="wipe">Erase</button></div>`)}`;
}
const VIEWS = { today: vToday, month: vMonth, tasks: vTasks, trackers: vTrackers, settings: vSettings };
function render() {
  const keep = $('#view').scrollTop;
  $('#view').innerHTML = VIEWS[U.view]();
  $('#tabs').innerHTML = [['today', 'today', 'Today'], ['month', 'cal', 'Month'], ['tasks', 'tasks', 'Tasks'], ['trackers', 'chart', 'Trackers']].map(([k, i, l]) => `<button data-a="go" data-v="${k}" class="${U.view === k ? 'on' : ''}" ${U.view === k ? 'aria-current="page"' : ''}><span class="p">${ic(i, 22, U.view === k ? 2 : 1.7)}</span>${l}</button>`).join('');
  $('#tabs').style.display = U.view === 'settings' ? 'none' : 'flex';
  const fab = $('#fab'); fab.hidden = U.view === 'trackers' || U.view === 'settings'; fab.innerHTML = ic('plus', 26, 2.2);
  $('#view').scrollTop = keep;
  if (U.view === 'settings') updatePersistInfo();
}
async function updatePersistInfo() {
  let t = 'Not confirmed. Export a backup regularly.';
  try { if (navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()) t = 'Yes. The phone will not clear it automatically.'; } catch (e) {}
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (typeof e.usage === 'number') t += ' Using ' + (e.usage > 1048576 ? (e.usage / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(e.usage / 1024)) + ' KB') + '.'; } } catch (e) {}
  const el = $('#persistInfo'); if (el) el.textContent = t;
}
const hasData = () => S.events.length + S.tasks.length + Object.keys(S.habitLog).length + Object.keys(S.weight).length + Object.keys(S.cycle).length > 0;

/* ---------- sheets ---------- */
function openSheet(html) { $('#pane').innerHTML = html; $('#sheet').classList.add('open'); const f = $('#pane').querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 50); }
function closeSheet() { $('#sheet').classList.remove('open'); $('#pane').innerHTML = ''; }
const repeatOpts = (v) => [['none', "Doesn't repeat"], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('');
function eventSheet(e) {
  const isNew = !e.id, r = e.repeat || { type: 'none', every: 1 };
  openSheet(`<h3>${isNew ? 'New event' : 'Edit event'}</h3><form data-form="event" data-id="${esc(e.id || '')}">
<label class="fld"><span>Name</span><input name="name" maxlength="80" required autofocus value="${esc(e.name || '')}"></label>
<div class="two"><label class="fld"><span>Starts</span><input type="date" name="date" required value="${e.date}"></label><label class="fld"><span>Ends (optional)</span><input type="date" name="endDate" value="${e.endDate || ''}"></label></div>
<div class="two"><label class="fld"><span>Start time</span><input type="time" name="startTime" value="${e.startTime || ''}"></label><label class="fld"><span>End time</span><input type="time" name="endTime" value="${e.endTime || ''}"></label></div>
<div class="fld"><span>Category</span><div class="cats" id="catPick">${CATS.map((c) => `<button type="button" data-a="pickCat" data-c="${c.id}" class="${(e.cat || 'personal') === c.id ? 'on' : ''}" style="background:${c.bg}">${c.label}</button>`).join('')}</div><input type="hidden" name="cat" value="${e.cat || 'personal'}"></div>
<div class="two"><label class="fld"><span>Repeat</span><select name="rtype">${repeatOpts(r.type)}</select></label><label class="fld"><span>Every</span><input type="number" name="revery" min="1" max="99" value="${r.every || 1}"></label></div>
<label class="fld"><span>Repeat until (optional)</span><input type="date" name="runtil" value="${r.until || ''}"></label>
<label class="fld"><span>Notes</span><textarea name="notes">${esc(e.notes || '')}</textarea></label>
<div class="acts">${isNew ? '' : `<button type="button" class="btn danger" data-a="delEvent" data-id="${esc(e.id)}">Delete</button>`}<button type="button" class="btn ghost" data-a="closeSheet">Cancel</button><button class="btn ink" type="submit">Save</button></div></form>`);
}
function taskSheet(t) {
  const isNew = !t.id, r = t.repeat || { type: 'none', every: 1 };
  openSheet(`<h3>${isNew ? 'New task' : 'Edit task'}</h3><form data-form="task" data-id="${esc(t.id || '')}">
<label class="fld"><span>Task</span><input name="text" maxlength="120" required autofocus value="${esc(t.text || '')}"></label>
<div class="two"><label class="fld"><span>Due (optional)</span><input type="date" name="due" value="${t.due || ''}"></label><label class="fld"><span>List</span><select name="list"><option value="">None</option>${S.lists.map((l) => `<option ${t.list === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
<div class="two"><label class="fld"><span>Repeat</span><select name="rtype">${repeatOpts(r.type)}</select></label><label class="fld"><span>Every</span><input type="number" name="revery" min="1" max="99" value="${r.every || 1}"></label></div>
<div class="acts">${isNew ? '' : `<button type="button" class="btn danger" data-a="delTask" data-id="${esc(t.id)}">Delete</button>`}<button type="button" class="btn ghost" data-a="closeSheet">Cancel</button><button class="btn ink" type="submit">Save</button></div></form>`);
}
function submitForm(f) {
  const fd = Object.fromEntries(new FormData(f)), id = f.dataset.id;
  const repeat = fd.rtype && fd.rtype !== 'none' ? { type: fd.rtype, every: Math.max(1, +fd.revery || 1), until: fd.runtil || null } : { type: 'none' };
  if (f.dataset.form === 'event') {
    if (!fd.name.trim() || !fd.date) return;
    const ev = { id: id || uid(), name: fd.name.trim(), date: fd.date, endDate: fd.endDate && fd.endDate > fd.date ? fd.endDate : null, startTime: fd.startTime || null, endTime: fd.endTime || null, cat: fd.cat, repeat, notes: (fd.notes || '').trim() };
    const i = S.events.findIndex((x) => x.id === id); if (i > -1) S.events[i] = ev; else S.events.push(ev);
  } else if (f.dataset.form === 'task') {
    if (!fd.text.trim()) return;
    const old = S.tasks.find((x) => x.id === id), t = Object.assign({ done: false, doneAt: null }, old, { id: id || uid(), text: fd.text.trim(), due: fd.due || null, list: fd.list || null, repeat: repeat.type === 'none' ? null : repeat });
    const i = S.tasks.findIndex((x) => x.id === id); if (i > -1) S.tasks[i] = t; else S.tasks.push(t);
  } else if (f.dataset.form === 'list') {
    const n = (fd.name || '').trim(); if (n && !S.lists.includes(n)) S.lists.push(n);
  }
  save(); closeSheet(); render();
}
function searchSheet() {
  openSheet(`<h3>Search</h3><label class="fld"><span>Events, tasks and notes</span><input id="q" type="search" autofocus placeholder="Type to search" autocomplete="off"></label><div class="srchres" id="qres"></div><div class="acts"><button class="btn ghost" data-a="closeSheet">Close</button></div>`);
}
function runSearch(q) {
  q = q.trim().toLowerCase(); const out = [];
  if (q) {
    S.events.filter((e) => (e.name + ' ' + (e.notes || '')).toLowerCase().includes(q)).slice(0, 30).forEach((e) => out.push(`<button data-a="gotoDate" data-ds="${e.date}"><b>${esc(e.name)}</b><small>Event &middot; ${longDate(e.date)}${e.date.slice(0, 4) !== todayStr().slice(0, 4) ? ' ' + e.date.slice(0, 4) : ''}</small></button>`));
    S.tasks.filter((t) => t.text.toLowerCase().includes(q)).slice(0, 30).forEach((t) => out.push(`<button data-a="gotoTasks"><b>${esc(t.text)}</b><small>Task${t.done ? ' &middot; done' : ''}${t.due ? ' &middot; ' + longDate(t.due) : ''}</small></button>`));
    Object.keys(S.weekNotes).filter((k) => S.weekNotes[k].toLowerCase().includes(q)).slice(0, 20).forEach((k) => out.push(`<button data-a="gotoWeek" data-ds="${k}"><b>${esc(S.weekNotes[k].slice(0, 70))}</b><small>Note &middot; week of ${longDate(k)}</small></button>`));
  }
  $('#qres').innerHTML = out.join('') || (q ? '<div class="empty">No matches.</div>' : '');
}

/* ---------- backup / import ---------- */
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(pass, salt) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
async function encrypt(text, pass) { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt), new TextEncoder().encode(text)); return { planner: 'encrypted', v: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) }; }
async function decrypt(o, pass) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, await key(pass, unb64(o.salt)), unb64(o.data)); return new TextDecoder().decode(pt); }
function exportSheet() {
  openSheet(`<h3>Export backup</h3><form data-form="export"><p class="mut" style="font-size:14px;font-weight:600;margin-top:0">Saves one file with everything. Add a passphrase to encrypt it. If you forget the passphrase, the file can't be opened.</p><label class="fld"><span>Passphrase (optional)</span><input type="password" name="pass" autocomplete="new-password" autofocus></label><div class="acts"><button type="button" class="btn ghost" data-a="closeSheet">Cancel</button><button class="btn ink" type="submit">Export</button></div></form>`);
}
async function doExport(pass) {
  const payload = JSON.stringify({ planner: 'backup', v: 1, exportedAt: new Date().toISOString(), data: S });
  const out = pass ? JSON.stringify(await encrypt(payload, pass)) : payload;
  const file = new File([out], 'planner-backup-' + todayStr() + (pass ? '-encrypted' : '') + '.json', { type: 'application/json' });
  closeSheet();
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Planner backup' }); markBackup(); return; } }
  catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); markBackup();
}
function markBackup() { S.settings.lastBackup = Date.now(); save(); toast('Backup saved.'); render(); }
let importMode = 'backup';
async function handleFile(file) {
  let text; try { text = await file.text(); } catch (e) { return toast("Couldn't read that file."); }
  let o; try { o = JSON.parse(text); } catch (e) { return toast("That file isn't a valid backup."); }
  if (o.planner === 'encrypted') {
    openSheet(`<h3>Encrypted backup</h3><form data-form="decrypt"><label class="fld"><span>Passphrase</span><input type="password" name="pass" autofocus></label><div class="acts"><button type="button" class="btn ghost" data-a="closeSheet">Cancel</button><button class="btn ink" type="submit">Open</button></div></form>`);
    pendingEnc = o; return;
  }
  applyImport(o);
}
let pendingEnc = null;
function applyImport(o) {
  if (C.isOldExport(o)) {
    const part = C.convertOld(o);
    openSheet(`<h3>Import from old planner</h3><p style="font-size:14px;font-weight:600;margin-top:0">Found ${part.events.length} events, ${part.tasks.length} tasks, ${Object.keys(part.habitLog).length} days of habits, ${Object.keys(part.weight).length} weights and ${Object.keys(part.cycle).length} cycle days. They'll be added to what's already here.</p><div class="acts"><button class="btn ghost" data-a="closeSheet">Cancel</button><button class="btn ink" data-a="confirmOld">Add them</button></div>`);
    pendingOld = part; return;
  }
  if (o && o.planner === 'backup' && o.data) {
    openSheet(`<h3>Replace everything?</h3><p style="font-size:14px;font-weight:600;margin-top:0">This replaces all planner data on this phone with the backup from ${esc((o.exportedAt || '').slice(0, 10))}. Export a backup of the current data first if you might want it.</p><div class="acts"><button class="btn ghost" data-a="closeSheet">Cancel</button><button class="btn danger" data-a="confirmRestore">Replace</button></div>`);
    pendingRestore = o.data; return;
  }
  toast("That file isn't a Planner backup.");
}
let pendingOld = null, pendingRestore = null;

/* ---------- lock ---------- */
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function pinHash(pin, saltHex) { const salt = Uint8Array.from(saltHex.match(/../g), (h) => parseInt(h, 16)); const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']); return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, k, 256)); }
function maybeLock() { if (S.settings.lock && unlocked && hiddenAt && Date.now() - hiddenAt > 60000) { unlocked = false; showPin('unlock'); } }
function showPin(mode, cb) {
  let buf = '', first = null, title = mode === 'unlock' ? 'Enter PIN' : mode === 'set' ? 'Choose a 4-digit PIN' : 'Enter current PIN';
  const el = $('#lock'); el.classList.add('open');
  const draw = (msg) => { el.innerHTML = `<div class="ser" style="font-size:26px">${title}</div><div class="pdots">${[0, 1, 2, 3].map((i) => `<i class="${i < buf.length ? 'on' : ''}"></i>`).join('')}</div><div class="mut" style="min-height:20px;font-size:13px;font-weight:700" role="alert">${msg || ''}</div><div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}" aria-label="${n}">${n}</button>`).join('')}<button class="x" data-n="cancel">${mode === 'unlock' ? 'Forgot?' : 'Cancel'}</button><button data-n="0" aria-label="0">0</button><button class="x" data-n="del" aria-label="Delete">⌫</button></div>`; };
  draw();
  el.onclick = async (ev) => {
    const b = ev.target.closest('[data-n]'); if (!b) return; const n = b.dataset.n;
    if (n === 'cancel') { if (mode === 'unlock') return forgot(); el.classList.remove('open'); el.innerHTML = ''; return cb && cb(false); }
    if (n === 'del') { buf = buf.slice(0, -1); return draw(); }
    if (buf.length >= 4) return; buf += n; draw(); if (buf.length < 4) return;
    if (mode === 'set') { if (first == null) { first = buf; buf = ''; title = 'Confirm PIN'; return draw(); } if (first !== buf) { first = null; buf = ''; title = 'Choose a 4-digit PIN'; return draw("Those didn't match. Try again."); }
      const salt = hex(crypto.getRandomValues(new Uint8Array(16))); S.settings.lock = { salt, hash: await pinHash(buf, salt) }; save(); el.classList.remove('open'); el.innerHTML = ''; toast('App lock is on.'); render(); return cb && cb(true); }
    const ok = (await pinHash(buf, S.settings.lock.salt)) === S.settings.lock.hash;
    if (ok) { el.classList.remove('open'); el.innerHTML = ''; unlocked = true; if (mode === 'check') { S.settings.lock = null; save(); toast('App lock is off.'); render(); } return cb && cb(true); }
    buf = ''; draw('Wrong PIN.');
  };
  function forgot() { el.innerHTML = `<div class="ser" style="font-size:24px;text-align:center">Forgot your PIN?</div><p class="mut" style="font-weight:600;text-align:center;max-width:300px;margin:0">There's no way to recover it. You can erase this phone's planner data and restore from a backup file.</p><button class="btn danger" style="flex:none;width:260px" id="eraseAll">Erase and start over</button><button class="btn ghost" style="flex:none;width:260px" id="backLock">Back</button>`;
    $('#eraseAll').onclick = async () => { if (confirm('Erase all planner data on this phone?')) { await wipe(); location.reload(); } }; $('#backLock').onclick = () => { showPin(mode, cb); }; }
}
async function wipe() { S = C.defaults(); try { if (db) await kvSet('state', JSON.parse(JSON.stringify(S))); } catch (e) {} }

/* ---------- actions ---------- */
const A = {
  go: (d) => { U.view = d.v; if (d.v === 'trackers') U.revealed = false; render(); $('#view').scrollTop = 0; },
  pick: (d) => { U.sel = d.ds; if (!d.stay) { render(); } else { U.mY = +d.ds.slice(0, 4); U.mM = +d.ds.slice(5, 7) - 1; render(); } },
  mprev: () => { if (U.mM === 0) { U.mM = 11; U.mY--; } else U.mM--; render(); }, mnext: () => { if (U.mM === 11) { U.mM = 0; U.mY++; } else U.mM++; render(); },
  mmode: (d) => { U.mMode = d.m; render(); },
  wprev: () => { U.sel = addDays(U.sel, -7); render(); }, wnext: () => { U.sel = addDays(U.sel, 7); render(); },
  ttab: (d) => { U.taskTab = d.k; render(); }, lfilter: (d) => { U.listFilter = d.l || null; render(); }, toggleDone: () => { U.showDone = !U.showDone; render(); },
  newList: () => openSheet(`<h3>New list</h3><form data-form="list"><label class="fld"><span>Name</span><input name="name" maxlength="24" autofocus></label><div class="acts"><button type="button" class="btn ghost" data-a="closeSheet">Cancel</button><button class="btn ink" type="submit">Add</button></div></form>`),
  fab: () => {
    if (U.view === 'tasks') return taskSheet({ due: U.taskTab === 'today' ? todayStr() : null });
    if (U.view === 'today' || U.view === 'month') return openSheet(`<h3>Add</h3><div class="acts col"><button class="btn" data-a="newEvent">New event</button><button class="btn sky" data-a="newTask">New task</button></div>`);
  },
  newEvent: () => eventSheet({ date: U.sel, startTime: null }), newTask: () => taskSheet({ due: U.sel }),
  editEvent: (d) => { const e = S.events.find((x) => x.id === d.id); if (e) eventSheet(e); },
  editTask: (d) => { const t = S.tasks.find((x) => x.id === d.id); if (t) taskSheet(t); },
  delEvent: (d) => { S.events = S.events.filter((x) => x.id !== d.id); save(); closeSheet(); render(); },
  delTask: (d) => { S.tasks = S.tasks.filter((x) => x.id !== d.id); save(); closeSheet(); render(); },
  pickCat: (d, e) => { const f = e.target.closest('form'); f.elements.cat.value = d.c; f.querySelectorAll('#catPick button').forEach((b) => b.classList.toggle('on', b.dataset.c === d.c)); },
  closeSheet: () => closeSheet(),
  toggleTask: (d) => {
    const t = S.tasks.find((x) => x.id === d.id); if (!t) return;
    if (!t.done) { t.done = true; t.doneAt = todayStr(); const nx = C.nextDue(t.due || todayStr(), t.repeat); if (nx) S.tasks.push({ id: uid(), text: t.text, due: nx, list: t.list, done: false, doneAt: null, repeat: t.repeat }); }
    else { t.done = false; t.doneAt = null; }
    save(); render();
  },
  toggleHabit: (d) => { const set = new Set(S.habitLog[d.ds] || []); set.has(d.id) ? set.delete(d.id) : set.add(d.id); if (set.size) S.habitLog[d.ds] = [...set]; else delete S.habitLog[d.ds]; save(); render(); },
  toggleEditHabits: () => { U.editHabits = !U.editHabits; render(); },
  cycleIcon: (d) => { if (!U.editHabits) return; const h = S.habits.find((x) => x.id === d.id); h.icon = (h.icon + 1) % 6; save(); render(); },
  rmHabit: (d) => { S.habits = S.habits.filter((x) => x.id !== d.id); save(); render(); },
  addHabit: () => { S.habits.push({ id: uid(), label: 'New habit', icon: S.habits.length % 6 }); save(); render(); const ins = document.querySelectorAll('[data-habit]'); const l = ins[ins.length - 1]; if (l) { l.focus(); l.select(); } },
  cycleDay: (d) => { const cur = S.cycle[d.ds]; const nx = !cur ? 'period' : cur === 'period' ? 'choc' : null; if (nx) S.cycle[d.ds] = nx; else delete S.cycle[d.ds]; save(); render(); },
  reveal: () => { U.revealed = true; render(); },
  search: () => searchSheet(),
  gotoDate: (d) => { closeSheet(); U.sel = d.ds; U.mY = +d.ds.slice(0, 4); U.mM = +d.ds.slice(5, 7) - 1; U.view = 'month'; U.mMode = 'month'; render(); },
  gotoWeek: (d) => { closeSheet(); U.sel = d.ds; U.view = 'month'; U.mMode = 'week'; render(); },
  gotoTasks: () => { closeSheet(); U.view = 'tasks'; render(); },
  toggleHide: () => { S.settings.hideSensitive = !S.settings.hideSensitive; save(); render(); },
  toggleRemind: () => { S.settings.backupReminder = !S.settings.backupReminder; save(); render(); },
  toggleLock: () => { if (S.settings.lock) showPin('check'); else showPin('set'); },
  export: () => exportSheet(),
  import: () => { importMode = 'backup'; $('#fileIn').value = ''; $('#fileIn').click(); },
  importOld: () => openSheet(`<h3>Import from old planner</h3><ol style="font-size:14px;font-weight:600;line-height:1.5;padding-left:20px;margin-top:0"><li>On the laptop, open your old planner in its browser.</li><li>Open the developer console and paste the one-line snippet from the README that downloads <b>planner-old-data.json</b>.</li><li>Send that file to this phone (AirDrop, Files, email) and choose it below.</li></ol><div class="acts"><button class="btn ghost" data-a="closeSheet">Close</button><button class="btn ink" data-a="pickOld">Choose file</button></div>`),
  pickOld: () => { closeSheet(); $('#fileIn').value = ''; $('#fileIn').click(); },
  confirmOld: () => { if (pendingOld) { C.mergeInto(S, pendingOld); pendingOld = null; save(); closeSheet(); toast('Imported.'); render(); } },
  confirmRestore: () => { if (pendingRestore) { S = C.normalize(pendingRestore); pendingRestore = null; save(); closeSheet(); toast('Backup restored.'); render(); } },
  wipe: () => openSheet(`<h3>Erase everything?</h3><p style="font-size:14px;font-weight:600;margin-top:0">This deletes all planner data from this phone. It can't be undone unless you have a backup.</p><div class="acts"><button class="btn ghost" data-a="closeSheet">Cancel</button><button class="btn danger" data-a="doWipe">Erase</button></div>`),
  doWipe: async () => { await wipe(); closeSheet(); U.view = 'today'; toast('All data erased.'); render(); },
};
document.addEventListener('click', (e) => {
  if (e.target.id === 'sheet') return closeSheet();
  const el = e.target.closest('[data-a]'); if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  const f = A[el.dataset.a]; if (f) f(el.dataset, e);
});
$('#fab').addEventListener('click', () => A.fab());
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
  const k = f.dataset.form;
  if (k === 'export') { const p = new FormData(f).get('pass'); try { await doExport(p || ''); } catch (er) { toast("Couldn't create the backup."); } return; }
  if (k === 'decrypt') { try { const txt = await decrypt(pendingEnc, new FormData(f).get('pass')); closeSheet(); applyImport(JSON.parse(txt)); } catch (er) { toast('Wrong passphrase or damaged file.'); } return; }
  submitForm(f);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.habit) { const h = S.habits.find((x) => x.id === t.dataset.habit); if (h) { h.label = t.value; save(); } }
  else if (t.id === 'wIn') { const v = parseFloat(t.value), today = todayStr(); if (!isNaN(v) && v > 0) S.weight[today] = v; else delete S.weight[today]; save(); }
  else if (t.id === 'wnote') { S.weekNotes[weekStartOf(U.sel)] = t.value; save(); }
  else if (t.id === 'q') runSearch(t.value);
});
document.addEventListener('change', (e) => { if (e.target.id === 'fileIn' && e.target.files[0]) handleFile(e.target.files[0]); if (e.target.id === 'wIn') render(); });

/* ---------- start ---------- */
(async function init() {
  try { db = await idb(); const saved = await kvGet('state'); if (saved) S = C.normalize(saved); }
  catch (e) { memOnly = true; setTimeout(() => toast("Storage isn't available here, so changes won't be kept. Export a backup."), 500); }
  requestPersist();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
  if (S.settings.lock) showPin('unlock'); else unlocked = true;
  // First run on a browser that still holds the old planner's data: offer to bring it over.
  try { if (!S.settings.oldChecked && !hasData()) { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('lp_') === 0) o[k] = localStorage.getItem(k); } S.settings.oldChecked = true; save(); if (C.isOldExport(o) && (o.lp_ev || o.lp_td2 || o.lp_habits || o.lp_weight)) setTimeout(() => { if (!S.settings.lock || unlocked) applyImport(o); }, 400); } } catch (e) {}
  window.__planner = { get state() { return S; }, U, A, C };
})();
