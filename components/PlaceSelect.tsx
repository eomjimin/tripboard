'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { deletePlace, renamePlace, savePlace } from '@/lib/store';
import { toast } from '@/lib/toast';
import { newPlaceTag, placeOptions, tone, useTags } from '@/lib/tags';
import type { Day, Trip } from '@/lib/types';
import { ConfirmButton, Icon, Swatches } from './ui';

/** A place tag as a chip: short code + name, in the place's colour. */
export function PlaceChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  const P = useTags();
  return (
    <span className="ptag" style={{ '--c': P.color(name) } as React.CSSProperties}>
      <b>{P.code(name)}</b>{name}
      {onRemove && <button type="button" className="ptag-x" onClick={e => { e.stopPropagation(); onRemove(); }} aria-label={`${name} 빼기`}><Icon name="x" size={12} /></button>}
    </span>
  );
}

/** Notion-style select for a place tag: type to filter, pick one, or create it; ⋯ edits a tag for the whole trip. */
export function PlaceSelect({ trip, days, value, onChange, placeholder, emptyLabel }: {
  trip: Trip; days: Day[]; value: string; onChange: (name: string) => void; placeholder: string; emptyLabel?: string;
}) {
  const P = useTags();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setEditing(null); setQ(''); } };
    document.addEventListener('pointerdown', on);
    return () => document.removeEventListener('pointerdown', on);
  }, [open]);

  const options = placeOptions(trip, days);
  const query = q.trim(), lq = query.toLowerCase();
  const shown = options.filter(o => o.toLowerCase().includes(lq) || P.code(o).toLowerCase().includes(lq));
  const exact = options.find(o => o.toLowerCase() === lq);
  const pick = (name: string) => { onChange(name); setOpen(false); setEditing(null); setQ(''); };
  const create = () => {
    if (!query) return;
    savePlace(trip.id, query, newPlaceTag(query, options.map(o => P.place(o).color)));
    pick(query);
  };

  return (
    <div className={`tsel ${open ? 'open' : ''}`} ref={ref}>
      <div className="tsel-field" onClick={() => setOpen(true)}>
        {value && <PlaceChip name={value} onRemove={() => onChange('')} />}
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={value ? '' : placeholder}
          aria-label={placeholder} enterKeyHint="done"
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (exact) pick(exact); else if (query) create(); else if (shown[0]) pick(shown[0]); }
            if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setQ(''); }
            if (e.key === 'Backspace' && !q && value) onChange('');
          }} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="tsel-menu" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .16 }}>
            <div className="tsel-h">{options.length ? '선택하거나 새로 만들기' : '이름을 입력해 첫 장소 태그를 만드세요'}</div>
            {emptyLabel && !query && (
              <button type="button" className={`tsel-opt ${!value ? 'cur' : ''}`} onClick={() => pick('')}><span className="muted">{emptyLabel}</span>{!value && <Icon name="check" size={16} />}</button>
            )}
            {shown.map(o => (
              <div key={o} className="tsel-row">
                <div className="tsel-line">
                  <button type="button" className={`tsel-opt ${o === value ? 'cur' : ''}`} onClick={() => pick(o)}><PlaceChip name={o} />{o === value && <Icon name="check" size={16} />}</button>
                  <button type="button" className="iconbtn sm" onClick={() => setEditing(editing === o ? null : o)} aria-label={`${o} 태그 편집`} aria-expanded={editing === o}><Icon name="more" size={18} /></button>
                </div>
                <AnimatePresence initial={false}>
                  {editing === o && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <PlaceEditor trip={trip} days={days} name={o} onSaved={n => { if (value === o && n !== o) onChange(n); setEditing(null); }}
                        onDeleted={() => { if (value === o) onChange(''); setEditing(null); }} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
            {query && !exact && (
              <button type="button" className="tsel-opt create" onClick={create}>
                <span className="muted">생성</span>
                <span className="ptag" style={{ '--c': tone(newPlaceTag(query, options.map(o => P.place(o).color)).color) } as React.CSSProperties}><b>{newPlaceTag(query, []).code}</b>{query}</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One place tag for the whole trip: name (renaming updates every day using it), short code, colour; saved with 저장. */
export function PlaceEditor({ trip, days, name, onSaved, onDeleted }: {
  trip: Trip; days: Day[]; name: string; onSaved?: (name: string) => void; onDeleted?: () => void;
}) {
  const P = useTags();
  const cur = P.place(name);
  const [f, setF] = useState({ name, code: cur.code, color: cur.color });
  const uses = days.filter(d => d.place === name || d.lodging === name).length;
  const next = { name: f.name.trim(), code: f.code.trim().toUpperCase().slice(0, 4) };
  const changed = next.name !== name || next.code !== cur.code || f.color !== cur.color;
  const save = () => {
    if (!next.name || !next.code || !changed) return;
    const tag = { code: next.code, color: f.color };
    if (next.name !== name) {
      if (placeOptions(trip, days).includes(next.name)) { toast(`‘${next.name}’ 태그가 이미 있습니다.`); return; }
      renamePlace(trip.id, days, name, next.name, tag);
    } else savePlace(trip.id, name, tag);
    onSaved?.(next.name);
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
  return (
    <div className="place-ed" style={{ '--c': tone(f.color) } as React.CSSProperties}>
      <div className="place-top">
        <span className="note-s">{uses ? `${uses}일에서 사용 중` : '사용하는 날짜 없음'}</span>
        <ConfirmButton compact label={`${name} 태그 삭제`} confirm={uses ? `${uses}일에서 빠짐` : ''}
          onConfirm={() => { deletePlace(trip.id, days, name); onDeleted?.(); toast(`‘${name}’ 태그를 삭제했습니다.`); }} />
      </div>
      <div className="place-fields">
        <label className="lab">이름<input className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} onKeyDown={onKey} /></label>
        <label className="lab">짧은 표시<input className="field" value={f.code} maxLength={4} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} onKeyDown={onKey} /></label>
        <motion.button type="button" className="savebtn" whileTap={{ scale: .9 }} disabled={!changed || !next.name || !next.code} onClick={save} aria-label="저장">
          <Icon name="check" size={22} />
        </motion.button>
      </div>
      <Swatches value={f.color} onChange={color => setF({ ...f, color })} label={`${name} 색`} />
    </div>
  );
}
