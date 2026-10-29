'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'motion/react';
import type { TripData } from '@/lib/hooks';
import { stayGroups } from '@/lib/hooks';
import { addDay, addItem, deleteDay, moveItem, setDayDate, syncRange, updateDay } from '@/lib/store';
import { toast } from '@/lib/toast';
import { addDays, between, diff, dt, isWeekend, md, todayId, vibrate, WD } from '@/lib/util';
import { tone, useTags } from '@/lib/tags';
import type { Day, Item, Trip } from '@/lib/types';
import { CatPicker, ConfirmButton, EditToggle, Icon } from './ui';
import { PlaceSelect } from './PlaceSelect';

type Cols = Record<string, string[]>;
let lastDragEnd = 0; // a drop must not also count as a tap that opens the card

export default function Board({ trip, data, catFilter, openCard, openDay, addCard, addDay }: {
  trip: Trip; data: TripData; catFilter: string | null; openCard: (id: string) => void; openDay: (id: string) => void;
  addCard: (dayId: string) => void; addDay: () => void;
}) {
  const P = useTags();
  const { days, itemsByDay, itemById } = data;
  const base = useMemo<Cols>(() => Object.fromEntries(days.map(d => [d.id, (itemsByDay.get(d.id) || []).map(i => i.id)])), [days, itemsByDay]);
  const [cols, setCols] = useState<Cols>(base);
  const [activeId, setActiveId] = useState<string | null>(null);
  const frozen = useRef<Cols | null>(null);
  // Follow the data, except mid-drag and right after a drop (until the write shows up) so cards don't flick back.
  useEffect(() => { if (activeId || frozen.current === base) return; frozen.current = null; setCols(base); }, [base, activeId]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), // long-press on phones
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  );
  const find = (id: string) => (id in cols ? id : Object.keys(cols).find(k => cols[k].includes(id)));

  const onStart = ({ active }: DragStartEvent) => { setActiveId(String(active.id)); vibrate(12); };
  const onOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const a = String(active.id), o = String(over.id), from = find(a), to = find(o);
    if (!from || !to || from === to) return;
    setCols(c => {
      const dst = c[to].filter(x => x !== a);
      const r = active.rect.current.translated;
      const below = r && r.top > over.rect.top + over.rect.height / 2;
      const at = o in c ? dst.length : Math.max(0, dst.indexOf(o)) + (below ? 1 : 0);
      dst.splice(at, 0, a);
      return { ...c, [from]: c[from].filter(x => x !== a), [to]: dst };
    });
  };
  const onEnd = ({ active, over }: DragEndEvent) => {
    lastDragEnd = Date.now();
    const a = String(active.id), from = find(a);
    let list = from ? cols[from] : null;
    if (over && from && list) {
      const o = String(over.id);
      if (find(o) === from && !(o in cols)) { const oi = list.indexOf(a), ni = list.indexOf(o); if (oi !== ni) list = arrayMove(list, oi, ni); }
    }
    setActiveId(null);
    if (!from || !list) return;
    const next = { ...cols, [from]: list };
    setCols(next);
    const item = itemById.get(a);
    if (!item || (item.dayId === from && base[from].join() === list.join())) return;
    frozen.current = base;
    const i = list.indexOf(a), po = itemById.get(list[i - 1])?.order, no = itemById.get(list[i + 1])?.order;
    if (po != null && no != null && po >= no) list.forEach((id, k) => moveItem(trip.id, id, from, k)); // ties: renumber the column
    else moveItem(trip.id, a, from, between(po, no));
    if (item.dayId !== from) { const d = data.dayById.get(from); if (d) toast(`${md(d.date)} (${WD[dt(d.date).getUTCDay()]})로 옮겼습니다.`); }
  };

  // scroll: open on today (during the trip), date strip follows the board, jump requests from elsewhere
  const boardRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const scrollTo = (dayId: string, smooth = true) => {
    const b = boardRef.current, c = document.getElementById('d-' + dayId);
    if (b && c) b.scrollTo({ left: c.offsetLeft - b.offsetLeft - 2, behavior: smooth ? 'smooth' : 'auto' });
  };
  useEffect(() => {
    const t = days.find(d => d.date === todayId());
    if (t) scrollTo(t.id, false);
    const on = (e: Event) => scrollTo((e as CustomEvent<string>).detail);
    window.addEventListener('board:jump', on);
    return () => window.removeEventListener('board:jump', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onScroll = () => {
    const b = boardRef.current; if (!b) return;
    let cur = days[0]?.id ?? null;
    for (const d of days) { const c = document.getElementById('d-' + d.id); if (c && c.offsetLeft - b.offsetLeft <= b.scrollLeft + 40) cur = d.id; }
    if (cur !== current) setCurrent(cur);
  };
  useEffect(onScroll); // eslint-disable-line react-hooks/exhaustive-deps
  const stripRef = useRef<HTMLElement>(null);
  // one selection circle that glides to the current date (positioned inside the strip, so it scrolls with it)
  const [sel, setSel] = useState<{ x: number; y: number; today: boolean } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const s = stripRef.current, b = s?.querySelector<HTMLElement>('[aria-current="true"] b');
      if (!s || !b) return setSel(null);
      const sr = s.getBoundingClientRect(), br = b.getBoundingClientRect();
      setSel({ x: br.left - sr.left + s.scrollLeft, y: br.top - sr.top, today: !!b.closest('.is-today') });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [current, days]);
  useEffect(() => { // keep the current date visible in the strip
    const s = stripRef.current, b = s?.querySelector<HTMLElement>('[aria-current="true"]');
    if (s && b) s.scrollTo({ left: b.offsetLeft - s.offsetLeft - s.clientWidth / 2 + b.clientWidth / 2, behavior: 'smooth' });
  }, [current]);

  const stays = useMemo(() => {
    const m = new Map<string, { n: number; total: number }>();
    stayGroups(days).forEach(g => g.ids.forEach((id, i) => m.set(id, { n: i + 1, total: g.ids.length })));
    return m;
  }, [days]);
  const active = activeId ? itemById.get(activeId) : null;

  return (
    <>
      <nav className="dstrip" aria-label="날짜로 이동" ref={stripRef}>
        {sel && <span className={`dsel ${sel.today ? 'today' : ''}`} style={{ transform: `translate(${sel.x}px, ${sel.y}px)` }} aria-hidden="true" />}
        {days.map((d, i) => {
          const today = d.date === todayId();
          const prev = days[i - 1], next = days[i + 1];
          const runStart = !prev || prev.place !== d.place, runEnd = !next || next.place !== d.place;
          return (
            <motion.button key={d.id} whileTap={{ scale: .9 }} aria-current={current === d.id} className={today ? 'is-today' : ''}
              style={{ '--c': P.color(d.place) } as React.CSSProperties} onClick={() => scrollTo(d.id)}>
              <span className={`run ${d.place ? '' : 'none'} ${runStart ? 'start' : ''} ${runEnd ? 'end' : ''}`}>{runStart && d.place ? P.code(d.place) : ''}</span>
              <small className={isWeekend(d.date) ? 'we' : ''}>{today ? '오늘' : WD[dt(d.date).getUTCDay()]}</small>
              <b><span>{dt(d.date).getUTCDate()}</span></b>
            </motion.button>
          );
        })}
      </nav>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd}
        onDragCancel={() => { setActiveId(null); setCols(base); }} autoScroll={{ threshold: { x: .18, y: .12 }, acceleration: 12 }}>
        <div className={`board ${activeId ? 'dragging' : ''}`} ref={boardRef} onScroll={onScroll}>
          {days.map(d => (
            <DayColumn key={d.id} trip={trip} data={data} day={d} ids={cols[d.id] || []} stay={stays.get(d.id)}
              catFilter={catFilter} openCard={openCard} openDay={openDay} addCard={addCard} />
          ))}
          {!days.length && <div className="col newcol"><span className="muted">아직 날짜가 없습니다. 오른쪽 아래 + 를 눌러 첫 날짜를 추가하세요.</span></div>}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
          {active ? <div style={{ '--c': P.color(data.dayById.get(active.dayId)?.place) } as React.CSSProperties}><CardFace item={active} data={data} lifted /></div> : null}
        </DragOverlay>
      </DndContext>
      {!activeId && (
        <motion.button className="fab" aria-label="날짜 추가" onClick={addDay}
          initial={{ scale: .6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} whileTap={{ scale: .88 }}>
          <Icon name="plus" size="4xl" />
        </motion.button>
      )}
    </>
  );
}

function DayColumn({ trip, data, day, ids, stay, catFilter, openCard, openDay, addCard }: {
  trip: Trip; data: TripData; day: Day; ids: string[]; stay?: { n: number; total: number };
  catFilter: string | null; openCard: (id: string) => void; openDay: (id: string) => void; addCard: (dayId: string) => void;
}) {
  const P = useTags();
  const [editing, setEditing] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: day.id });
  const d = dt(day.date), first = data.days[0]?.date ?? day.date;
  const checks = data.allChecksOfDay(day.id), done = checks.filter(c => c.done).length;
  return (
    <section className={`col ${day.date === todayId() ? 'is-today' : ''} ${editing ? 'editing' : ''}`} id={'d-' + day.id} style={{ '--c': P.color(day.place) } as React.CSSProperties}>
      {editing ? <DayEditor trip={trip} data={data} day={day} onDone={() => setEditing(false)} /> : (
      <div className="chead">
        <div className="cdate">
          <button className="datebtn" onClick={() => openDay(day.id)} title="이 날의 체크리스트">
            <span className={isWeekend(day.date) ? 'we' : ''}>{d.getUTCMonth() + 1}월 {d.getUTCDate()}일 {WD[d.getUTCDay()]}요일</span>
            <span className="dnum">DAY {diff(first, day.date) + 1}</span>
            {day.date === todayId() && <em>오늘</em>}
          </button>
          <motion.button whileTap={{ scale: .88 }} className="iconbtn sm" onClick={() => setEditing(true)} aria-label={`${md(day.date)} 편집`}><Icon name="edit" size="md" /></motion.button>
        </div>
        <h3 className={day.title ? '' : 'empty'}>{day.title || '제목 없음'}</h3>
        <div className="facts">
          {day.place && <span className="code">{P.code(day.place)}</span>}
          {day.place && <span>{day.place}</span>}
          <span className={day.lodging ? '' : 'none'}><Icon name="bed" size="sm" />{day.lodging || '숙박 없음'}{stay && <i className="stayn">{stay.n}/{stay.total}박</i>}</span>
        </div>
        {day.note && <p className="notebox">{day.note}</p>}
        {checks.length > 0 && (
          <button className={`dprog mini ${done === checks.length ? 'ok' : ''}`} onClick={() => openDay(day.id)} aria-label={`${md(day.date)} 체크리스트 ${done}/${checks.length}`}>
            <Icon name="checks" size="sm" /><span>체크리스트 {done}/{checks.length}</span>
            <span className="progress"><motion.i initial={false} animate={{ width: `${done / checks.length * 100}%` }} /></span>
          </button>
        )}
      </div>
      )}
      <SortableContext id={day.id} items={ids} strategy={verticalListSortingStrategy}>
        <div className={`cards ${isOver ? 'over' : ''}`} ref={setNodeRef}>
          {ids.map(id => { const it = data.itemById.get(id); return it ? <SortableCard key={id} item={it} data={data} dim={!!catFilter && P.cat(it.cat).key !== catFilter} onOpen={openCard} /> : null; })}
          {!ids.length && <div className="empty-items">카드를 여기로 끌어 오거나 아래에서 추가하세요</div>}
        </div>
      </SortableContext>
      <div className="cfoot">
        <motion.button className="addcard" onClick={() => addCard(day.id)} whileTap={{ scale: .97 }}><Icon name="plus" size="md" />카드 추가</motion.button>
      </div>
    </section>
  );
}

