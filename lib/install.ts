'use client';
import { useEffect, useState } from 'react';

/*
 * Installing the app (PWA) and leaving in-app browsers that cannot install it.
 * Chrome on Android fires `beforeinstallprompt` once, early, so it is caught at module load and kept for the button.
 * iPhone has no install prompt; the button shows the Safari steps instead.
 */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: InstallPrompt | null = null, installed = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach(f => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPrompt; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; notify(); });
}

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isIOSSafari = () => isIOS() && !/crios|fxios|edgios|kakaotalk|naver|line\//i.test(navigator.userAgent);
export const isAndroid = () => /android/i.test(navigator.userAgent);
export const isMobile = () => isIOS() || isAndroid();
export const inKakao = () => /kakaotalk/i.test(navigator.userAgent);

/** KakaoTalk's own schemes: open this page in the phone's default browser, then close the in-app browser. */
export const openOutsideKakao = () => {
  location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
  setTimeout(() => { location.href = isIOS() ? 'kakaoweb://closeBrowser' : 'kakaotalk://inappbrowser/close'; }, 400);
};

/** What the install button can do here: show Chrome's prompt, show the iPhone / Android menu steps, or nothing (installed, or a computer without a prompt). */
export function useInstall() {
  const [, rerender] = useState(0);
  useEffect(() => { const f = () => rerender(n => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  if (typeof window === 'undefined' || isStandalone()) return null;
  if (installed) return { kind: 'installed' as const };
  if (deferred) {
    const d = deferred;
    return { kind: 'prompt' as const, run: async () => { await d.prompt(); const { outcome } = await d.userChoice; if (outcome === 'accepted') deferred = null; notify(); } };
  }
  if (isIOS()) return { kind: 'ios' as const, safari: isIOSSafari() };
  if (isAndroid()) return { kind: 'android' as const };
  return null;
}
