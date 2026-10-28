'use client';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { buildTripData, stayGroups, useTripData } from '@/lib/hooks';
import { diff, dt, md, todayId, WD } from '@/lib/util';
import { tone, TagsProvider, useTags } from '@/lib/tags';
import type { Check, Day, Item, Trip } from '@/lib/types';
import Board, { AddCard, NewDay } from './Board';
import ChecklistView from './ChecklistView';
import StaysView from './StaysView';
import { CardSheet, DaySheet, MembersSheet, TagManager, TripSettingsSheet } from './Sheets';
import { PlaceEditor } from './PlaceSelect';
import { Icon, type IconName, Sheet } from './ui';

export type SheetState = { kind: 'card'; id: string } | { kind: 'day'; id: string } | { kind: 'add'; dayId: string } | { kind: 'newday' }
  | { kind: 'place'; name: string } | { kind: 'tags' } | { kind: 'members' } | { kind: 'trip' } | { kind: 'filter' };
type View = 'board' | 'check' | 'stay';
const VIEWS: [View, string, IconName][] = [['board', '일정', 'board'], ['check', '체크리스트', 'checks'], ['stay', '숙박', 'bed']];

export default function TripView(props: Parameters<typeof TripScreen>[0]) {
  return <TagsProvider trip={props.trip}><TripScreen {...props} /></TagsProvider>;
}

