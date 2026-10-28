import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from './config';

const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const auth = getAuth(app);

// The local cache keeps the plan readable and editable offline; writes sync when the phone is back online.
let firestore: Firestore;
try {
  firestore = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch {
  firestore = getFirestore(app);
}
export const db = firestore;
