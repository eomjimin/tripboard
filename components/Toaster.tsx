'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { onToast } from '@/lib/toast';

export default function Toaster() {
  const [list, setList] = useState<{ id: number; msg: string }[]>([]);
  useEffect(() => onToast(msg => {
    const id = Date.now() + Math.random();
    setList(l => [...l.slice(-2), { id, msg }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 3000);
  }), []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {list.map(t => (
          <motion.div key={t.id} className="toast" layout
            initial={{ opacity: 0, y: 16, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}>{t.msg}</motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