function TripScreen({ trip, email, onBack, demo }: {
  trip: Trip; email: string; onBack: () => void; demo?: { days: Day[]; items: Item[]; checks: Check[] };
}) {
  const live = useTripData(demo ? null : trip.id);
  const demoData = useMemo(() => demo ? buildTripData(demo.days, demo.items, demo.checks) : null, [demo]);
  const data = demoData ?? live;
  const P = useTags();
  const [view, setView] = useState<View>('board');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  // Sheets stack: one opened from inside another (e.g. 태그 관리 from 카드 추가) returns to it with ‹.
  const [stack, setStack] = useState<SheetState[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheet = stack[stack.length - 1] ?? null;
  const openSheet = (s: SheetState) => { setStack(st => (sheetOpen ? [...st, s] : [s])); setSheetOpen(true); };
  const closeSheet = () => { if (stack.length > 1) setStack(st => st.slice(0, -1)); else setSheetOpen(false); };
  const closeAll = () => setSheetOpen(false);
  const manageTags = () => openSheet({ kind: 'tags' });
  const groups = useMemo(() => stayGroups(data.days), [data.days]);

  const first = data.days[0]?.date, last = data.days[data.days.length - 1]?.date;
  const t = todayId();
  let span = '날짜를 추가하면 여행 기간이 표시됩니다', dday = '';
  if (first) {
    const n = diff(first, last);
    span = `${first.replace(/-/g, '.')} – ${md(last).replace('/', '.')} · ${n}박 ${n + 1}일`;
    const until = diff(t, first);
    if (until > 0) dday = `D-${until}`;
    else if (diff(t, last) >= 0) dday = `여행 ${1 - until}일차`;
    else dday = '다녀옴';
  }
  const open = data.checks.filter(c => !c.done).length;
  const filterCat = catFilter ? P.cat(catFilter) : null;
  const jump = (dayId: string) => { setView('board'); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('board:jump', { detail: dayId }))); };
  const dayName = (d: Day) => `${md(d.date)} (${WD[dt(d.date).getUTCDay()]})`;

  let sheetBody: React.ReactNode = null, sheetTitle: React.ReactNode = '', sheetSub: React.ReactNode = null;
  if (sheet?.kind === 'card') {
    const it = data.itemById.get(sheet.id);
    const d = it ? data.dayById.get(it.dayId) : undefined;
    sheetTitle = '카드'; sheetSub = d ? `${dayName(d)} · ${d.title || '제목 없음'}` : null;
    sheetBody = it ? <CardSheet trip={trip} data={data} item={it} onClose={closeSheet} onManage={manageTags} /> : <p className="muted">삭제된 카드입니다.</p>;
  } else if (sheet?.kind === 'day') {
    const d = data.dayById.get(sheet.id);
    sheetTitle = d ? `${dayName(d)} 체크리스트` : '날짜'; sheetSub = d?.title;
    sheetBody = d ? <DaySheet trip={trip} data={data} day={d} openCard={id => openSheet({ kind: 'card', id })} /> : <p className="muted">삭제된 날짜입니다.</p>;
  } else if (sheet?.kind === 'newday') {
    sheetTitle = '날짜 추가'; sheetSub = trip.title;
    sheetBody = <NewDay trip={trip} days={data.days} onDone={closeSheet} />;
  } else if (sheet?.kind === 'add') {
    const d = data.dayById.get(sheet.dayId);
    sheetTitle = '카드 추가'; sheetSub = d ? `${dayName(d)} · ${d.title || '제목 없음'}` : null;
    sheetBody = d ? <AddCard key={d.id} trip={trip} data={data} day={d} onClose={closeSheet} onManage={manageTags} /> : <p className="muted">삭제된 날짜입니다.</p>;
  } else if (sheet?.kind === 'place') {
    sheetTitle = '장소 태그'; sheetSub = sheet.name;
    sheetBody = <PlaceEditor trip={trip} days={data.days} name={sheet.name} onDeleted={closeSheet} onSaved={closeSheet} />;
  } else if (sheet?.kind === 'tags') {
    sheetTitle = '태그 관리'; sheetSub = '이 여행 전체에서 같이 쓰는 태그';
    sheetBody = <TagManager trip={trip} data={data} />;
  } else if (sheet?.kind === 'filter') {
    sheetTitle = '종류별로 보기'; sheetSub = '고른 종류의 카드만 또렷하게 보입니다';
    sheetBody = (
      <div className="stack">
        <div className="catpick" role="radiogroup" aria-label="종류">
          <motion.button type="button" role="radio" aria-checked={!catFilter} whileTap={{ scale: .92 }} className="kopt all" onClick={() => { setCatFilter(null); closeSheet(); }}>전체</motion.button>
          {P.cats.map(c => (
            <motion.button key={c.key} type="button" role="radio" aria-checked={catFilter === c.key} whileTap={{ scale: .92 }} className="kopt"
              style={{ '--k': tone(c.color) } as React.CSSProperties} onClick={() => { setCatFilter(c.key); closeSheet(); }}>{c.name}</motion.button>
          ))}
        </div>
      </div>
    );
  } else if (sheet?.kind === 'members') {
    sheetTitle = '함께하는 사람'; sheetSub = `${(trip.members || []).length}명`;
    sheetBody = <MembersSheet trip={trip} email={email} onLeft={() => { closeAll(); onBack(); }} />;
  } else if (sheet?.kind === 'trip') {
    sheetTitle = '여행 관리'; sheetSub = trip.title;
    sheetBody = <TripSettingsSheet trip={trip} data={data} email={email} onDeleted={() => { closeAll(); onBack(); }} openTags={manageTags} openMembers={() => openSheet({ kind: 'members' })} />;
  }

  return (
    <div className={`screen ${view === 'board' ? 'fit' : ''}`}>
      <header className="top">
        <div className="topbar">
          <motion.button className="iconbtn" onClick={onBack} whileTap={{ scale: .9 }} aria-label="여행 목록"><Icon name="back" size={22} /></motion.button>
          <div className="tb-title"><h1>{trip.title}</h1>{trip.tag && <span>{trip.tag}</span>}</div>
          <div className="tb-actions">
            {view === 'board' && (
              <motion.button className={`iconbtn ${catFilter ? 'on' : ''}`} onClick={() => openSheet({ kind: 'filter' })} whileTap={{ scale: .9 }} aria-label="종류별로 보기">
                <Icon name="filter" size={21} />
              </motion.button>
            )}
            <motion.button className="iconbtn" onClick={() => openSheet({ kind: 'trip' })} whileTap={{ scale: .9 }} aria-label="여행 관리">
              <Icon name="more" size={22} />
            </motion.button>
          </div>
        </div>
        <div className="sub">
          {dday && <span className="dday">{dday}</span>}
          <span>{span}</span>
        </div>
      </header>

      <div className="bar">
        <nav className="seg-ctl" role="tablist">
          {VIEWS.map(([k, l, ic]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}>
              {view === k && <motion.span layoutId="tabpill" className="pill-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="lbl"><Icon name={ic} size={20} /><span>{l}</span>{k === 'check' && open > 0 && <span className="count">{open}</span>}</span>
            </button>
          ))}
        </nav>
      </div>

      <AnimatePresence>
        {view === 'board' && filterCat && (
          <motion.div className="filternote" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <button className="kchip on" style={{ '--k': tone(filterCat.color) } as React.CSSProperties} onClick={() => setCatFilter(null)}>
              {filterCat.name}만 보는 중<Icon name="x" size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view} className="viewpane" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .18 }}>
          {!data.loaded ? <p className="muted">일정을 불러오는 중입니다…</p>
            : view === 'board' ? <Board trip={trip} data={data} catFilter={catFilter} openCard={id => openSheet({ kind: 'card', id })}
                openDay={id => openSheet({ kind: 'day', id })} addCard={dayId => openSheet({ kind: 'add', dayId })} addDay={() => openSheet({ kind: 'newday' })} />
            : view === 'check' ? <ChecklistView trip={trip} data={data} openCard={id => openSheet({ kind: 'card', id })} openDay={jump} />
            : <StaysView days={data.days} groups={groups} onJump={jump} onPlace={name => openSheet({ kind: 'place', name })} />}
        </motion.div>
      </AnimatePresence>

      <Sheet open={sheetOpen} onClose={closeAll} onBack={stack.length > 1 ? closeSheet : undefined} title={sheetTitle} sub={sheetSub}>{sheetBody}</Sheet>
    </div>
  );
}
