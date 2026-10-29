import type { Attachment } from './types';

/*
 * Card files live inside Firestore documents (max 1 MiB each) so they open offline at the airport.
 * Photos are shrunk to fit; PDFs are kept as they are when small enough.
 */
const MAX_CHARS = 720_000; // data URL length, leaving room for the other fields

const readDataURL = (blob: Blob) => new Promise<string>((ok, no) => {
  const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(blob);
});

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try { return await createImageBitmap(file); } catch { /* older Safari: fall back to <img> */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

/** Reads a picked file into an attachment, or returns a message saying why it can't be added. */
export async function readAttachment(file: File): Promise<Pick<Attachment, 'name' | 'kind' | 'data' | 'size'> | string> {
  const name = file.name.replace(/\.[^.]+$/, '') || '첨부';
  if (file.type === 'application/pdf') {
    const data = await readDataURL(file);
    return data.length > MAX_CHARS ? 'PDF가 너무 커서 올릴 수 없어요 (약 500KB까지). 화면을 캡처해 사진으로 올려 주세요.' : { name, kind: 'pdf', data, size: file.size };
  }
  if (!file.type.startsWith('image/')) return '사진이나 PDF만 올릴 수 있어요.';
  let img;
  try { img = await loadImage(file); } catch { return `‘${file.name}’을(를) 열 수 없어요.`; }
  // keep it sharp enough for a QR code to scan, then step down until it fits
  for (const edge of [2000, 1600, 1280, 1024]) {
    const k = Math.min(1, edge / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); // transparent screenshots stay readable as JPEG
    g.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.72, 0.6]) {
      const data = c.toDataURL('image/jpeg', q);
      if (data.length <= MAX_CHARS) return { name, kind: 'image', data, size: Math.round(data.length * 0.75) };
    }
  }
  return '사진이 너무 커서 올릴 수 없어요.';
}

/** Opens a stored PDF in the browser's viewer. */
export function openPdf(f: Attachment) {
  const bin = atob(f.data.slice(f.data.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
