'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { useInstall } from '@/lib/install';
import { Icon, Sheet } from './ui';

/** "앱으로 설치": Chrome's install prompt where it exists, otherwise the menu steps for iPhone / Android; hidden once installed. */
export default function InstallButton({ big }: { big?: boolean }) {
  const inst = useInstall();
  const [help, setHelp] = useState(false);
  if (!inst) return null;
  if (inst.kind === 'installed') return <p className="installed"><Icon name="check" size="md" />설치됐어요. 홈 화면의 <b>트립보드</b>를 열어 주세요.</p>;
  return (
    <>
      <motion.button className={big ? 'btn big' : 'installbtn'} whileTap={{ scale: .95 }} onClick={() => (inst.kind === 'prompt' ? inst.run() : setHelp(true))}>
        <Icon name="download" size={big ? 'lg' : 'md'} />앱으로 설치
      </motion.button>
      {inst.kind === 'ios' && (
        <Sheet open={help} onClose={() => setHelp(false)} title="홈 화면에 추가" sub="아이폰은 Safari에서 이렇게 설치해요">
          <div className="stack">
            {!inst.safari && <p className="notebox">지금 브라우저에서는 설치가 안 될 수 있어요. 이 주소를 <b>Safari</b>에서 열어 주세요.</p>}
            <ol className="steps">
              {inst.menu ? (
                <>
                  <li><span className="stepn">1</span><span>아래 주소창 왼쪽의 <span className="kbd"><Icon name="pagemenu" size="md" /></span> 버튼을 누릅니다</span></li>
                  <li><span className="stepn">2</span><span><b>공유</b> <span className="kbd"><Icon name="share" size="md" /></span> 를 누릅니다</span></li>
                </>
              ) : (
                <li><span className="stepn">1</span><span>화면 아래 <b>공유</b> 버튼 <span className="kbd"><Icon name="share" size="md" /></span> 을 누릅니다</span></li>
              )}
              <li><span className="stepn">{inst.menu ? 3 : 2}</span><span>목록을 위로 올려 <b>홈 화면에 추가</b>를 누릅니다</span></li>
              <li><span className="stepn">{inst.menu ? 4 : 3}</span><span>오른쪽 위 <b>추가</b>를 누르면 홈 화면에 트립보드가 생깁니다</span></li>
            </ol>
            <p className="note-s">아이폰은 애플 정책상 버튼 한 번으로 설치할 수 없어서, Safari 메뉴에서 직접 추가해야 해요.</p>
            <button className="btn big" onClick={() => setHelp(false)}>알겠어요</button>
          </div>
        </Sheet>
      )}
      {inst.kind === 'android' && (
        <Sheet open={help} onClose={() => setHelp(false)} title="앱 설치" sub="안드로이드는 브라우저 메뉴에서 설치합니다">
          <div className="stack">
            <ol className="steps">
              <li><span className="stepn">1</span><span>오른쪽 위(또는 아래) <b>⋮</b> 메뉴를 누릅니다</span></li>
              <li><span className="stepn">2</span><span><b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 고릅니다</span></li>
              <li><span className="stepn">3</span><span><b>설치</b>를 누르면 홈 화면에 트립보드가 생깁니다</span></li>
            </ol>
            <p className="note-s">메뉴에 없으면 이 주소를 <b>Chrome</b>에서 열어 주세요.</p>
            <button className="btn big" onClick={() => setHelp(false)}>알겠어요</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
