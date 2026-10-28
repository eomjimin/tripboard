type Listener = (msg: string) => void;
const listeners = new Set<Listener>();
export const toast = (msg: string) => listeners.forEach(l => l(msg));
export const onToast = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
