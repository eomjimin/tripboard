'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import type { TripData } from '@/lib/hooks';
import { addCheck } from '@/lib/store';
import { dt, md, WD } from '@/lib/util';
import { useTags } from '@/lib/tags';
import type { Check, Scope, Trip } from '@/lib/types';
import { CatChip, EditToggle } from './ui';
import { CheckRows } from './Sheets';

type Filter = 'all' | 'open' | 'done';

export default function ChecklistView({ trip, data, openCard, openDay }: { trip: Trip; data: TripData; openCard: (id: string) => void; openDay: (id: string) => void }) {
  const P = useTags();
  const [filter, setFilter] = useState<Filter>('open');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [target, setTarget] = useState('none');
  const done = data.checks.filter(c => c.done).length, total = data.checks.length;
  const keep = (c: Check) => filter === 'all' || (filter === 'open' ? !c.done : c.done);

  const sections = data.days.map(d => {
    const rows = (data.itemsByDay.get(d.id) || []).map(it => ({ it, rows: data.checksOfItem(it.id).filter(keep) })).filter(x => x.rows.length);
    const dayRows = data.checksOfDay(d.id).filter(keep);
    return { d, rows, dayRows };
  }).filter(s => s.rows.length || s.dayRows.length);
  const loose = data.checks.filter(c => !data.dayOfCheck(c)).filter(keep);

  return (
    <div className="sheetview">
      <div className="progress big"><motion.i animate={{ width: `${total ? done / total * 100 : 0}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></div>
      <div className="toolbar">
      <div className="filters">
        {([['open', `남은 것 ${total - done}`], ['done', `완료 ${done}`], ['all', `전체 ${total}`]] as [Filter, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}>
            {filter === k && <motion.span layoutId="filterpill" className="pill-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="lbl">{l}</span>
          </button>
        ))}
      </div>
      <EditToggle editing={editing} onToggle={() => setEditing(!editing)} />
      </div>

      {sections.map(({ d, rows, dayRows }) => (
        <section key={d.id} className="cgroup" style={{ '--c': P.color(d.place) } as React.CSSProperties}>
          <button className="cgroup-h" onClick={() => openDay(d.id)}>
            <span className="cday sm">{dt(d.date).getUTCDate()}</span>
            <span><b>{md(d.date)} ({WD[dt(d.date).getUTCDay()]})</b> {d.title}</span>
          </button>
          {rows.map(({ it, rows }) => (
            <div key={it.id} className="csub">
              <button className="csub-h" onClick={() => openCard(it.id)}><CatChip cat={it.cat} />{it.time && <span className="time">{it.time}</span>}<span>{it.text}</span></button>
              <CheckRows trip={trip} rows={rows} editable={editing} />
            </div>
          ))}
          {dayRows.length > 0 && <div className="csub"><div className="csub-h plain">하루 전체</div><CheckRows trip={trip} rows={dayRows} editable={editing} /></div>}
        </section>
      ))}
      {loose.length > 0 && <section className="cgroup"><div className="cgroup-h plain"><b>연결된 일정 없음</b></div><CheckRows trip={trip} rows={loose} editable={editing} /></section>}
      {!sections.length && !loose.length && <p className="muted empty">{total ? (filter === 'open' ? '남은 항목이 없습니다. 준비 끝!' : '완료한 항목이 아직 없습니다.') : '✎ 편집을 누르면 항목을 추가할 수 있습니다.'}</p>}

      {editing && <form className="form newcheck" onSubmit={e => {
        e.preventDefault();
        const t = text.trim(); if (!t) return;
        const [scope, id] = target.split(':') as [Scope, string | undefined];
        addCheck(trip.id, t, scope, scope === 'item' ? id : null, scope === 'day' ? id : null);
        setText('');
      }}>
        <b>새 항목</b>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="예: 까사 바트요 입장권" aria-label="새 체크리스트 항목" enterKeyHint="done" />
        <div className="actions">
          <select value={target} onChange={e => setTarget(e.target.value)} aria-label="연결할 일정" style={{ flex: 1 }}>
            <option value="none">연결 안 함</option>
            {data.days.map(d => (
              <optgroup key={d.id} label={`${md(d.date)} (${WD[dt(d.date).getUTCDay()]}) ${d.title}`}>
                <option value={`day:${d.id}`}>{md(d.date)} 하루 전체</option>
                {(data.itemsByDay.get(d.id) || []).map(it => <option key={it.id} value={`item:${it.id}`}>{it.time ? it.time + ' · ' : ''}{it.text}</option>)}
              </optgroup>
            ))}
          </select>
          <button className="btn" disabled={!text.trim()}>추가</button>
        </div>
      </form>}
    </div>
  );
}
