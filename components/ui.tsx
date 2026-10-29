'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Drawer } from 'vaul';
import { useMedia } from '@/lib/hooks';
import { PALETTE, tone, useTags } from '@/lib/tags';

const ICONS = {
  back: 'M15 5l-7 7 7 7',
  home: 'M4 10.5L12 4l8 6.5V19a1 1 0 01-1 1h-4.5v-5.5h-5V20H5a1 1 0 01-1-1z',
  people: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.5 3.5 0 010 6.5M18 14.8c1.9.7 3.2 2.4 3.5 5.2',
  edit: 'M15.5 4.5l4 4L9 19H5v-4z',
  plus: 'M12 5v14M5 12h14',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0C18.5 15.4 12 21 12 21zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  bed: 'M2.5 19V6M2.5 15h19v4M21.5 15v-2.5a3 3 0 00-3-3H11V15M6.5 12a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5z',
  board: 'M4 4h6v16H4zM14 4h6v10h-6z',
  checks: 'M4 7l2 2 3.5-3.5M4 15.5l2 2 3.5-3.5M13 8h7M13 16.5h7',
  tag: 'M3.5 12.5v-8h8l9 9-8 8zM8 8.5h.01',
  out: 'M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h10',
  filter: 'M4 6.5h16M7 12h10M10 17.5h4',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  download: 'M12 4v11M7.5 10.5l4.5 4.5 4.5-4.5M5 20h14',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  clip: 'M15.5 7.5l-6.8 6.8a2 2 0 002.8 2.8l7-7a4 4 0 00-5.6-5.6l-7.2 7.2a6 6 0 008.5 8.5l6.3-6.3',
  nav: 'M3 11l18-8-8 18-2-8z',
  pagemenu: 'M5 7h14M5 12h14M5 17h9',
  share: 'M12 15V4M8 7.5l4-4 4 4M6.5 11H5v9h14v-9h-1.5',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5',
  more: 'M5 12a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zM10.5 12a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zM16 12a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0z',
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
  );
}

/** Text that is edited in place; saves when it loses focus or on Enter, Esc restores. */
export function InlineField({ value, onCommit, placeholder, multiline, list, className = '', label, readOnly }: {
  value: string; onCommit: (v: string) => void; placeholder?: string; multiline?: boolean; list?: string;
  className?: string; label: string; readOnly?: boolean;
}) {
  const [v, setV] = useState(value || '');
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setV(value || ''); }, [value]);
  const commit = () => { editing.current = false; const t = v.trim(); if (t !== (value || '')) onCommit(t); };
  const common = {
    value: v, placeholder, 'aria-label': label, readOnly,
    className: `inl ${className} ${multiline && v ? 'has' : ''}`,
    onFocus: () => { editing.current = true; },
    onBlur: commit,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (!multiline || !e.shiftKey)) { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === 'Escape') { setV(value || ''); editing.current = false; e.currentTarget.blur(); }
    },
  };
  return multiline ? <textarea rows={1} {...common} /> : <input list={list} {...common} />;
}

export function CatChip({ cat }: { cat?: string }) {
  const c = useTags().cat(cat);
  return <span className="kchip" style={{ '--k': tone(c.color) } as React.CSSProperties}>{c.name}</span>;
}

export function CatPicker({ value, onChange, onManage }: { value: string; onChange: (k: string) => void; onManage?: () => void }) {
  const T = useTags(), cur = T.cat(value).key;
  return (
    <div className="catpick" role="radiogroup" aria-label="종류">
      {T.cats.map(c => (
        <motion.button key={c.key} type="button" role="radio" aria-checked={cur === c.key} whileTap={{ scale: .92 }}
          className="kopt" style={{ '--k': tone(c.color) } as React.CSSProperties} onClick={() => onChange(c.key)}>{c.name}</motion.button>
      ))}
      {onManage && <motion.button type="button" whileTap={{ scale: .92 }} className="kopt manage" onClick={onManage}><Icon name="edit" size={13} />편집</motion.button>}
    </div>
  );
}

/** The one control that switches a view into editing (✎) and back (완료). */
export function EditToggle({ editing, onToggle, label = '편집' }: { editing: boolean; onToggle: () => void; label?: string }) {
  return (
    <motion.button type="button" whileTap={{ scale: .92 }} className={`edit-toggle ${editing ? 'on' : ''}`} onClick={onToggle} aria-pressed={editing}>
      {editing ? '완료' : <><Icon name="edit" size={14} />{label}</>}
    </motion.button>
  );
}

/** Colour dots to pick a tag colour from. */
export function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {PALETTE.map(([k, l]) => (
        <motion.button key={k} type="button" role="radio" aria-checked={value === k} aria-label={l} title={l} whileTap={{ scale: .85 }}
          className="swatch" style={{ '--c': tone(k) } as React.CSSProperties} onClick={() => onChange(k)} />
      ))}
    </div>
  );
}

