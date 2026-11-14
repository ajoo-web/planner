// Pure logic: dates, recurrence, holidays, cycle stats, old-planner conversion. No DOM.
export const CATS = [
  { id: 'personal', label: 'Personal', bg: 'var(--sky)', dot: '#6BB3DE' },
  { id: 'family', label: 'Family', bg: 'var(--peach)', dot: '#F2916A' },
  { id: 'friends', label: 'Friends', bg: 'var(--rose)', dot: '#E88AA0' },
  { id: 'network', label: 'Network', bg: 'var(--lav)', dot: '#9C8FE0' },
  { id: 'work', label: 'Work', bg: 'var(--mint)', dot: '#4CB57A' },
  { id: 'birthday', label: 'Birthday', bg: 'var(--butter)', dot: '#E8B923' },
  { id: 'special', label: 'Special', bg: 'var(--apricot)', dot: '#E39A3B' },
];
export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const pad = (n) => (n < 10 ? '0' + n : '' + n);
export const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const parse = (ds) => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m - 1, d); };
const utc = (ds) => { const [y, m, d] = ds.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
export const addDays = (ds, n) => { const d = parse(ds); d.setDate(d.getDate() + n); return fmt(d); };
export const weekStartOf = (ds) => addDays(ds, -parse(ds).getDay());
export const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();
export const todayStr = () => fmt(new Date());
export const addMonths = (ds, n) => { const [y, m, d] = ds.split('-').map(Number); const t = new Date(y, m - 1 + n, 1); return fmt(new Date(t.getFullYear(), t.getMonth(), Math.min(d, daysInMonth(t.getFullYear(), t.getMonth())))); };

// ---- recurrence ----
export function occursOn(ev, ds) {
  const s = ev.date, e = ev.endDate || ev.date, r = ev.repeat;
  if (!r || !r.type || r.type === 'none') return ds >= s && ds <= e;
  if (ds < s) return false;
  if (r.until && ds > r.until) return false;
  const every = Math.max(1, parseInt(r.every, 10) || 1);
  if (r.type === 'daily') return diffDays(s, ds) % every === 0;
  if (r.type === 'weekly') return diffDays(s, ds) % (7 * every) === 0;
  const [sy, sm, sd] = s.split('-').map(Number), [y, m, d] = ds.split('-').map(Number);
  if (r.type === 'monthly') {
    const months = (y - sy) * 12 + (m - sm);
    return months >= 0 && months % every === 0 && d === Math.min(sd, daysInMonth(y, m - 1));
  }
  if (r.type === 'yearly') return (y - sy) % every === 0 && m === sm && d === Math.min(sd, daysInMonth(y, m - 1));
  return false;
}
export const byTime = (a, b) => (a.startTime || '').localeCompare(b.startTime || '') || a.name.localeCompare(b.name);
export const eventsOn = (events, ds) => events.filter((e) => occursOn(e, ds)).sort(byTime);

export function nextDue(due, repeat) {
  if (!repeat || !repeat.type || repeat.type === 'none') return null;
  const every = Math.max(1, parseInt(repeat.every, 10) || 1);
  if (repeat.type === 'daily') return addDays(due, every);
  if (repeat.type === 'weekly') return addDays(due, 7 * every);
  if (repeat.type === 'monthly') return addMonths(due, every);
  if (repeat.type === 'yearly') return addMonths(due, 12 * every);
  return null;
}

// ---- holidays (computed for any year) ----
function nth(y, m0, wd, n) { const first = new Date(y, m0, 1).getDay(); return 1 + ((wd - first + 7) % 7) + (n - 1) * 7; }
function lastWd(y, m0, wd) { const last = new Date(y, m0 + 1, 0); return last.getDate() - ((last.getDay() - wd + 7) % 7); }
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}
const LNY = { 2024:[2,10],2025:[1,29],2026:[2,17],2027:[2,6],2028:[1,26],2029:[2,13],2030:[2,3],2031:[1,23],2032:[2,11],2033:[1,31],2034:[2,19],2035:[2,8],2036:[1,28],2037:[2,15],2038:[2,4],2039:[1,24],2040:[2,12],2041:[2,1],2042:[1,22],2043:[2,10],2044:[1,30],2045:[2,17],2046:[2,6],2047:[1,26],2048:[2,14],2049:[2,2],2050:[1,23] };
const hcache = {};
export function holidaysOfYear(y) {
  if (hcache[y]) return hcache[y];
  const h = {}; const set = (m, d, n) => { h[y + '-' + pad(m) + '-' + pad(d)] = n; };
  set(1, 1, "New Year's Day"); set(1, nth(y, 0, 1, 3), 'MLK Day'); set(2, nth(y, 1, 1, 3), "Presidents' Day");
  set(3, 17, "St. Patrick's Day"); set(5, nth(y, 4, 0, 2), "Mother's Day"); set(5, lastWd(y, 4, 1), 'Memorial Day');
  set(6, nth(y, 5, 0, 3), "Father's Day"); set(6, 19, 'Juneteenth'); set(7, 4, 'Independence Day');
  set(9, nth(y, 8, 1, 1), 'Labor Day'); set(10, nth(y, 9, 1, 2), 'Columbus Day'); set(10, 31, 'Halloween');
  set(11, 11, 'Veterans Day'); set(11, nth(y, 10, 4, 4), 'Thanksgiving'); set(12, 25, 'Christmas'); set(12, 31, "New Year's Eve");
  const [em, ed] = easter(y); set(em, ed, 'Easter');
  if (LNY[y]) set(LNY[y][0], LNY[y][1], 'Lunar New Year');
  return (hcache[y] = h);
}
export const holidayOn = (ds) => holidaysOfYear(+ds.slice(0, 4))[ds] || null;

