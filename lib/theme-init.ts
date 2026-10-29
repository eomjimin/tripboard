/*
 * Runs in <head> before the first paint (app/layout.tsx): a light/dark theme forced in 설정 is applied before anything shows,
 * so it never flashes the other one first. Kept apart from lib/theme.ts, which is client-only (React state).
 */
export const THEME_KEY = 'tripboard.theme';
export const THEME_INIT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();`;
