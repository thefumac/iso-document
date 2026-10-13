import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// Firebase 클라이언트 설정
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKeyForIsoDocumentProject2026",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "iso-document-b3142.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "iso-document-b3142",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "iso-document-b3142.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1053205248947",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1053205248947:web:c672b14643b171bf9e2026"
};

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

export default app;
