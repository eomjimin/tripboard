'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { TripData } from '@/lib/hooks';
import { openPdf, readAttachment } from '@/lib/attach';
import { hasHangul, isLink, mapsUrl, placeFromLink, searchPlaces, suggestPlaces } from '@/lib/places';
import { addAttachment, deleteAttachment, updateItem } from '@/lib/store';
import { toast } from '@/lib/toast';
import { uid } from '@/lib/util';
import type { Attachment, Item, PlaceRef, Trip } from '@/lib/types';
import { ConfirmButton, Icon } from './ui';

/**
 * What hangs off a card, like attachments on a mail: photos and PDFs (boarding passes, ticket QRs) as small thumbnails,
 * places as rows that open Google Maps; a small + adds, and each part's own 편집 shows the remove buttons.
 */
export function CardAttach({ trip, data, item }: { trip: Trip; data: TripData; item: Item }) {
  const files = data.filesOfItem(item.id);
  const images = files.filter(f => f.kind === 'image');
  const places = item.places ?? [];
  const [view, setView] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editFiles, setEditFiles] = useState(false), [editPlaces, setEditPlaces] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Rank search results near where this trip already is: this card's places first, then any card's.
  const anchor = [...places, ...data.items.flatMap(i => i.places ?? [])].find(x => x.lat != null && x.lng != null);
  const near = useMemo(() => (anchor ? { lat: anchor.lat!, lng: anchor.lng! } : undefined), [anchor?.lat, anchor?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const savePlaces = (next: PlaceRef[]) => updateItem(trip.id, item.id, { places: next });
  const add = async (list: File[]) => {
    setBusy(list.length);
    let order = (files[files.length - 1]?.order ?? -1) + 1;
    for (const f of list) {
      const r = await readAttachment(f);
      if (typeof r === 'string') toast(r); else addAttachment(trip.id, { ...r, itemId: item.id, order: order++ });
      setBusy(n => n - 1);
    }
  };
  return (
    <div className="attach">
      <section className="att-sec">
        <div className="att-h">
          <Icon name="clip" size="md" /><b>파일</b>{files.length > 0 && <span className="n">{files.length}</span>}
          <motion.button type="button" className="att-add" whileTap={{ scale: .85 }} onClick={() => input.current?.click()} disabled={busy > 0} aria-label="파일 추가">
            <Icon name={busy ? 'clip' : 'plus'} size="sm" />
          </motion.button>
          {busy > 0 && <small className="n">올리는 중…</small>}
          {files.length > 0 && <button type="button" className={`att-edit ${editFiles ? 'on' : ''}`} onClick={() => setEditFiles(e => !e)} aria-label={editFiles ? '파일 편집 끝내기' : '파일 편집'} aria-pressed={editFiles}><Icon name={editFiles ? 'check' : 'edit'} size="md" /></button>}
        </div>
        {files.length > 0 && (
          <div className="thumbs">
            {files.map(f => (
              <div key={f.id} className="thumb-w">
                <motion.button className="thumb" whileTap={{ scale: .94 }} onClick={() => (f.kind === 'pdf' ? openPdf(f) : setView(f.id))} aria-label={`${f.name} 열기`}>
                  {f.kind === 'image' ? <img src={f.data} alt="" /> : <span className="thumb-pdf"><Icon name="file" size="lg" />PDF</span>}
                </motion.button>
                {editFiles && <button type="button" className="thumb-x" onClick={() => { deleteAttachment(trip.id, f.id); toast('파일을 삭제했습니다.'); }} aria-label={`${f.name} 삭제`}><Icon name="x" size="xs" /></button>}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="att-sec">
        <div className="att-h">
          <Icon name="pin" size="md" /><b>장소</b>{places.length > 0 && <span className="n">{places.length}</span>}
          <motion.button type="button" className="att-add" whileTap={{ scale: .85 }} onClick={() => setAdding(a => !a)} aria-label="장소 추가" aria-expanded={adding}>
            <Icon name="plus" size="sm" />
          </motion.button>
          {places.length > 0 && <button type="button" className={`att-edit ${editPlaces ? 'on' : ''}`} onClick={() => setEditPlaces(e => !e)} aria-label={editPlaces ? '장소 편집 끝내기' : '장소 편집'} aria-pressed={editPlaces}><Icon name={editPlaces ? 'check' : 'edit'} size="md" /></button>}
        </div>
        {places.map(p => (
          <div key={p.id} className="pl">
            {editPlaces ? ( // while removing places, a row is just its name: no map button, no link to tap by mistake
              <div className="pl-link">
                <Icon name="pin" size="md" />
                <span className="pl-t"><b>{p.name}</b>{p.address && <small>{p.address}</small>}</span>
              </div>
            ) : (
              <a className="pl-link" href={mapsUrl(p)} target="_blank" rel="noopener noreferrer">
                <Icon name="pin" size="md" />
                <span className="pl-t"><b>{p.name}</b>{p.address && <small>{p.address}</small>}</span>
                <span className="navbtn sm"><Icon name="nav" size="sm" />지도</span>
              </a>
            )}
            {editPlaces && <button type="button" className="iconbtn sm danger" onClick={() => savePlaces(places.filter(x => x.id !== p.id))} aria-label={`${p.name} 빼기`}><Icon name="trash" size="lg" /></button>}
          </div>
        ))}
        {adding && <PlaceSearch near={near} onPick={p => { savePlaces([...places, p]); setAdding(false); }} onCancel={() => setAdding(false)} />}
      </section>
      <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden
        onChange={e => { const l = Array.from(e.target.files ?? []); e.target.value = ''; if (l.length) add(l); }} />
      <AnimatePresence>
        {view && <Viewer trip={trip} files={images} start={view} onClose={() => setView(null)} />}
      </AnimatePresence>
    </div>
  );
}

/** Full-screen photo on white (easy for gate scanners), swipe or arrows between a card's photos. */
function Viewer({ trip, files, start, onClose }: { trip: Trip; files: Attachment[]; start: string; onClose: () => void }) {
  const [i, setI] = useState(() => Math.max(0, files.findIndex(f => f.id === start)));
  const f = files[Math.min(i, files.length - 1)];
  useEffect(() => { if (!files.length) onClose(); }, [files.length, onClose]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI(n => Math.min(files.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [files.length, onClose]);
  if (!f) return null;
  return createPortal(
    // data-keep-sheet: taps here must not count as "outside" and close the sheet underneath
    <motion.div className="viewer" data-keep-sheet="" role="dialog" aria-label={f.name} style={{ pointerEvents: 'auto' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}>
      <div className="viewer-top">
        <button className="iconbtn" onClick={onClose} aria-label="닫기"><Icon name="x" size="2xl" /></button>
        <span className="viewer-name">{f.name}{files.length > 1 && <small> {i + 1}/{files.length}</small>}</span>
        <ConfirmButton compact label={`${f.name} 삭제`} confirm="" onConfirm={() => { deleteAttachment(trip.id, f.id); setI(n => Math.max(0, n - 1)); toast('파일을 삭제했습니다.'); }} />
      </div>
      <motion.img key={f.id} src={f.data} alt={f.name} className="viewer-img" drag={files.length > 1 ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={.4}
        onDragEnd={(_, d) => { if (d.offset.x < -60) setI(n => Math.min(files.length - 1, n + 1)); else if (d.offset.x > 60) setI(n => Math.max(0, n - 1)); }}
        initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} />
      {files.length > 1 && (
        <div className="viewer-nav">
          <button className="iconbtn" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="이전"><Icon name="back" size="2xl" /></button>
          <button className="iconbtn fwd" disabled={i === files.length - 1} onClick={() => setI(i + 1)} aria-label="다음"><Icon name="back" size="2xl" /></button>
        </div>
      )}
    </motion.div>,
    document.body,
  );
}

/** Search OpenStreetMap on submit, keep the typed name, or take a pasted Google Maps link. */
function PlaceSearch({ near, onPick, onCancel }: { near?: { lat: number; lng: number }; onPick: (p: PlaceRef) => void; onCancel: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PlaceRef[] | null>(null);
  const [busy, setBusy] = useState(false);
  const query = q.trim(), link = isLink(query), korean = hasHangul(query);
  // Latin queries: results while typing (debounced, older requests cancelled). Hangul: on submit only.
  useEffect(() => {
    if (query.length < 2 || link || korean) { setHits(null); return; } // keep the last results on screen while the next ones load
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try { setHits(await suggestPlaces(query, near, ctl.signal)); } catch (e) { if (!ctl.signal.aborted) setHits([]); }
      if (!ctl.signal.aborted) setBusy(false);
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); setBusy(false); };
  }, [query, link, korean, near]);
  const search = async () => {
    if (!query || link) return;
    if (!korean) { if (hits?.[0]) onPick(hits[0]); return; }
    setBusy(true);
    try { setHits(await searchPlaces(query)); } catch { setHits([]); toast('검색하지 못했어요. 이름 그대로 저장할 수 있어요.'); }
    setBusy(false);
  };
  return (
    <div className="psearch">
      <form className="addline" onSubmit={e => { e.preventDefault(); if (link) onPick(placeFromLink(query)); else search(); }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="장소 이름 · 주소 · 구글맵 링크" aria-label="장소 검색" autoFocus enterKeyHint="search" />
        {(link || korean) && <button className="btn" disabled={!query || busy}>{link ? '저장' : busy ? '찾는 중…' : '검색'}</button>}
      </form>
      {link && <p className="note-s">구글맵 링크는 그대로 저장하고, 누르면 구글맵에서 그 장소가 열려요.</p>}
      {hits && (
        <div className="phits">
          {hits.map(h => (
            <button key={h.id} className="phit" onClick={() => onPick(h)}>
              <Icon name="pin" size="md" /><span><b>{h.name}</b>{h.address && <small>{h.address}</small>}</span>
            </button>
          ))}
          {!hits.length && <p className="note-s">검색 결과가 없어요. 영어나 현지어로 찾아보거나, 아래처럼 이름 그대로 저장하세요.</p>}
          <button className="phit plain" onClick={() => onPick({ id: uid(), name: query })}>
            <Icon name="plus" size="md" /><span><b>‘{query}’ 이름 그대로 저장</b><small>지도에서 구글맵이 이 이름으로 찾아요</small></span>
          </button>
        </div>
      )}
      {!hits && !link && (
        <p className="note-s">{korean ? '한글은 [검색]을 눌러야 찾아요. 영어·현지어로 치면 입력하는 대로 바로 떠요.'
          : busy ? '찾는 중…' : '영어나 현지어로 치면 입력하는 대로 찾아요. 예: Sagrada, Barcelona Airport'}</p>
      )}
      <button className="linkbtn quiet" onClick={onCancel}>취소</button>
    </div>
  );
}
