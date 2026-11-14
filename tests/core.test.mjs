import * as C from '../core.js';
import assert from 'node:assert/strict';
const t = (n, f) => { try { f(); console.log('ok  ', n); } catch (e) { console.log('FAIL', n, '\n   ', e.message); process.exitCode = 1; } };
t('holidays 2026', () => { const h = C.holidaysOfYear(2026); assert.equal(h['2026-11-26'], 'Thanksgiving'); assert.equal(h['2026-01-19'], 'MLK Day'); assert.equal(h['2026-02-16'], "Presidents' Day"); assert.equal(h['2026-05-25'], 'Memorial Day'); assert.equal(h['2026-09-07'], 'Labor Day'); assert.equal(h['2026-10-12'], 'Columbus Day'); assert.equal(h['2026-04-05'], 'Easter'); assert.equal(h['2026-05-10'], "Mother's Day"); assert.equal(h['2026-06-21'], "Father's Day"); });
t('holidays 2025', () => { const h = C.holidaysOfYear(2025); assert.equal(h['2025-11-27'], 'Thanksgiving'); assert.equal(h['2025-01-20'], 'MLK Day'); assert.equal(h['2025-05-26'], 'Memorial Day'); });
t('dates', () => { assert.equal(C.addDays('2026-12-31', 1), '2027-01-01'); assert.equal(C.diffDays('2026-03-07', '2026-03-09'), 2); assert.equal(C.diffDays('2026-11-01', '2026-11-08'), 7); assert.equal(C.weekStartOf('2026-11-11'), '2026-11-08'); assert.equal(C.addMonths('2026-01-31', 1), '2026-02-28'); });
const ev = (date, repeat, extra = {}) => ({ id: 'x', name: 'e', date, repeat, ...extra });
t('recur none/multi-day', () => { assert.ok(C.occursOn(ev('2026-11-10', { type: 'none' }, { endDate: '2026-11-12' }), '2026-11-11')); assert.ok(!C.occursOn(ev('2026-11-10', { type: 'none' }), '2026-11-11')); });
t('recur weekly every 2', () => { const e = ev('2026-11-02', { type: 'weekly', every: 2 }); assert.ok(C.occursOn(e, '2026-11-16')); assert.ok(!C.occursOn(e, '2026-11-09')); assert.ok(!C.occursOn(e, '2026-10-26')); });
t('recur until', () => { const e = ev('2026-11-02', { type: 'daily', every: 1, until: '2026-11-04' }); assert.ok(C.occursOn(e, '2026-11-04')); assert.ok(!C.occursOn(e, '2026-11-05')); });
t('recur monthly clamp', () => { const e = ev('2026-01-31', { type: 'monthly', every: 1 }); assert.ok(C.occursOn(e, '2026-02-28')); assert.ok(C.occursOn(e, '2026-03-31')); assert.ok(!C.occursOn(e, '2026-02-27')); });
t('recur yearly leap', () => { const e = ev('2024-02-29', { type: 'yearly', every: 1 }); assert.ok(C.occursOn(e, '2025-02-28')); assert.ok(C.occursOn(e, '2028-02-29')); assert.ok(!C.occursOn(e, '2025-03-01')); });
t('nextDue', () => { assert.equal(C.nextDue('2026-11-11', { type: 'weekly', every: 1 }), '2026-11-18'); assert.equal(C.nextDue('2026-01-31', { type: 'monthly', every: 1 }), '2026-02-28'); assert.equal(C.nextDue('2026-11-11', null), null); });
t('cycle stats', () => { const c = { '2026-09-01': 'period', '2026-09-02': 'period', '2026-09-29': 'period', '2026-10-27': 'period', '2026-10-28': 'period', '2026-10-05': 'choc' }; const s = C.cycleStats(c, '2026-11-11'); assert.equal(s.starts.length, 3); assert.equal(s.last, 28); assert.equal(s.avg, 28); assert.equal(s.next, '2026-11-24'); assert.equal(s.daysTill, 13); });
t('old import', () => {
  const old = { lp_ev: JSON.stringify([{ id: 'a', name: 'B-day', startDate: '2026-03-05', color: '#F38FB3', recurYearly: true }, { id: 'b', name: 'Gym', startDate: '2026-11-02', startTime: '07:00', color: '#2f9e54', recurEvery: 2, recurEndsType: 'on', recurEndsOn: '2027-01-01' }]),
    lp_td2: JSON.stringify([{ id: 't1', text: 'Buy milk', done: false }, { id: 't2', text: '', done: false }, { id: 't3', text: 'Pay rent', done: true, doneDate: '2026-11-09' }]), lp_ar: JSON.stringify([{ id: 'z', text: 'Old thing', archived: '2026-10-01' }]),
    lp_habits: JSON.stringify({ '2026-11-09_0': true, '2026-11-09_3': true, '2026-11-10_1': false }), lp_weight: JSON.stringify({ '2026-11-08': 140.5 }), lp_daylog: JSON.stringify({ '2026-11-01': 'period' }), lp_week_notes: JSON.stringify({ '2026-11-08': 'hi' }), lp_budget_2026: '[]', lp_photos: '{}' };
  assert.ok(C.isOldExport(old)); const p = C.convertOld(old);
  assert.equal(p.events.length, 2); assert.equal(p.events[0].cat, 'birthday'); assert.equal(p.events[0].repeat.type, 'yearly'); assert.equal(p.events[1].repeat.type, 'weekly'); assert.equal(p.events[1].repeat.until, '2027-01-01');
  assert.equal(p.tasks.length, 3); assert.deepEqual(p.habitLog['2026-11-09'].sort(), ['h1', 'h4']); assert.equal(p.weight['2026-11-08'], 140.5); assert.equal(p.cycle['2026-11-01'], 'period'); assert.equal(p.weekNotes['2026-11-08'], 'hi'); assert.ok(p.legacy.lp_budget_2026 !== undefined);
  const s = C.mergeInto(C.defaults(), p); C.mergeInto(s, p); assert.equal(s.events.length, 2, 'merge is idempotent'); assert.equal(s.tasks.length, 3);
});
t('normalize', () => { const s = C.normalize({ events: 5, settings: { lastBackup: 1 } }); assert.ok(Array.isArray(s.events)); assert.equal(s.settings.lastBackup, 1); assert.equal(s.settings.backupReminder, true); });
