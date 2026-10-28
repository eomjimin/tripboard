'use client';
// Development-only preview: renders a trip from the local seed file without signing in (writes are not saved).
import { useMemo } from 'react';
import seed from '@/data/iberia-2026-seed.json';
import type { Check, Day, Item, Trip } from '@/lib/types';
import { setDemoMode } from '@/lib/store';
import TripView from './TripView';
import Toaster from './Toaster';

setDemoMode(true);

export default function Demo() {
  const { trip, days, items, checks } = useMemo(() => {
    const days: Day[] = [], items: Item[] = [], checks: Check[] = [];
    const dayId: Record<string, string> = {};
    Object.entries(seed.days as Record<string, { title: string; city: string; lodging: string; note: string; items: { id: string; cat: string; time: string; text: string }[] }>)
      .forEach(([date, d]) => {
        const id = 'day-' + date; dayId[date] = id;
        days.push({ id, date, title: d.title, place: d.city, lodging: d.lodging, note: d.note });
        d.items.forEach((it, i) => items.push({ id: it.id, dayId: id, order: i, cat: it.cat, time: it.time, text: it.text }));
      });
    Object.entries(seed.tasks as Record<string, { text: string; done: boolean; itemId: string; order: number }>)
      .forEach(([id, t]) => checks.push({ id, scope: 'item', itemId: t.itemId, dayId: null, text: t.text, done: t.done, order: t.order }));
    const trip: Trip = { id: 'demo', title: seed.trip.title, tag: seed.trip.tag, start: days[0].date, end: days[days.length - 1].date, owner: 'demo@example.com', members: ['demo@example.com'] };
    return { trip, days, items, checks };
  }, []);
  return <><div className="wrap"><TripView trip={trip} email="demo@example.com" onBack={() => {}} demo={{ days, items, checks }} /></div><Toaster /></>;
}
