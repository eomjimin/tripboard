import { deleteField, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { toast } from './toast';
import { addDays, uid } from './util';
import type { Check, Day, Item, Scope, Trip } from './types';

/*
 * Firestore layout (every id is a UUID):
 *   trips/{tripId}                 title, tag, start, end, owner, members[]
 *   trips/{tripId}/days/{id}       date, title, place, lodging, note
 *   trips/{tripId}/items/{id}      dayId → days, order, cat, time, text
 *   trips/{tripId}/checklist/{id}  scope, itemId → items | null, dayId → days | null, text, done, order
 * Writes are not awaited: offline they resolve only after sync, while the local cache updates the screen at once.
 */
// The development-only demo (?demo) has no trip on the server, so its writes are refused; say so plainly instead.
let demoMode = false, demoToldAt = 0;
export const setDemoMode = (on: boolean) => { demoMode = on; };
const fail = (e: unknown) => {
  if (demoMode) {
    if (Date.now() - demoToldAt > 4000) { demoToldAt = Date.now(); toast('데모 화면이라 바꾼 내용은 저장되지 않습니다.'); }
    return;
  }
  const code = (e as { code?: string })?.code;
  toast(code === 'permission-denied' ? '이 계정에는 편집 권한이 없어 저장하지 못했습니다.' : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
};
const T = (tripId: string, col: string, id: string) => doc(db, 'trips', tripId, col, id);
const link = (scope: Scope, itemId?: string | null, dayId?: string | null) =>
  ({ scope, itemId: scope === 'item' ? itemId ?? null : null, dayId: scope === 'day' ? dayId ?? null : null });

/* trips */
export const updateTrip = (tripId: string, patch: Partial<Omit<Trip, 'id'>>) => { setDoc(doc(db, 'trips', tripId), patch, { merge: true }).catch(fail); };
// The trip list shows dates without loading every day, so keep start/end on the trip in step with its days.
export function syncRange(trip: Trip, dates: string[]) {
  if (!dates.length) return;
  const s = [...dates].sort(), start = s[0], end = s[s.length - 1];
  if (trip.start !== start || trip.end !== end) updateTrip(trip.id, { start, end });
}
export function createTrip(email: string, f: { title: string; tag: string; start: string; end: string }) {
  const id = uid();
  setDoc(doc(db, 'trips', id), { ...f, owner: email, members: [email], createdAt: Date.now() }).catch(fail);
  // second commit: the rules check membership on the trip doc, and queued commits are sent in order
  const b = writeBatch(db);
  for (let d = f.start; d <= f.end; d = addDays(d, 1)) b.set(T(id, 'days', uid()), { date: d, title: '', place: '', lodging: '', note: '' });
  b.commit().catch(fail);
  return id;
}
export function deleteTrip(tripId: string, data: { days: Day[]; items: Item[]; checks: Check[] }) {
  const b = writeBatch(db);
  data.days.forEach(d => b.delete(T(tripId, 'days', d.id)));
  data.items.forEach(i => b.delete(T(tripId, 'items', i.id)));
  data.checks.forEach(c => b.delete(T(tripId, 'checklist', c.id)));
  b.commit().then(() => import('firebase/firestore').then(m => m.deleteDoc(doc(db, 'trips', tripId)))).catch(fail);
}

/* place tags: trips/{id}.places maps a place name to its tag; days refer to places by name (place, lodging) */
export type PlaceTag = { code: string; color: string };
export const savePlace = (tripId: string, name: string, tag: PlaceTag) => updateTrip(tripId, { places: { [name]: tag } });
/** Renames a place tag and every day that uses it. */
export function renamePlace(tripId: string, days: Day[], from: string, to: string, tag: PlaceTag) {
  const b = writeBatch(db);
  days.forEach(d => {
    const p: Partial<Day> = {};
    if (d.place === from) p.place = to;
    if (d.lodging === from) p.lodging = to;
    if (Object.keys(p).length) b.update(T(tripId, 'days', d.id), p);
  });
  b.set(doc(db, 'trips', tripId), { places: { [from]: deleteField(), [to]: tag } }, { merge: true });
  b.commit().catch(fail);
}
/** Deletes a place tag; days that used it are left without a place / lodging. */
export function deletePlace(tripId: string, days: Day[], name: string) {
  const b = writeBatch(db);
  days.forEach(d => {
    const p: Partial<Day> = {};
    if (d.place === name) p.place = '';
    if (d.lodging === name) p.lodging = '';
    if (Object.keys(p).length) b.update(T(tripId, 'days', d.id), p);
  });
  b.set(doc(db, 'trips', tripId), { places: { [name]: deleteField() } }, { merge: true });
  b.commit().catch(fail);
}

/* days */
export const updateDay = (tripId: string, id: string, patch: Partial<Omit<Day, 'id'>>) => { updateDoc(T(tripId, 'days', id), patch).catch(fail); };
export function addDay(tripId: string, date: string) {
  const id = uid();
  setDoc(T(tripId, 'days', id), { date, title: '', place: '', lodging: '', note: '' }).catch(fail);
  return id;
}
/** Moves a day to another date; if that date is taken the two days trade dates (cards and checklists follow their day). */
export function setDayDate(tripId: string, day: Day, date: string, days: Day[]) {
  const other = days.find(d => d.date === date && d.id !== day.id);
  const b = writeBatch(db);
  b.update(T(tripId, 'days', day.id), { date });
  if (other) b.update(T(tripId, 'days', other.id), { date: day.date });
  b.commit().catch(fail);
  return other ?? null;
}
export function deleteDay(tripId: string, day: Day, items: Item[], checks: Check[]) {
  const b = writeBatch(db);
  const gone = new Set(items.filter(i => i.dayId === day.id).map(i => i.id));
  gone.forEach(id => b.delete(T(tripId, 'items', id)));
  checks.filter(c => (c.scope === 'item' && c.itemId && gone.has(c.itemId)) || (c.scope === 'day' && c.dayId === day.id))
    .forEach(c => b.update(T(tripId, 'checklist', c.id), link('none'))); // keep the checklist, unlinked
  b.delete(T(tripId, 'days', day.id));
  b.commit().catch(fail);
}

/* items (cards) */
export function addItem(tripId: string, dayId: string, f: { cat: string; time: string; text: string }, order: number) {
  const id = uid();
  setDoc(T(tripId, 'items', id), { dayId, order, ...f }).catch(fail);
  return id;
}
export const updateItem = (tripId: string, id: string, patch: Partial<Omit<Item, 'id'>>) => { updateDoc(T(tripId, 'items', id), patch).catch(fail); };
export const moveItem = (tripId: string, id: string, dayId: string, order: number) => updateItem(tripId, id, { dayId, order });
/** Deleting a card keeps its checklist on the card's day. */
export function deleteItem(tripId: string, item: Item, checks: Check[]) {
  const b = writeBatch(db);
  checks.filter(c => c.scope === 'item' && c.itemId === item.id).forEach(c => b.update(T(tripId, 'checklist', c.id), link('day', null, item.dayId)));
  b.delete(T(tripId, 'items', item.id));
  b.commit().catch(fail);
}

/* checklist */
export function addCheck(tripId: string, text: string, scope: Scope, itemId?: string | null, dayId?: string | null) {
  setDoc(T(tripId, 'checklist', uid()), { ...link(scope, itemId, dayId), text, done: false, order: Date.now() }).catch(fail);
}
export const updateCheck = (tripId: string, id: string, patch: Partial<Pick<Check, 'text' | 'done'>>) => { updateDoc(T(tripId, 'checklist', id), patch).catch(fail); };
export const relinkCheck = (tripId: string, id: string, scope: Scope, itemId?: string | null, dayId?: string | null) => { updateDoc(T(tripId, 'checklist', id), link(scope, itemId, dayId)).catch(fail); };
export const deleteCheck = (tripId: string, id: string) => { import('firebase/firestore').then(m => m.deleteDoc(T(tripId, 'checklist', id))).catch(fail); };
