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

/*
 * Search as you type: Photon (komoot's OpenStreetMap search, built for autocomplete; Nominatim forbids it).
 * Photon doesn't know Korean names, so Hangul queries stay on Nominatim, on submit.
 * Ranked toward the trip's other places, without parking lots, benches and bus stops.
 */
type PhotonFeature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };
const SKIP = ['amenity:parking', 'amenity:parking_entrance', 'amenity:bench', 'amenity:waste_basket', 'emergency', 'highway', 'public_transport:stop_position', 'public_transport:platform', 'building:apartments'];

export const hasHangul = (s: string) => /[ㄱ-힝]/.test(s);

export async function suggestPlaces(q: string, near?: { lat: number; lng: number }, signal?: AbortSignal): Promise<PlaceRef[]> {
  const p = new URLSearchParams({ q, limit: '8' });
  if (near) { p.set('lat', String(near.lat)); p.set('lon', String(near.lng)); p.set('location_bias_scale', '0.3'); }
  SKIP.forEach(t => p.append('osm_tag', '!' + t));
  const r = await fetch(`https://photon.komoot.io/api/?${p}`, { signal });
  if (!r.ok) throw new Error(String(r.status));
  const { features } = (await r.json()) as { features: PhotonFeature[] };
  const seen = new Set<string>();
  return features.flatMap(f => {
    const o = f.properties, name = o.name || [o.street, o.housenumber].filter(Boolean).join(' ');
    const address = [o.name ? o.street : undefined, o.city || o.county, o.country].filter(Boolean).join(', ');
    const key = `${name}|${o.city}`;
    if (!name || seen.has(key)) return [];
    seen.add(key);
    const [lng, lat] = f.geometry.coordinates;
    return [{ id: uid(), name, address, lat, lng }];
  });
}

export const isLink =(s: string) => /^https?:\/\//i.test(s.trim());

/** A pasted Google Maps link: keep it, and read the place name and coordinates when the long form carries them. */
export function placeFromLink(link: string): PlaceRef {
  const url = link.trim();
  const name = decodeURIComponent(url.match(/\/place\/([^/@?]+)/)?.[1] ?? '').replace(/\+/g, ' ') || '구글맵 장소';
  const at = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ?? url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return { id: uid(), name, url, ...(at ? { lat: Number(at[1]), lng: Number(at[2]) } : {}) };
}

/**
 * The place's own page in Google Maps (name, photos, hours, and its 경로 button), so it works from anywhere, even before the trip.
 * Searched by name and address, not coordinates: coordinates show up as a dropped pin. Pasted links open as they are.
 */
export function mapsUrl(p: PlaceRef) {
  if (p.url) return p.url;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address].filter(Boolean).join(', '))}`;
}
