import type { PlaceRef } from './types';
import { uid } from './util';

/*
 * Places on cards: found with OpenStreetMap's free search (Nominatim: one request at a time, on submit, not per keystroke),
 * typed as a plain name, or pasted as a Google Maps link. Directions always open in Google Maps.
 */
type NominatimHit = { name?: string; display_name: string; lat: string; lon: string };

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<PlaceRef[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ko,en&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(String(r.status));
  const hits = (await r.json()) as NominatimHit[];
  return hits.map(h => {
    const parts = h.display_name.split(', ');
    const name = h.name || parts[0];
    const address = parts.filter(p => p !== name).slice(0, 3).join(', ');
    return { id: uid(), name, address, lat: Number(h.lat), lng: Number(h.lon) };
  });
}

export const isLink = (s: string) => /^https?:\/\//i.test(s.trim());

/** A pasted Google Maps link: keep it, and read the place name and coordinates when the long form carries them. */
export function placeFromLink(link: string): PlaceRef {
  const url = link.trim();
  const name = decodeURIComponent(url.match(/\/place\/([^/@?]+)/)?.[1] ?? '').replace(/\+/g, ' ') || '구글맵 장소';
  const at = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ?? url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return { id: uid(), name, url, ...(at ? { lat: Number(at[1]), lng: Number(at[2]) } : {}) };
}

/** Google Maps directions from wherever the phone is to this place (transit first, switchable in the app). */
export function directionsUrl(p: PlaceRef) {
  if (p.lat == null && p.url) return p.url; // short share links can't be read here: open the place itself
  const dest = p.lat != null ? `${p.lat},${p.lng}` : p.name;
  return `https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=${encodeURIComponent(dest)}`;
}
