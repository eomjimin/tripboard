'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { TripData } from '@/lib/hooks';
import { addCheck, addMember, deleteCheck, deleteItem, deleteTrip, moveItem, removeMember, savePlace, updateCheck, updateItem, updateTrip } from '@/lib/store';
import { toast } from '@/lib/toast';
import { newPlaceTag, placeOptions, tone, useTags } from '@/lib/tags';
import { dt, md, uid, WD } from '@/lib/util';
import type { Cat, Check, Day, Item, Trip } from '@/lib/types';
import { PlaceChip, PlaceEditor } from './PlaceSelect';
import { AddLine, CatChip, CatPicker, ConfirmButton, EditToggle, Icon, InlineField, Swatches, Tick } from './ui';

/** Checklist rows. Normally they can only be ticked; with `editable` the text can be changed and rows removed. */
export function CheckRows({ trip, rows, editable }: { trip: Trip; rows: Check[]; editable?: boolean }) {
  return (
    <ul className={`checks ${editable ? 'editable' : ''}`}>
      <AnimatePresence initial={false}>
        {rows.map(c => (
          <motion.li key={c.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className={c.done ? 'done' : ''}>
            <Tick done={c.done} label={`${c.text} 완료`} onToggle={() => updateCheck(trip.id, c.id, { done: !c.done })} />
            {editable
              ? <InlineField className="field ctext" value={c.text} label="체크 항목" onCommit={v => v ? updateCheck(trip.id, c.id, { text: v }) : deleteCheck(trip.id, c.id)} />
              : <span className="ctext" onClick={() => updateCheck(trip.id, c.id, { done: !c.done })}>{c.text}</span>}
            {editable ? <button className="ib del" onClick={() => deleteCheck(trip.id, c.id)} aria-label={`${c.text} 삭제`}>×</button> : <span />}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

const dayLabel = (d?: Day) => d ? `${md(d.date)} (${WD[dt(d.date).getUTCDay()]}) ${d.title || ''}` : '';

/** A card: opens read-only (tick its checklist); ✎ switches to editing. */
export function CardSheet({ trip, data, item, onClose, onManage }: { trip: Trip; data: TripData; item: Item; onClose: () => void; onManage: () => void }) {
  const [editing, setEditing] = useState(false);
  const checks = data.checksOfItem(item.id), n = checks.filter(c => c.done).length;
  return (
    <div className="stack">
      {editing ? (
        <>
          <div className="toolbar"><span className="mode">편집 중</span><EditToggle editing onToggle={() => setEditing(false)} /></div>
          <CatPicker value={item.cat} onChange={cat => updateItem(trip.id, item.id, { cat })} onManage={onManage} />
          <label className="lab">내용<InlineField className="field big" value={item.text} label="내용" placeholder="할 일 또는 장소" onCommit={text => text && updateItem(trip.id, item.id, { text })} /></label>
          <div className="row2">
            <label className="lab">시간<InlineField className="field" value={item.time} label="시간" placeholder="예: 09:30" onCommit={time => updateItem(trip.id, item.id, { time })} /></label>
            <label className="lab">날짜
              <select className="field" value={item.dayId} onChange={e => {
                const list = data.itemsByDay.get(e.target.value) || [];
                moveItem(trip.id, item.id, e.target.value, (list[list.length - 1]?.order ?? -1) + 1);
                toast(`${md(data.dayById.get(e.target.value)!.date)}로 옮겼습니다.`);
              }}>
                {data.days.map(d => <option key={d.id} value={d.id}>{dayLabel(d)}</option>)}
              </select>
            </label>
          </div>
          <section className="block">
            <div className="block-h"><b>체크리스트</b>{checks.length > 0 && <span className="n">{n}/{checks.length}</span>}</div>
            <CheckRows trip={trip} rows={checks} editable />
            <AddLine placeholder="체크할 것 (예: 입장권 예매)" label="체크리스트 추가" onAdd={t => addCheck(trip.id, t, 'item', item.id)} />
          </section>
          <div className="sheet-foot">
            <ConfirmButton label="카드 삭제" title="이 카드를 삭제할까요?" confirm={checks.length ? '카드의 체크리스트는 이 날짜에 남습니다.' : '되돌릴 수 없습니다.'}
              onConfirm={() => { deleteItem(trip.id, item, data.checks); onClose(); toast('카드를 삭제했습니다.'); }} />
          </div>
        </>
      ) : (
        <>
          <div className="cardview">
            <div className="cmeta"><CatChip cat={item.cat} />{item.time && <span className="time">{item.time}</span>}<span className="grow" /><EditToggle editing={false} onToggle={() => setEditing(true)} /></div>
            <p className="cardview-t">{item.text}</p>
          </div>
          <section className="block">
            <div className="block-h"><b>체크리스트</b>{checks.length > 0 && <span className="n">{n}/{checks.length}</span>}</div>
            {checks.length ? <CheckRows trip={trip} rows={checks} /> : <p className="muted small">체크리스트가 없습니다. ✎ 편집에서 추가할 수 있습니다.</p>}
          </section>
        </>
      )}
    </div>
  );
}

/** A day's checklist only: what to tick, grouped by card. */
export function DaySheet({ trip, data, day, openCard }: { trip: Trip; data: TripData; day: Day; openCard: (id: string) => void }) {
  const items = (data.itemsByDay.get(day.id) || []).map(it => ({ it, rows: data.checksOfItem(it.id) })).filter(x => x.rows.length);
  const dayRows = data.checksOfDay(day.id);
  const all = data.allChecksOfDay(day.id), done = all.filter(c => c.done).length;
  if (!all.length) return <p className="muted">이 날에는 체크리스트가 없습니다. 카드를 눌러 ✎ 편집에서 추가할 수 있습니다.</p>;
  return (
    <div className="stack">
      <div className="dprog"><span>{done}/{all.length} 완료</span><div className="progress"><motion.i animate={{ width: `${done / all.length * 100}%` }} /></div></div>
      {items.map(({ it, rows }) => (
        <section className="block" key={it.id}>
          <button className="block-h link" onClick={() => openCard(it.id)} title="카드 열기">
            <CatChip cat={it.cat} />{it.time && <span className="time">{it.time}</span>}<b>{it.text}</b>
            <span className="n">{rows.filter(c => c.done).length}/{rows.length}</span>
          </button>
          <CheckRows trip={trip} rows={rows} />
        </section>
      ))}
      {dayRows.length > 0 && (
        <section className="block loose">
          <div className="block-h"><b>하루 전체</b></div>
          <CheckRows trip={trip} rows={dayRows} />
        </section>
      )}
    </div>
  );
}

/** Manage card kinds (add, rename, recolour, delete) and place tags for this trip. */
export function TagManager({ trip, data }: { trip: Trip; data: TripData }) {
  const T = useTags();
  const [open, setOpen] = useState<string | null>(null);
  const [nw, setNw] = useState({ name: '', color: 'blue' });
  const saveCats = (cats: Cat[]) => updateTrip(trip.id, { cats });
  const used = (key: string) => data.items.filter(i => T.cat(i.cat).key === key).length;
  const places = placeOptions(trip, data.days);
  return (
    <div className="stack">
      <section className="block">
        <div className="block-h"><b>카드 종류</b><span className="n">{T.cats.length}개</span></div>
        <ul className="taglist">
          {T.cats.map(c => (
            <li key={c.key}>
              <div className="tagrow">
                <button className="cdot" style={{ '--k': tone(c.color) } as React.CSSProperties} onClick={() => setOpen(open === c.key ? null : c.key)}
                  aria-expanded={open === c.key} aria-label={`${c.name} 색 바꾸기`} />
                <InlineField className="ttext" value={c.name} label={`${c.name} 이름`}
                  onCommit={v => v && saveCats(T.cats.map(x => x.key === c.key ? { ...x, name: v } : x))} />
                {c.key === 'etc' ? <span className="n">기본</span> : (
                  <ConfirmButton compact label={`${c.name} 삭제`} confirm={used(c.key) ? `카드 ${used(c.key)}개 → 기타` : ''}
                    onConfirm={() => saveCats(T.cats.filter(x => x.key !== c.key))} />
                )}
              </div>
              <AnimatePresence initial={false}>
                {open === c.key && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                    <Swatches value={c.color} onChange={color => saveCats(T.cats.map(x => x.key === c.key ? { ...x, color } : x))} label={`${c.name} 색`} />
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ul>
        <form className="newtag" onSubmit={e => {
          e.preventDefault();
          const name = nw.name.trim(); if (!name) return;
          if (T.cats.some(c => c.name === name)) { toast('이미 있는 종류입니다.'); return; }
          const etcAt = T.cats.findIndex(c => c.key === 'etc');
          const next = [...T.cats]; next.splice(etcAt < 0 ? next.length : etcAt, 0, { key: uid(), name, color: nw.color });
          saveCats(next); setNw({ ...nw, name: '' });
        }}>
          <div className="addline">
            <span className="cdot" style={{ '--k': tone(nw.color) } as React.CSSProperties} aria-hidden="true" />
            <input value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} placeholder="새 종류 (예: 야경)" aria-label="새 종류 이름" />
            <button className="btn" disabled={!nw.name.trim()}>추가</button>
          </div>
          <Swatches value={nw.color} onChange={color => setNw({ ...nw, color })} label="새 종류 색" />
        </form>
      </section>
      <section className="block">
        <div className="block-h"><b>장소 태그</b><span className="n">{places.length}곳</span></div>
        {places.length > 0 && (
          <ul className="taglist">
            {places.map(p => (
              <li key={p}>
                <button className="tagrow link" onClick={() => setOpen(open === 'p:' + p ? null : 'p:' + p)} aria-expanded={open === 'p:' + p}>
                  <PlaceChip name={p} /><span /><Icon name="more" size={18} />
                </button>
                <AnimatePresence initial={false}>
                  {open === 'p:' + p && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <PlaceEditor trip={trip} days={data.days} name={p} onSaved={() => setOpen(null)} onDeleted={() => setOpen(null)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        )}
        <div className="newtag">
          <AddLine placeholder="새 장소 태그 (예: 리스본)" label="새 장소 태그" onAdd={name => {
            if (places.includes(name)) { toast(`‘${name}’ 태그가 이미 있습니다.`); return; }
            savePlace(trip.id, name, newPlaceTag(name, places.map(p => T.place(p).color)));
          }} />
        </div>

      </section>
    </div>
  );
}

/** Trip name, subtitle and (for the owner) deleting the trip. */
export function TripSettingsSheet({ trip, data, email, onDeleted, openTags, openMembers }: {
  trip: Trip; data: TripData; email: string; onDeleted: () => void; openTags: () => void; openMembers: () => void;
}) {
  const T = useTags();
  return (
    <div className="stack">
      <label className="lab">여행 이름<InlineField className="field big" value={trip.title} label="여행 이름" onCommit={v => v && updateTrip(trip.id, { title: v })} /></label>
      <label className="lab">부제 (예: 출발·도착 공항)<InlineField className="field" value={trip.tag} label="부제" placeholder="예: BCN in · BCN out" onCommit={v => updateTrip(trip.id, { tag: v })} /></label>
      <div className="navgroup">
      <button className="navrow" onClick={openMembers}>
        <Icon name="people" size={20} /><span><b>함께하는 사람</b><small>{(trip.members || []).length}명{trip.owner === email ? ' · 초대하고 뺄 수 있어요' : ''}</small></span><Icon name="back" size={16} />
      </button>
      <button className="navrow" onClick={openTags}>
        <Icon name="tag" size={20} /><span><b>태그 관리</b><small>장소 태그 {placeOptions(trip, data.days).length}개 · 카드 종류 {T.cats.length}개</small></span><Icon name="back" size={16} />
      </button>
      </div>
      {trip.owner === email ? (
        <div className="danger-zone">
          <ConfirmButton label="이 여행 삭제" title="이 여행을 삭제할까요?" confirm="날짜·카드·체크리스트가 모두 지워지고, 함께하는 사람들에게서도 사라집니다. 되돌릴 수 없습니다."
            onConfirm={() => { deleteTrip(trip.id, data); onDeleted(); toast('여행을 삭제했습니다.'); }} />
        </div>
      ) : <p className="note-s">여행 삭제는 여행을 만든 사람만 할 수 있습니다.</p>}
    </div>
  );
}

/** Hands the invitee a link that opens this trip after they sign in (phone share sheet, else copy). */
async function shareInvite(trip: Trip, to?: string) {
  const url = `${location.origin}/#${trip.id}`;
  const text = `‘${trip.title}’ 여행 일정에 초대했어요.${to ? ` ${to} 구글 계정으로 로그인하면 바로 보여요.` : ''}`;
  try {
    if (navigator.share) { await navigator.share({ title: '트립보드', text, url }); return; }
    await navigator.clipboard.writeText(`${text}\n${url}`); toast('초대 링크를 복사했습니다. 카톡 등에 붙여 넣어 보내 주세요.');
  } catch (e) { if ((e as Error)?.name !== 'AbortError') toast('링크를 보내지 못했습니다.'); }
}

/** Who can open this trip: the owner invites (then sends the link) and removes people; anyone else can leave. */
export function MembersSheet({ trip, email, onLeft }: { trip: Trip; email: string; onLeft: () => void }) {
  const owner = trip.owner === email;
  const [mem, setMem] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const members = trip.members || [];
  return (
    <div className="stack">
      <ul className="members">
        <AnimatePresence initial={false}>
          {members.map(m => (
            <motion.li key={m} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
              <span className="avatar sm" aria-hidden="true">{m[0]?.toUpperCase()}</span>
              <span className="who"><span>{m}</span>{(m === trip.owner || m === email) && <small>{[m === trip.owner && '만든 사람', m === email && '나'].filter(Boolean).join(' · ')}</small>}</span>
              {owner && m !== trip.owner && <ConfirmButton compact label={`${m} 빼기`} confirm="" onConfirm={() => removeMember(trip.id, m)} />}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {owner ? (
        <form className="stack sm" onSubmit={e => {
          e.preventDefault();
          const v = mem.trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast('이메일 주소를 확인해 주세요.'); return; }
          if (members.includes(v)) { toast('이미 함께하는 사람입니다.'); return; }
          addMember(trip.id, v); setMem(''); setSent(v);
        }}>
          <div className="addline">
            <input type="email" value={mem} onChange={e => setMem(e.target.value)} placeholder="동행자 구글 이메일" aria-label="초대할 이메일" autoComplete="off" />
            <button className="btn" disabled={!mem.trim()}>초대</button>
          </div>
          <AnimatePresence initial={false}>
            {sent ? (
              <motion.div key="sent" className="invite-next" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p><Icon name="check" size={16} /><span><b>{sent}</b> 님을 추가했어요. 아직 알림은 가지 않았으니 링크를 보내 주세요.</span></p>
                <button type="button" className="btn big" onClick={() => shareInvite(trip, sent)}><Icon name="share" size={18} />초대 링크 보내기</button>
              </motion.div>
            ) : (
              <motion.p key="hint" className="note-s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                추가한 뒤 초대 링크를 보내면, 그 사람이 자기 구글 계정으로 로그인했을 때 이 여행이 바로 열립니다.{' '}
                <button type="button" className="linkbtn" onClick={() => shareInvite(trip)}>링크만 보내기</button>
              </motion.p>
            )}
          </AnimatePresence>
        </form>
      ) : (
        <div className="stack sm">
          <p className="note-s">사람 추가와 삭제는 여행을 만든 사람만 할 수 있습니다.</p>
          <div className="danger-zone">
            <ConfirmButton label="이 여행에서 나가기" title="이 여행에서 나갈까요?" confirm="목록에서 사라지고, 다시 들어오려면 만든 사람이 초대해야 합니다."
              onConfirm={() => { removeMember(trip.id, email); onLeft(); toast(`‘${trip.title}’에서 나왔습니다.`); }} />
          </div>
        </div>
      )}
    </div>
  );
}
