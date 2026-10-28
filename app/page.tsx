'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Firebase (auth, offline cache) only runs in the browser, so the app renders client-side.
const App = dynamic(() => import('@/components/App'), { ssr: false, loading: () => <div className="boot" /> });
// Development-only preview with local seed data (?demo); not part of the production build.
const Demo = process.env.NODE_ENV === 'development' ? dynamic(() => import('@/components/Demo'), { ssr: false }) : null;

export default function Page() {
  const [demo, setDemo] = useState(false);
  useEffect(() => { if (Demo && location.search.includes('demo')) setDemo(true); }, []);
  return demo && Demo ? <Demo /> : <App />;
}
