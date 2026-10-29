export type Trip = {
  id: string; title: string; tag: string; start: string; end: string;
  owner: string; members: string[]; createdAt?: number;
  /** tag text and colour per place name, e.g. { '포르투': { code: 'OPO', color: 'blue' } } */
  places?: Record<string, { code: string; color: string }>;
  /** card kinds for this trip, in display order (defaults in lib/tags.tsx) */
  cats?: Cat[];
};
export type Cat = { key: string; name: string; color: string };
export type Day = { id: string; date: string; title: string; place: string; lodging: string; note: string };
export type Item = { id: string; dayId: string; order: number; cat: string; time: string; text: string; places?: PlaceRef[] };
/** A place on a card (airport, station …): picked from search (with coordinates), typed as a name, or a pasted Google Maps link. */
export type PlaceRef = { id: string; name: string; address?: string; lat?: number; lng?: number; url?: string };
/** A file on a card (boarding pass, ticket QR …), kept inline as a data URL so it opens offline from the local cache. */
export type Attachment = { id: string; itemId: string; name: string; kind: 'image' | 'pdf'; data: string; size: number; order: number };
/** scope says what the row hangs off; only the matching id is set, the other is null. */
export type Scope = 'item' | 'day' | 'none';
export type Check = { id: string; scope: Scope; itemId: string | null; dayId: string | null; text: string; done: boolean; order: number };