/** The column header in edit mode, in place: every field of the day, saved together with 완료 (like a card's edit mode); delete sits at the bottom. */
function DayEditor({ trip, data, day, onDone }: { trip: Trip; data: TripData; day: Day; onDone: () => void }) {
  const [f, setF] = useState({ date: day.date, title: day.title, place: day.place, lodging: day.lodging, note: day.note });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const items = data.itemsByDay.get(day.id) || [];
  const first = data.days[0]?.date ?? day.date;
  const save = () => {
    const patch: Partial<Day> = {};
    (['title', 'place', 'lodging', 'note'] as const).forEach(k => { if (f[k].trim() !== (day[k] || '')) patch[k] = f[k].trim(); });
    if (Object.keys(patch).length) updateDay(trip.id, day.id, patch);
    if (f.date && f.date !== day.date) {
      const other = setDayDate(trip.id, day, f.date, data.days);
      syncRange(trip, data.days.map(x => (x.id === day.id ? f.date : other && x.id === other.id ? day.date : x.date)));
      toast(other ? `${md(day.date)}와 ${md(f.date)} 일정을 서로 바꿨습니다.` : `${md(f.date)}로 옮겼습니다.`);
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('board:jump', { detail: day.id })));
    }
    onDone();
  };
  return (
    <motion.form className="chead dayedit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .15 }}
      onSubmit={e => { e.preventDefault(); save(); }} onKeyDown={e => { if (e.key === 'Escape') onDone(); }}>
      <div className="cdate">
        <input type="date" className="date-in" value={f.date} onChange={set('date')} required aria-label="날짜" />
        <span className="dnum">DAY {diff(first, day.date) + 1}</span>
        <span className="grow" />
        <EditToggle editing onToggle={save} />
      </div>
      {f.date !== day.date && data.days.some(x => x.date === f.date && x.id !== day.id) && <p className="note-s">이미 있는 날짜라 두 날의 일정이 서로 바뀝니다.</p>}
      <input className="title-in" value={f.title} onChange={set('title')} placeholder="제목 (예: 바르셀로나 → 포르투)" aria-label="제목" autoFocus />
      <PlaceSelect trip={trip} days={data.days} value={f.place} onChange={place => setF(x => ({ ...x, place }))} placeholder="장소" />
      <PlaceSelect trip={trip} days={data.days} value={f.lodging} onChange={lodging => setF(x => ({ ...x, lodging }))} placeholder="숙박 도시 (없으면 비워 두기)" emptyLabel="숙박 없음" />
      <textarea value={f.note} onChange={set('note')} rows={2} placeholder="메모 (예: 기차 시간 재확인)" aria-label="메모" />
      <div className="actions">
        <ConfirmButton label="날짜 삭제" title={`${md(day.date)} 일정을 삭제할까요?`} confirm={items.length ? `카드 ${items.length}개도 함께 지워지고 되돌릴 수 없습니다.` : '되돌릴 수 없습니다.'}
          onConfirm={() => {
            deleteDay(trip.id, day, data.items, data.checks, data.files);
            syncRange(trip, data.days.filter(x => x.id !== day.id).map(x => x.date));
            toast(`${md(day.date)} 일정을 삭제했습니다.`);
          }} />
        <span className="grow" />
        <button type="button" className="linkbtn quiet" onClick={onDone}>취소</button>
      </div>
    </motion.form>
  );
}

