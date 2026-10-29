'use client';
import { useState } from 'react';
import { THEME_KEY as KEY } from './theme-init';

/*
 * Light / dark: follow the phone (system) or force one, per device.
 * The choice is a data-theme attribute on <html>; globals.css reads it, and THEME_INIT (lib/theme-init.ts)
 * sets it before the first paint.
 */
export type Theme = 'system' | 'light' | 'dark';
const BAR = { light: '#FFFFFF', dark: '#000000' };

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme; else root.dataset.theme = t;
  // the browser / status bar colour: Next writes one theme-color per scheme; a forced theme sets both to its own
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m => {
    const dark = (m.media || '').includes('dark');
    m.content = t === 'system' ? (dark ? BAR.dark : BAR.light) : BAR[t];
  });
}

const read = (): Theme => {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
};

/** On launch: the status bar colour for a saved forced theme (the attribute itself is already set by THEME_INIT). */
export const syncTheme = () => apply(read());

export function useTheme() {
  const [theme, set] = useState<Theme>(() => (typeof window === 'undefined' ? 'system' : read()));
  const choose = (t: Theme) => {
    try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch {}
    apply(t); set(t);
  };
  return [theme, choose] as const;
}