// ---- cycle ----
export function periodStarts(cycle) {
  const all = Object.keys(cycle).filter((k) => cycle[k] === 'period').sort();
  const starts = [];
  all.forEach((d, i) => { if (i === 0 || diffDays(all[i - 1], d) > 1) starts.push(d); });
  return starts;
}
export function cycleStats(cycle, today) {
  const starts = periodStarts(cycle), lens = [];
  for (let i = 1; i < starts.length; i++) lens.push(diffDays(starts[i - 1], starts[i]));
  if (!lens.length) return { last: null, avg: null, daysTill: null, starts };
  const avg = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);
  const next = addDays(starts[starts.length - 1], avg);
  return { last: lens[lens.length - 1], avg, next, daysTill: diffDays(today, next), starts };
}

export function periodRuns(cycle) {
  const all = Object.keys(cycle).filter((k) => cycle[k] === 'period').sort(), runs = [];
  all.forEach((d, i) => { if (i === 0 || diffDays(all[i - 1], d) > 1) runs.push(1); else runs[runs.length - 1]++; });
  return runs;
}
export function periodLen(cycle) { const r = periodRuns(cycle); return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null; }
export function habitStreak(log, id, today) {
  let d = (log[today] || []).includes(id) ? today : addDays(today, -1), n = 0;
  while ((log[d] || []).includes(id)) { n++; d = addDays(d, -1); }
  return n;
}

// ---- state ----
export const ICON_KEYS = ['stretch', 'heart', 'dumb', 'book', 'drop', 'today'];
export const defaults = () => ({
  v: 1, events: [], tasks: [], lists: ['Home', 'Errands', 'Groceries', 'Work'],
  habits: [{ id: 'h1', label: 'Stretch', icon: 0 }, { id: 'h2', label: 'Positive', icon: 1 }, { id: 'h3', label: 'Workout', icon: 2 }, { id: 'h4', label: 'Read', icon: 3 }],
  habitLog: {}, weight: {}, cycle: {}, weekNotes: {}, legacy: null,
  settings: { lock: null, hideSensitive: false, backupReminder: true, lastBackup: null, created: Date.now() },
});
export function normalize(d) {
  const base = defaults(); if (!d || typeof d !== 'object') return base;
  const out = Object.assign(base, d);
  out.settings = Object.assign(defaults().settings, d.settings || {});
  ['events', 'tasks', 'lists', 'habits'].forEach((k) => { if (!Array.isArray(out[k])) out[k] = defaults()[k]; });
  ['habitLog', 'weight', 'cycle', 'weekNotes'].forEach((k) => { if (!out[k] || typeof out[k] !== 'object') out[k] = {}; });
  return out;
}