/** Add cards to one day; stays open after each add so several can be entered in a row. */
export function AddCard({ trip, day, data, onClose, onManage }: { trip: Trip; day: Day; data: TripData; onClose: () => void; onManage: () => void }) {
  const [f, setF] = useState({ cat: 'sight', time: '', text: '' });
  const [added, setAdded] = useState(0);
  const textRef = useRef<HTMLInputElement>(null);
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      if (!f.text.trim()) return;
      const list = data.itemsByDay.get(day.id) || [];
      addItem(trip.id, day.id, { ...f, text: f.text.trim(), time: f.time.trim() }, (list[list.length - 1]?.order ?? -1) + 1);
      setF({ ...f, time: '', text: '' }); setAdded(added + 1); vibrate(8); textRef.current?.focus();
    }}>
      <CatPicker value={f.cat} onChange={cat => setF({ ...f, cat })} onManage={onManage} />
      <label className="lab">내용<input ref={textRef} className="field big" value={f.text} onChange={e => setF({ ...f, text: e.target.value })} placeholder="할 일 또는 장소" autoFocus enterKeyHint="done" /></label>
      <label className="lab">시간 (선택)<input className="field" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} placeholder="예: 09:30, 오전" /></label>
      <div className="actions">
        {added > 0 && <span className="note-s">{added}개 추가됨</span>}
        <button type="button" className="btn sec" onClick={onClose}>{added ? '완료' : '닫기'}</button>
        <button className="btn" disabled={!f.text.trim()}>추가</button>
      </div>
    </form>
  );
}

