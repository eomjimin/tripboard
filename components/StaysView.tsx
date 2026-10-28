'use client';
import { addDays, dt, md, WD } from '@/lib/util';
import { useTags } from '@/lib/tags';
import type { Day } from '@/lib/types';

export default function StaysView({ days, groups, onJump, onPlace }: {
  days: Day[]; groups: { city: string; start: string; end: string; ids: string[] }[]; onJump: (dayId: string) => void; onPlace: (name: string) => void;
}) {
  const P = useTags();
  const total = groups.reduce((s, g) => s + g.ids.length, 0);
  const wd = (d: string) => WD[dt(d).getUTCDay()];
  return (
    <div className="sheetview">
      <table className="stays">
        <thead><tr><th>체크인</th><th>체크아웃</th><th>장소</th><th className="num">박</th></tr></thead>
        <tbody>
          {groups.map(g => (
            <tr key={g.start} style={{ '--c': P.color(g.city) } as React.CSSProperties} onClick={() => onJump(g.ids[0])}>
              <td className="mono">{md(g.start)} {wd(g.start)}</td>
              <td className="mono">{md(addDays(g.end, 1))} {wd(addDays(g.end, 1))}</td>
              <td><button className="code" onClick={e => { e.stopPropagation(); onPlace(g.city); }} aria-label={`${g.city} 태그 바꾸기`}>{P.code(g.city)}</button> {g.city}</td>
              <td className="num">{g.ids.length}</td>
            </tr>
          ))}
          {!groups.length && <tr><td colSpan={4} className="muted">숙박이 지정된 날짜가 없습니다.</td></tr>}
        </tbody>
        <tfoot><tr><td colSpan={3}>합계 ({days.length}일 중)</td><td className="num">{total}박</td></tr></tfoot>
      </table>
      <p className="note-s">보드의 각 날짜에서 ‘숙박’ 칸을 바꾸면 자동으로 다시 계산됩니다.</p>
    </div>
  );
}
