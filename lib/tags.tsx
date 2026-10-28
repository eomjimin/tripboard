'use client';
import { createContext, useContext, useMemo } from 'react';
import type { Cat, Trip } from './types';

/** Colours a tag can take (each is a CSS variable with light and dark values). */
export const PALETTE: [string, string][] = [['red', '빨강'], ['orange', '주황'], ['amber', '황토'], ['green', '초록'], ['teal', '청록'],
  ['blue', '파랑'], ['purple', '보라'], ['pink', '분홍'], ['brown', '갈색'], ['slate', '회색']];
export const tone = (color?: string) => `var(--pc-${color || 'slate'})`;

/* place tags (BCN …) */
const PLACE_DEFAULTS: Record<string, { code: string; color: string }> = {
  '바르셀로나': { code: 'BCN', color: 'red' }, '포르투': { code: 'OPO', color: 'blue' },
  '세비야': { code: 'SVQ', color: 'amber' }, '지로나': { code: 'GRO', color: 'green' },
  '리스본': { code: 'LIS', color: 'teal' }, '마드리드': { code: 'MAD', color: 'orange' },
};
export const KNOWN_PLACES = Object.keys(PLACE_DEFAULTS);
/** This trip's place tags: the saved ones plus any name a day already uses, in order of first use. */
export const placeOptions = (trip: Trip, days: { place: string; lodging: string }[]) =>
  [...new Set([...days.flatMap(d => [d.place, d.lodging]), ...Object.keys(trip.places ?? {})].filter(Boolean))];
/** A new place gets its known default, else the first colour no other place uses yet. */
export function newPlaceTag(name: string, taken: string[]) {
  if (PLACE_DEFAULTS[name]) return PLACE_DEFAULTS[name];
  const color = PALETTE.map(([k]) => k).find(k => !taken.includes(k)) ?? PALETTE[taken.length % PALETTE.length][0];
  return { code: name.slice(0, 3).toUpperCase(), color };
}
export const defaultPlace = (name: string) => PLACE_DEFAULTS[name] ?? { code: name.slice(0, 3).toUpperCase(), color: 'slate' };

/* card kinds (관광, 식당 …). 플랜B marks a backup for closures, weather or sold-out tickets. 'etc' always exists. */
export const DEFAULT_CATS: Cat[] = [
  { key: 'sight', name: '관광', color: 'blue' }, { key: 'food', name: '식당', color: 'orange' }, { key: 'cafe', name: '카페', color: 'brown' },
  { key: 'move', name: '이동', color: 'teal' }, { key: 'stay', name: '숙박', color: 'purple' }, { key: 'shop', name: '쇼핑', color: 'pink' },
  { key: 'show', name: '체험·공연', color: 'green' }, { key: 'rest', name: '휴식·자유', color: 'slate' }, { key: 'planb', name: '플랜B', color: 'amber' },
  { key: 'etc', name: '기타', color: 'slate' },
];

type Tags = {
  place: (name: string) => { code: string; color: string };
  code: (name?: string) => string;
  color: (name?: string) => string;
  cats: Cat[];
  /** a card's kind; unknown or deleted kinds show as 기타 */
  cat: (key?: string) => Cat;
};
const Ctx = createContext<Tags | null>(null);

/** Tag text and colours for this trip: trips/{id}.places and trips/{id}.cats, falling back to the defaults above. */
export function TagsProvider({ trip, children }: { trip: Trip; children: React.ReactNode }) {
  const value = useMemo<Tags>(() => {
    const place = (name: string) => ({ ...defaultPlace(name), ...(trip.places?.[name] ?? {}) });
    const cats = trip.cats?.length ? trip.cats : DEFAULT_CATS;
    const etc = cats.find(c => c.key === 'etc') ?? DEFAULT_CATS[DEFAULT_CATS.length - 1];
    return {
      place, cats,
      code: name => (name ? place(name).code : ''),
      color: name => tone(name ? place(name).color : 'slate'),
      cat: key => cats.find(c => c.key === key) ?? etc,
    };
  }, [trip.places, trip.cats]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTags = () => useContext(Ctx)!;