/** Checkbox whose tick draws in. */
export function Tick({ done, onToggle, label, disabled }: { done: boolean; onToggle: () => void; label: string; disabled?: boolean }) {
  return (
    <motion.button type="button" className={`tick ${done ? 'on' : ''}`} role="checkbox" aria-checked={done} aria-label={label}
      disabled={disabled} onClick={onToggle} whileTap={{ scale: .82 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <motion.path d="M3.5 8.4l3 3 6-6.6" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          initial={false} animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={{ duration: .22 }} />
      </svg>
    </motion.button>
  );
}

/** Bottom sheet on phones (drag down to close), side panel on wide screens. */
export function Sheet({ open, onClose, onBack, title, sub, children }: {
  open: boolean; onClose: () => void; onBack?: () => void; title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode;
}) {
  const wide = useMedia('(min-width: 760px)');
  return (
    <Drawer.Root open={open} onOpenChange={o => { if (!o) onClose(); }} direction={wide ? 'right' : 'bottom'}>
      <Drawer.Portal>
        <Drawer.Overlay className="scrim" />
        <Drawer.Content className={`sheet ${wide ? 'side' : 'bottom'}`} aria-describedby={undefined}
          // a full-screen layer opened from the sheet (photo viewer) is not "outside" the sheet
          onPointerDownOutside={e => { if ((e.target as Element | null)?.closest?.('[data-keep-sheet]')) e.preventDefault(); }}
          onInteractOutside={e => { if ((e.target as Element | null)?.closest?.('[data-keep-sheet]')) e.preventDefault(); }}
          onEscapeKeyDown={e => { if (document.querySelector('[data-keep-sheet]')) e.preventDefault(); }}>
          {!wide && <div className="handle" aria-hidden="true" />}
          <div className="sheet-h">
            {onBack && <button className="iconbtn back" onClick={onBack} aria-label="뒤로"><Icon name="back" size={20} /></button>}
            <div className="sheet-tt"><Drawer.Title className="sheet-t">{title}</Drawer.Title>{sub && <p className="sheet-sub">{sub}</p>}</div>
            <button className="x" onClick={onClose} aria-label="닫기">×</button>
          </div>
          <div className="sheet-b">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Destructive button that asks first: a confirm card over the sheet, or (compact) a trash icon that turns into a red 삭제. */
export function ConfirmButton({ label, title, confirm, onConfirm, compact, icon }: {
  label: string; title?: string; confirm: string; onConfirm: () => void; compact?: boolean; icon?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed || !compact) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed, compact]);
  if (compact) return armed
    ? <span className="confirm-inline">{confirm && <small>{confirm}</small>}<motion.button initial={{ scale: .8 }} animate={{ scale: 1 }} type="button" className="pill danger" onClick={onConfirm}>삭제</motion.button></span>
    : <button type="button" className="iconbtn sm" onClick={() => setArmed(true)} aria-label={label}><Icon name="trash" size={17} /></button>;
  return (
    <>
      {icon
        ? <button type="button" className="iconbtn sm danger" onClick={() => setArmed(true)} aria-label={label}><Icon name="trash" size={17} /></button>
        : <button type="button" className="dangerlink" onClick={() => setArmed(true)}><Icon name="trash" size={16} />{label}</button>}
      <AnimatePresence>
        {armed && (
          <motion.div className="confirm-pop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setArmed(false)}>
            <motion.div className="confirm-card" role="alertdialog" aria-label={title ?? label} onClick={e => e.stopPropagation()}
              initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 36 }}>
              <b>{title ?? `${label}할까요?`}</b>
              {confirm && <p>{confirm}</p>}
              <div className="row2">
                <button type="button" className="btn sec big" onClick={() => setArmed(false)} autoFocus>취소</button>
                <button type="button" className="btn danger big" onClick={() => { setArmed(false); onConfirm(); }}>삭제</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** One-line add field: Enter adds and keeps focus for the next entry. */
export function AddLine({ placeholder, onAdd, label }: { placeholder: string; onAdd: (t: string) => void; label: string }) {
  const [v, setV] = useState('');
  return (
    <form className="addline" onSubmit={e => { e.preventDefault(); const t = v.trim(); if (t) { onAdd(t); setV(''); } }}>
      <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} aria-label={label} autoComplete="off" enterKeyHint="done" />
      <motion.button whileTap={{ scale: .9 }} className="btn sec" disabled={!v.trim()}>추가</motion.button>
    </form>
  );
}

/** A card section that folds: starts open only when it has something in it, the header toggles it. */
export function Fold({ title, count, label, children }: { title: string; count: number; label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(count > 0);
  return (
    <section className="block fold">
      <button type="button" className="block-h link" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <b>{title}</b>{(label || count > 0) && <span className="n">{label ?? count}</span>}
        <motion.span className="fold-chev" animate={{ rotate: open ? 90 : -90 }} transition={{ duration: .2 }}><Icon name="back" size={16} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="fold-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .2 }}>
            <div className="fold-in">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