function SortableCard({ item, data, dim, onOpen }: { item: Item; data: TripData; dim: boolean; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} {...attributes} {...listeners}
      className={`cardwrap ${isDragging ? 'placeholder' : ''} ${dim ? 'dim' : ''}`}
      onClick={() => { if (Date.now() - lastDragEnd > 300) onOpen(item.id); }}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(item.id); listeners?.onKeyDown?.(e); }}>
      <CardFace item={item} data={data} />
    </div>
  );
}

function CardFace({ item, data, lifted }: { item: Item; data: TripData; lifted?: boolean }) {
  const cat = useTags().cat(item.cat);
  const checks = data.checksOfItem(item.id), n = checks.filter(c => c.done).length;
  const files = data.filesOfItem(item.id).length, places = item.places?.length ?? 0;
  return (
    <motion.div className={`card ${lifted ? 'lifted' : ''}`} style={{ '--k': tone(cat.color) } as React.CSSProperties} initial={lifted ? { scale: 1, rotate: 0 } : false}
      animate={lifted ? { scale: 1.04, rotate: -1.5 } : undefined} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
      <span className="cmeta"><span className="kname">{cat.name}</span>{item.time && <span className="time">{item.time}</span>}</span>
      <span className="txt">{item.text}</span>
      {(checks.length > 0 || files > 0 || places > 0) && (
        <span className="cbadges">
          {checks.length > 0 && <span className={`cbadge ${n === checks.length ? 'ok' : ''}`}><Icon name="checks" size="sm" />{n}/{checks.length}</span>}
          {files > 0 && <span className="cbadge"><Icon name="clip" size="sm" />{files}</span>}
          {places > 0 && <span className="cbadge"><Icon name="pin" size="sm" />{places}</span>}
        </span>
      )}
    </motion.div>
  );
}

/** Adds one date to the trip (opened from the + button); a date that already exists is refused. */
export function NewDay({ trip, days, onDone }: { trip: Trip; days: Day[]; onDone: () => void }) {
  const [date, setDate] = useState(() => days.length ? addDays(days[days.length - 1].date, 1) : trip.start || todayId());
  const taken = days.some(d => d.date === date);
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      if (!date || taken) return;
      const id = addDay(trip.id, date);
      syncRange(trip, [...days.map(d => d.date), date]);
      onDone();
      toast(`${md(date)} (${WD[dt(date).getUTCDay()]})을 추가했습니다.`);
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('board:jump', { detail: id })));
    }}>
      <label className="lab">날짜<input className="field big" type="date" value={date} onChange={e => setDate(e.target.value)} required /></label>
      {taken && <p className="note-s warn">{md(date)}은 이미 있는 날짜입니다.</p>}
      <div className="actions"><button type="button" className="btn sec" onClick={onDone}>닫기</button><button className="btn" disabled={!date || taken}>추가</button></div>
    </form>
  );
}
