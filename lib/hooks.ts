import { useEffect, useMemo, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { toast } from './toast';
import type { Check, Day, Item, Trip } from './types';

export function useAuthUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    getRedirectResult(auth).catch(() => toast('로그인하지 못했습니다. 다시 시도해 주세요.'));
    return onAuthStateChanged(auth, setUser);
  }, []);
  return user;
}

/** Trips this account was invited to (the rules only allow this exact query). */
export function useTrips(email: string | null) {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  useEffect(() => {
    if (!email) { setTrips(null); return; }
    return onSnapshot(query(collection(db, 'trips'), where('members', 'array-contains', email)),
      s => setTrips(s.docs.map(d => ({ id: d.id, ...d.data() }) as Trip)),
      () => { toast('여행 목록을 불러오지 못했습니다.'); setTrips([]); });
  }, [email]);
  return trips;
}

function useCol<T>(tripId: string | null, name: string) {
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    setRows(null);
    if (!tripId) return;
    return onSnapshot(collection(db, 'trips', tripId, name),
      s => setRows(s.docs.map(d => ({ id: d.id, ...d.data() }) as T)),
      () => { toast('일정을 불러오지 못했습니다.'); setRows([]); });
  }, [tripId, name]);
  return rows;
}

export type TripData = ReturnType<typeof useTripData>;
export function useTripData(tripId: string | null) {
  const rawDays = useCol<Day>(tripId, 'days');
  const rawItems = useCol<Item>(tripId, 'items');
  const rawChecks = useCol<Check>(tripId, 'checklist');
  return useMemo(() => ({
    ...buildTripData(rawDays ?? [], rawItems ?? [], rawChecks ?? []),
    loaded: rawDays !== null && rawItems !== null && rawChecks !== null,
  }), [rawDays, rawItems, rawChecks]);
}

/** Joins the three collections into what the screens use: days by date, cards per day, checklist lookups. */
export function buildTripData(rawDays: Day[], items: Item[], checks: Check[]) {
  const days = [...rawDays].sort((a, b) => a.date.localeCompare(b.date));
  const dayById = new Map(days.map(d => [d.id, d]));
  const itemById = new Map(items.map(i => [i.id, i]));
  const itemsByDay = new Map<string, Item[]>(days.map(d => [d.id, []]));
  items.forEach(i => itemsByDay.get(i.dayId)?.push(i));
  itemsByDay.forEach(list => list.sort((a, b) => a.order - b.order));
  const byOrder = (a: Check, b: Check) => a.order - b.order;
  const checksOfItem = (id: string) => checks.filter(c => c.scope === 'item' && c.itemId === id).sort(byOrder);
  const checksOfDay = (id: string) => checks.filter(c => c.scope === 'day' && c.dayId === id).sort(byOrder);
  /** The day a checklist row belongs to: through its card, or directly. */
  const dayOfCheck = (c: Check) => c.scope === 'item' ? (c.itemId ? itemById.get(c.itemId)?.dayId : undefined) : c.scope === 'day' ? c.dayId ?? undefined : undefined;
  const allChecksOfDay = (id: string) => checks.filter(c => dayOfCheck(c) === id);
  return { loaded: true, days, items, checks, dayById, itemById, itemsByDay, checksOfItem, checksOfDay, dayOfCheck, allChecksOfDay };
}

/** Consecutive nights in the same lodging city, for the stays table and "숙박 2/4박". */
export function stayGroups(days: Day[]) {
  const gs: { city: string; start: string; end: string; ids: string[] }[] = [];
  let cur: (typeof gs)[number] | null = null;
  for (const d of days) {
    const L = (d.lodging || '').trim();
    const next = cur && cur.city === L && Math.round((Date.parse(d.date) - Date.parse(cur.end)) / 864e5) === 1;
    if (L && cur && next) { cur.end = d.date; cur.ids.push(d.id); }
    else if (L) { cur = { city: L, start: d.date, end: d.date, ids: [d.id] }; gs.push(cur); }
    else cur = null;
  }
  return gs;
}

export function useMedia(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = matchMedia(q); setM(mq.matches);
    const on = () => setM(mq.matches); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
