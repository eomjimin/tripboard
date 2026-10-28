'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { APP_NAME } from '@/lib/config';
import { createTrip } from '@/lib/store';
import { toast } from '@/lib/toast';
import { addDays, diff, md, todayId } from '@/lib/util';
import type { Trip } from '@/lib/types';
import { Icon, Sheet } from './ui';

export default function TripList({ trips, email, onOpen }: { trips: Trip[]; email: string; onOpen: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [acct, setAcct] = useState(false);
  const t = todayId();
  const sorted = [...trips].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const upcoming = sorted.filter(x => !x.end || x.end >= t), past = sorted.filter(x => x.end && x.end < t).reverse();

  const card = (x: Trip, i: number) => {
    const u = x.start ? diff(t, x.start) : null, n = x.start && x.end ? diff(x.start, x.end) : null;
    const now = u !== null && u <= 0 && x.end >= t;
    const when = u === null ? '' : u > 0 ? `D-${u}` : now ? `여행 ${1 - u}일차` : '다녀옴';
    return (
      <motion.button key={x.id} className={`tripcard ${now ? 'now' : ''}`} onClick={() => onOpen(x.id)}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .04 }}
        whileHover={{ y: -2 }} whileTap={{ scale: .98 }}>
        <span className="tc-top">{x.tag ? <span className="eyebrow">{x.tag}</span> : <span />}{when && <span className="tc-when">{when}</span>}</span>
        <b>{x.title || '이름 없는 여행'}</b>
        <span className="tc-foot">
          <span className="tc-dates">{x.start ? `${x.start.replace(/-/g, '.')} – ${md(x.end).replace('/', '.')} · ${n}박 ${(n ?? 0) + 1}일` : '날짜 미정'}</span>
          <span className="tc-who"><Icon name="people" size={14} />{(x.members || []).length}</span>
        </span>
      </motion.button>
    );
  };

  return (
    <>
      <header className="home-top">
        <div><div className="eyebrow">날짜별 여행 일정 보드</div><h1>{APP_NAME}</h1></div>
        <motion.button className="avatar" onClick={() => setAcct(true)} whileTap={{ scale: .9 }} aria-label={`계정 (${email})`}>{email[0]?.toUpperCase()}</motion.button>
      </header>
      <section className="trips">
        {upcoming.map(card)}
        <motion.button className="tripcard addtrip" onClick={() => setCreating(true)} whileTap={{ scale: .98 }}><Icon name="plus" size={22} />새 여행 만들기</motion.button>
      </section>
      {past.length > 0 && <><h2 className="past-h">지난 여행</h2><section className="trips past">{past.map(card)}</section></>}
      <Sheet open={acct} onClose={() => setAcct(false)} title="계정" sub={email}>
        <div className="stack">
          <p className="note-s">이 계정으로 초대된 여행만 목록에 보입니다.</p>
          <button className="btn sec big" onClick={() => signOut(auth)}><Icon name="out" size={18} />로그아웃</button>
        </div>
      </Sheet>
      <Sheet open={creating} onClose={() => setCreating(false)} title="새 여행">
        <NewTrip onDone={id => { setCreating(false); onOpen(id); }} email={email} />
      </Sheet>
    </>
  );
}

function NewTrip({ email, onDone }: { email: string; onDone: (id: string) => void }) {
  const t = todayId();
  const [f, setF] = useState({ title: '', tag: '', start: t, end: addDays(t, 4) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="form plain" onSubmit={e => {
      e.preventDefault();
      if (!f.title.trim()) return;
      if (f.end < f.start) { toast('귀국일이 출발일보다 빠릅니다.'); return; }
      if (diff(f.start, f.end) > 60) { toast('여행 기간은 60일까지 만들 수 있습니다.'); return; }
      onDone(createTrip(email, { ...f, title: f.title.trim(), tag: f.tag.trim() }));
    }}>
      <label>여행 이름<input value={f.title} onChange={set('title')} placeholder="예: 도쿄 벚꽃 여행" required autoFocus /></label>
      <label>부제 (선택)<input value={f.tag} onChange={set('tag')} placeholder="예: ICN ⇄ HND" /></label>
      <div className="row2">
        <label>출발<input type="date" value={f.start} onChange={set('start')} required /></label>
        <label>귀국<input type="date" value={f.end} onChange={set('end')} required /></label>
      </div>
      <p className="note-s">기간 안의 날짜 칼럼이 자동으로 만들어집니다.</p>
      <div className="actions"><button className="btn">만들기</button></div>
    </form>
  );
}