// ---- convert data exported from the old planner (localStorage lp_* keys) ----
const OLD_COLORS = ['#4B5DA9', '#8ADDE6', '#FFCA05', '#f37826', '#F38FB3', '#cdd629', '#2f9e54'];
export function isOldExport(o) { return !!o && typeof o === 'object' && Object.keys(o).some((k) => k.indexOf('lp_') === 0); }
export function convertOld(o) {
  const get = (k, def) => { try { const v = o[k]; if (v == null) return def; return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return def; } };
  const out = { events: [], tasks: [], habitLog: {}, weight: {}, cycle: {}, weekNotes: {}, legacy: {} };
  get('lp_ev', []).forEach((e) => {
    if (!e || !e.name || !e.startDate) return;
    const ci = Math.max(0, OLD_COLORS.findIndex((c) => String(c).toLowerCase() === String(e.color).toLowerCase()));
    let repeat = { type: 'none' };
    if (e.recurYearly) repeat = { type: 'yearly', every: 1 };
    else if (e.recurEvery) repeat = { type: 'weekly', every: e.recurEvery, until: e.recurEndsType === 'on' ? e.recurEndsOn || null : null };
    out.events.push({ id: 'old_' + e.id, name: e.name, date: e.startDate, endDate: e.endDate && e.endDate !== e.startDate ? e.endDate : null, startTime: e.startTime || null, endTime: e.endTime || null, cat: e.recurYearly ? 'birthday' : CATS[ci].id, repeat, notes: '' });
  });
  get('lp_wev', []).forEach((e) => { if (e && e.name && e.date) out.events.push({ id: 'old_' + e.id, name: e.name, date: e.date, endDate: null, startTime: e.time || null, endTime: null, cat: 'personal', repeat: { type: 'none' }, notes: '' }); });
  get('lp_td2', []).forEach((t) => { if (t && t.text && t.text.trim()) out.tasks.push({ id: 'old_' + t.id, text: t.text.trim(), due: null, list: null, done: !!t.done, doneAt: t.doneDate || null, repeat: null }); });
  get('lp_ar', []).forEach((t) => { if (t && t.text) out.tasks.push({ id: 'old_' + t.id, text: t.text, due: null, list: null, done: true, doneAt: t.archived || null, repeat: null }); });
  const hl = get('lp_habits', {}); Object.keys(hl).forEach((k) => { if (!hl[k]) return; const i = k.lastIndexOf('_'); const ds = k.slice(0, i), idx = +k.slice(i + 1); if (idx >= 0 && idx < 4 && /^\d{4}-\d{2}-\d{2}$/.test(ds)) (out.habitLog[ds] = out.habitLog[ds] || []).push('h' + (idx + 1)); });
  const w = get('lp_weight', {}); Object.keys(w).forEach((k) => { if (typeof w[k] === 'number') out.weight[k] = w[k]; });
  const dl = get('lp_daylog', {}); Object.keys(dl).forEach((k) => { if (dl[k] === 'period' || dl[k] === 'choc') out.cycle[k] = dl[k]; });
  const wn = get('lp_week_notes', {}); Object.keys(wn).forEach((k) => { if (wn[k]) out.weekNotes[k] = wn[k]; });
  Object.keys(o).forEach((k) => { if (/^lp_budget_|^lp_photos$|^lp_weather$/.test(k)) out.legacy[k] = o[k]; });
  return out;
}
export function mergeInto(state, part) {
  const ids = new Set(state.events.map((e) => e.id)); part.events.forEach((e) => { if (!ids.has(e.id)) state.events.push(e); });
  const tids = new Set(state.tasks.map((t) => t.id)); part.tasks.forEach((t) => { if (!tids.has(t.id)) state.tasks.push(t); });
  Object.keys(part.habitLog).forEach((ds) => { const set = new Set(state.habitLog[ds] || []); part.habitLog[ds].forEach((x) => set.add(x)); state.habitLog[ds] = [...set]; });
  Object.assign(state.weight, part.weight); Object.assign(state.cycle, part.cycle);
  Object.keys(part.weekNotes).forEach((k) => { if (!state.weekNotes[k]) state.weekNotes[k] = part.weekNotes[k]; });
  if (Object.keys(part.legacy).length) state.legacy = Object.assign(state.legacy || {}, part.legacy);
  return state;
}
