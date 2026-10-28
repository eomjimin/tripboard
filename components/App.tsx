'use client';
import { useEffect, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthUser, useTrips } from '@/lib/hooks';
import { APP_NAME } from '@/lib/config';
import { toast } from '@/lib/toast';
import TripList from './TripList';
import TripView from './TripView';
import Toaster from './Toaster';

function useServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // when a newly deployed version takes over, reload once so the screen matches it
    const had = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const on = () => { if (had && !reloaded) { reloaded = true; location.reload(); } };
    navigator.serviceWorker.addEventListener('controllerchange', on);
    navigator.serviceWorker.register('/sw.js').then(r => r.update()).catch(() => {});
    return () => navigator.serviceWorker.removeEventListener('controllerchange', on);
  }, []);
}

function signIn() {
  const p = new GoogleAuthProvider();
  signInWithPopup(auth, p).catch(e => {
    // home-screen apps and some mobile browsers block popups; fall back to a full-page redirect
    if (/popup|cancelled|operation-not-supported/.test(e?.code || '')) signInWithRedirect(auth, p);
    else toast('로그인하지 못했습니다. 다시 시도해 주세요.');
  });
}

export default function App() {
  useServiceWorker();
  const user = useAuthUser();
  const email = user?.email?.toLowerCase() ?? null;
  const trips = useTrips(email);
  const [tripId, setTripId] = useState<string | null>(() => location.hash.slice(1) || null);
  useEffect(() => {
    const on = () => setTripId(location.hash.slice(1) || null);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const trip = tripId && trips ? trips.find(t => t.id === tripId) : undefined;
  useEffect(() => { document.title = trip ? `${trip.title} · ${APP_NAME}` : APP_NAME; }, [trip]);

  const open = (id: string) => { location.hash = id; window.scrollTo(0, 0); };
  const back = () => { history.pushState(null, '', location.pathname); setTripId(null); };

  let screen: React.ReactNode;
  if (user === undefined || (user && trips === null)) screen = <Gate title="불러오는 중입니다…" />;
  else if (!user) screen = (
    <Gate title="로그인하고 일정을 열어 주세요">
      <p>초대된 구글 계정으로 로그인하면 일정을 보고 고칠 수 있습니다.</p>
      <button className="btn big" onClick={signIn}>Google 계정으로 로그인</button>
    </Gate>
  );
  else if (trip) screen = <TripView key={trip.id} trip={trip} email={email!} onBack={back} />;
  else screen = <TripList trips={trips!} email={email!} onOpen={open} />;

  return (
    <>
      <div className="wrap">{screen}</div>
      <Toaster />
    </>
  );
}

function Gate({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="gate">
      <div className="eyebrow">날짜별 여행 일정 보드</div>
      <h1>{APP_NAME}</h1>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
