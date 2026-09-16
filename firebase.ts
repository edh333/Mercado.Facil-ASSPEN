/// <reference types="vite/client" />
import { initializeApp, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  memoryLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app;
try {
  app = getApp();
} catch {
  app = initializeApp(firebaseConfig);
}

let firestoreDb: ReturnType<typeof initializeFirestore>;

function isIndexedDBAvailable(): boolean {
  try {
    if (typeof indexedDB === 'undefined') return false;
    return true;
  } catch {
    return false;
  }
}

const indexedDBAvailable = isIndexedDBAvailable();

function initFirestoreWithStrategy() {
  if (!indexedDBAvailable) {
    console.warn("[FIREBASE] IndexedDB não disponível. Usando Memory Cache.");
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
      ignoreUndefinedProperties: true,
    });
  }

  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      ignoreUndefinedProperties: true,
    });
  } catch (error) {
    console.warn(
      "[FIREBASE] Falha ao alocar cache persistente multi-aba. Revertendo para Memory Cache...",
      error,
    );
    try {
      return initializeFirestore(app, {
        localCache: memoryLocalCache(),
        ignoreUndefinedProperties: true,
      });
    } catch (innerError) {
      console.warn(
        "[FIREBASE] Memory Cache também falhou. Inicializando sem cache local.",
        innerError,
      );
      return initializeFirestore(app, {
        ignoreUndefinedProperties: true,
      });
    }
  }
}

try {
  firestoreDb = initFirestoreWithStrategy();
} catch (error) {
  console.warn(
    "[FIREBASE] Cache local persistente não disponível. Inicializando instância padrão.",
    error,
  );
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const auth = getAuth(app);
export const storage = getStorage(app);
export const FIREBASE_API_KEY = firebaseConfig.apiKey;
