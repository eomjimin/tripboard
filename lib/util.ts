export const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const dt = (id: string) => { const [y, m, d] = id.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const md = (id: string) => { const d = dt(id); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
export const wdi = (id: string) => dt(id).getUTCDay();
export const addDays = (id: string, n: number) => { const d = dt(id); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diff = (a: string, b: string) => Math.round((dt(b).getTime() - dt(a).getTime()) / 864e5);
export const todayId = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
export const uid = () => crypto.randomUUID();
export const isWeekend = (id: string) => { const w = wdi(id); return w === 0 || w === 6; };

/** Order value for a card dropped between two neighbours (fractional, so only the moved card is written). */
export const between = (prev?: number, next?: number) =>
  prev != null && next != null ? (prev + next) / 2 : prev != null ? prev + 1 : next != null ? next - 1 : 0;

export const vibrate = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* not supported (iOS) */ } };
