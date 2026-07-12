import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// Client config is not secret — it's meant to be embedded in every built
// bundle (Firebase project isolation comes from Security Rules + the server
// verifying ID tokens, not from hiding these values). Values default to the
// real `smartinvestorcrm` Firebase project; override via .env for a
// different project (e.g. local dev against a sandbox project).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyBIcIco4I2TJi8XrUcgRVM8DxJHCfp3ZXY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'smartinvestorcrm.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'smartinvestorcrm',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'smartinvestorcrm.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '576601480079',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? 'smartinvestorcrm',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Auth/Firestore emulator support for local dev — never enabled in a real
// build since it requires an explicit opt-in flag, not just import.meta.env.DEV.
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
}
